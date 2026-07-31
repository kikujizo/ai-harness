#!/usr/bin/env node
'use strict';

// Issue #122: Issue本文の固定manifestと、指定base SHAからPR headまでの実差分を機械照合する。
// CLI契約はIssue本文が定義する `--repo --issue --head` のみ。
// 「Related Issue: #<n>」行の抽出・検証は本checkerの責務ではなく、呼び出し元の
// `.github/workflows/issue-manifest-diff.yml` 側で行い、決定済みのissue番号だけを渡す。

const { execFileSync } = require('node:child_process');
const { Buffer } = require('node:buffer');

const RESULT_HEADER = 'ISSUE_MANIFEST_DIFF';
const VALID_OPS = new Set(['add', 'modify', 'delete']);
const BASE_SHA_RE = /^[0-9a-f]{40}$/;
const START_MARKER = '<!-- issue-change-manifest:v1:start -->';
const END_MARKER = '<!-- issue-change-manifest:v1:end -->';
// Issue本文の禁止規則「. / .. / 空文字 / glob / 重複path」のうち、globは文字集合として
// 固定する必要がある。ここでは代表的なglob特殊文字を禁止対象とする（実装判断・PR本文に明記）。
const GLOB_CHARS_RE = /[*?[\]{}]/;
// Issue本文の「pathはリポジトリルート相対、`/`区切り」規則より、バックスラッシュ区切りや
// Windowsドライブ形式（`C:\...` 等）はroot相対pathとして無効とする。
const BACKSLASH_RE = /\\/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:/;

class UsageError extends Error {}

class StopResult extends Error {
  constructor(result, stopReason, extraLines) {
    super(`${result}:${stopReason}`);
    this.result = result;
    this.stopReason = stopReason;
    this.extraLines = extraLines || [];
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--repo') {
      out.repo = argv[i + 1];
      i += 1;
    } else if (token === '--issue') {
      out.issue = argv[i + 1];
      i += 1;
    } else if (token === '--head') {
      out.head = argv[i + 1];
      i += 1;
    } else {
      throw new UsageError(`unknown argument: ${token}`);
    }
  }
  if (!out.repo || !out.issue || !out.head) {
    throw new UsageError('missing required --repo/--issue/--head');
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(out.repo)) {
    throw new UsageError(`invalid --repo value: ${out.repo}`);
  }
  if (!/^[1-9][0-9]*$/.test(out.issue)) {
    throw new UsageError(`invalid --issue value: ${out.issue}`);
  }
  return out;
}

async function defaultFetchIssueBody(repo, issueNumber) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'issue-manifest-diff-checker',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, { headers });
  } catch {
    throw new StopResult('blocked', 'issue_unavailable');
  }
  if (!response.ok) {
    throw new StopResult('blocked', 'issue_unavailable');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new StopResult('blocked', 'issue_unavailable');
  }
  if (!payload || typeof payload.body !== 'string') {
    throw new StopResult('blocked', 'issue_unavailable');
  }
  return payload.body;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function extractJsonText(between) {
  const fenced = between.match(/```json\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : between;
}

function validatePathRule(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (path.startsWith('/') || path.endsWith('/')) return false;
  if (GLOB_CHARS_RE.test(path)) return false;
  if (BACKSLASH_RE.test(path)) return false;
  if (WINDOWS_DRIVE_RE.test(path)) return false;
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return false;
  }
  return true;
}

function validateManifestSchema(manifest) {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new StopResult('blocked', 'manifest_schema_invalid');
  }
  if (manifest.schema !== 'issue-change-manifest/v1') {
    throw new StopResult('blocked', 'manifest_schema_invalid');
  }
  if (typeof manifest.base_sha !== 'string') {
    throw new StopResult('blocked', 'manifest_schema_invalid');
  }
  if (!BASE_SHA_RE.test(manifest.base_sha)) {
    throw new StopResult('blocked', 'base_sha_invalid');
  }
  if (!Array.isArray(manifest.changes) || manifest.changes.length === 0) {
    throw new StopResult('blocked', 'manifest_schema_invalid');
  }
  const seenPaths = new Set();
  for (const change of manifest.changes) {
    if (typeof change !== 'object' || change === null || Array.isArray(change)) {
      throw new StopResult('blocked', 'manifest_schema_invalid');
    }
    if (!VALID_OPS.has(change.op)) {
      throw new StopResult('blocked', 'manifest_schema_invalid');
    }
    if (!validatePathRule(change.path)) {
      throw new StopResult('blocked', 'manifest_schema_invalid');
    }
    if (seenPaths.has(change.path)) {
      throw new StopResult('blocked', 'manifest_schema_invalid');
    }
    seenPaths.add(change.path);
  }
}

function extractManifest(issueBody) {
  const startCount = countOccurrences(issueBody, START_MARKER);
  const endCount = countOccurrences(issueBody, END_MARKER);

  if (startCount === 0 && endCount === 0) {
    throw new StopResult('blocked', 'manifest_missing');
  }
  // start/endがそれぞれ正確に1件、かつ start が end より前にある場合のみ有効。
  // それ以外の組み合わせ（複数件、片方欠落、順序逆転）は一意な単一blockを
  // 取り出せないため、まとめて manifest_ambiguous とする（実装判断・PR本文に明記）。
  const startIdx = issueBody.indexOf(START_MARKER);
  const endIdx = issueBody.indexOf(END_MARKER);
  if (startCount !== 1 || endCount !== 1 || endIdx <= startIdx) {
    throw new StopResult('blocked', 'manifest_ambiguous');
  }

  const between = issueBody.slice(startIdx + START_MARKER.length, endIdx);
  const jsonText = extractJsonText(between);
  let manifest;
  try {
    manifest = JSON.parse(jsonText);
  } catch {
    throw new StopResult('blocked', 'manifest_invalid_json');
  }
  validateManifestSchema(manifest);
  return manifest;
}

function git(args, cwd) {
  // stdio: execFileSyncは既定でstderrを親プロセスへinheritするため、想定内の失敗
  // （rev-parse --verify不能・merge-base非ancestor等）でも生のgit fatalメッセージが
  // 出力に漏れる。呼び出し側でエラーハンドリングする前提のため、明示的にpipeで捕捉する。
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveCommit(sha, cwd) {
  try {
    return git(['rev-parse', '--verify', `${sha}^{commit}`], cwd).trim();
  } catch {
    return null;
  }
}

function isAncestor(baseSha, headSha, cwd) {
  try {
    git(['merge-base', '--is-ancestor', baseSha, headSha], cwd);
    return true;
  } catch {
    return false;
  }
}

function computeActualChanges(baseSha, headSha, cwd) {
  let raw;
  try {
    // --no-renames: rename検出を明示的に無効化し、rename を delete(旧path)+add(新path) として
    // 正規化する（Issue本文の正規化規則そのもの）。copy検出（-C/--find-copies）も付与しないため、
    // copyは新pathのadd、旧pathが別途変更されていればmodifyとして自然に現れる。
    raw = git(['diff', '--no-renames', '--name-status', '-z', baseSha, headSha], cwd);
  } catch {
    throw new StopResult('blocked', 'checker_internal_error');
  }

  const tokens = raw.split('\u0000').filter((token) => token.length > 0);
  const changes = [];
  let i = 0;
  while (i < tokens.length) {
    const statusLetter = tokens[i][0];
    if (statusLetter === 'A') {
      changes.push({ op: 'add', path: tokens[i + 1] });
      i += 2;
    } else if (statusLetter === 'D') {
      changes.push({ op: 'delete', path: tokens[i + 1] });
      i += 2;
    } else if (statusLetter === 'M' || statusLetter === 'T') {
      // M: 内容・mode変更・submodule SHA変更。T: 型変更（symlink化等の先変更を含む）。
      // いずれもIssue本文の規則では modify に正規化する。
      changes.push({ op: 'modify', path: tokens[i + 1] });
      i += 2;
    } else {
      // --no-renames指定下でR/Cが出た場合を含め、未知statusはfail-closedでblockedとする。
      throw new StopResult('blocked', 'diff_status_unknown');
    }
  }
  return changes;
}

function toChangeMap(changes) {
  const map = new Map();
  for (const { op, path } of changes) {
    if (map.has(path)) {
      // git diffは同一base..head比較で同一pathを2回報告しない想定。観測されたら
      // 入力不正として停止する（Issue本文「重複があれば入力不正として停止する」に対応）。
      throw new StopResult('blocked', 'checker_internal_error');
    }
    map.set(path, op);
  }
  return map;
}

function compareBytes(a, b) {
  // Issue本文「path一覧はbyte順でsortして比較する」に対応。JS標準の文字列比較は
  // UTF-16コード単位順であり、サロゲートペア（絵文字等）を含むとUTF-8のbyte順と
  // 逆転しうるため、UTF-8エンコード後のbyte列で比較する。
  return Buffer.from(a, 'utf8').compare(Buffer.from(b, 'utf8'));
}

function compareChanges(manifestChanges, actualChangeMap) {
  const manifestKeys = manifestChanges.map(({ op, path }) => `${path}:${op}`);
  const actualKeys = [...actualChangeMap.entries()].map(([path, op]) => `${path}:${op}`);
  const manifestKeySet = new Set(manifestKeys);
  const actualKeySet = new Set(actualKeys);

  const unexpected = [...actualKeySet].filter((key) => !manifestKeySet.has(key)).sort(compareBytes);
  const missing = [...manifestKeySet].filter((key) => !actualKeySet.has(key)).sort(compareBytes);
  return { unexpected, missing };
}

function printResult(lines) {
  process.stdout.write(`${RESULT_HEADER}\n`);
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
}

async function runChecker({ repo, issue, head, cwd, fetchIssueBody }) {
  const fetchFn = fetchIssueBody || defaultFetchIssueBody;

  try {
    const issueBody = await fetchFn(repo, issue);
    const manifest = extractManifest(issueBody);

    const baseResolved = resolveCommit(manifest.base_sha, cwd);
    if (!baseResolved) {
      throw new StopResult('blocked', 'base_sha_unresolved');
    }

    const headResolved = resolveCommit(head, cwd);
    if (!headResolved) {
      throw new StopResult('blocked', 'head_sha_unresolved');
    }

    if (!isAncestor(manifest.base_sha, head, cwd)) {
      throw new StopResult('blocked', 'base_sha_not_ancestor');
    }

    const actualChangesList = computeActualChanges(manifest.base_sha, head, cwd);
    const actualChangeMap = toChangeMap(actualChangesList);
    const { unexpected, missing } = compareChanges(manifest.changes, actualChangeMap);

    if (unexpected.length > 0 || missing.length > 0) {
      const lines = [];
      for (const key of unexpected) lines.push(`unexpected_change=${key}`);
      for (const key of missing) lines.push(`missing_change=${key}`);
      // 余分な変更（manifest外差分の混入）は不足変更より危険側のため、両方存在する場合は
      // diff_not_in_manifest を優先stop_reasonとする（実装判断・PR本文に明記）。
      const stopReason = unexpected.length > 0 ? 'diff_not_in_manifest' : 'manifest_change_missing';
      return {
        exitCode: 1,
        lines: ['result=fail', ...lines, `stop_reason=${stopReason}`],
      };
    }

    return {
      exitCode: 0,
      lines: [
        'result=pass',
        `issue_number=${issue}`,
        `base_sha=${manifest.base_sha}`,
        `head_sha=${head}`,
        `manifest_change_count=${manifest.changes.length}`,
        `actual_change_count=${actualChangesList.length}`,
        'stop_reason=none',
      ],
    };
  } catch (err) {
    if (err instanceof StopResult) {
      return {
        exitCode: 1,
        lines: [`result=${err.result}`, `stop_reason=${err.stopReason}`, ...err.extraLines],
      };
    }
    throw err;
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`usage error: ${err.message}\n`);
    process.stderr.write(
      'usage: node issue-manifest-diff.cjs --repo <owner/repo> --issue <number> --head <commit_sha>\n',
    );
    process.exitCode = 2;
    return;
  }

  try {
    const { exitCode, lines } = await runChecker({
      repo: args.repo,
      issue: args.issue,
      head: args.head,
      cwd: process.cwd(),
    });
    printResult(lines);
    process.exitCode = exitCode;
  } catch (err) {
    if (err instanceof StopResult) {
      printResult([`result=${err.result}`, `stop_reason=${err.stopReason}`, ...err.extraLines]);
      process.exitCode = 1;
      return;
    }
    printResult(['result=blocked', 'stop_reason=checker_internal_error']);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runChecker,
  extractManifest,
  validateManifestSchema,
  validatePathRule,
  computeActualChanges,
  toChangeMap,
  compareChanges,
  compareBytes,
  resolveCommit,
  isAncestor,
  parseArgs,
  StopResult,
  UsageError,
};
