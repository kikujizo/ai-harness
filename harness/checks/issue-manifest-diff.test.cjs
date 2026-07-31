'use strict';

// Issue #122: issue-manifest-diff.cjs の正常系・異常系をfixtureで再現するテスト。
// node:test / node:assert のみを使用（外部npm packageを追加しない）。
// fixture構築（git init・実コミット）が失敗した場合はテスト自体が例外で落ち、
// skip・終了コード0扱いにはしない（意図的にtry/catchで握り潰さない）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const checker = require('./issue-manifest-diff.cjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-manifest-diff-'));
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'user.name', 'Issue Manifest Diff Test'], dir);
  git(['config', 'core.autocrlf', 'false'], dir);
  return dir;
}

function writeAndCommit(dir, relPath, content, message) {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  git(['add', relPath], dir);
  git(['commit', '-q', '-m', message], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

function removeAndCommit(dir, relPath, message) {
  git(['rm', '-q', relPath], dir);
  git(['commit', '-q', '-m', message], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

function hashObject(dir, content) {
  const tmp = path.join(dir, `.blob-input-${Date.now()}-${Math.random()}`);
  fs.writeFileSync(tmp, content);
  const sha = git(['hash-object', '-w', tmp], dir);
  fs.rmSync(tmp);
  return sha;
}

function setCacheInfo(dir, mode, blobSha, relPath, { add } = { add: false }) {
  const args = ['update-index'];
  if (add) args.push('--add');
  args.push('--cacheinfo', `${mode},${blobSha},${relPath}`);
  git(args, dir);
}

function commitIndex(dir, message) {
  git(['commit', '-q', '-m', message], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function manifestBody(manifest) {
  return [
    '説明文。',
    '',
    '<!-- issue-change-manifest:v1:start -->',
    '```json',
    JSON.stringify(manifest, null, 2),
    '```',
    '<!-- issue-change-manifest:v1:end -->',
    '',
  ].join('\n');
}

function fetcherFor(body) {
  return async () => body;
}

test('exact match: manifestと実差分が一致すればpass', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'kept.txt', 'kept\n', 'base');
    fs.writeFileSync(path.join(dir, 'kept.txt'), 'kept\nmore\n');
    fs.mkdirSync(path.join(dir, 'new'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'new', 'file.txt'), 'new\n');
    fs.mkdirSync(path.join(dir, 'gen'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'gen', 'bundle.generated.js'), '// generated\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'head'], dir);
    const headSha = git(['rev-parse', 'HEAD'], dir);

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [
        { op: 'modify', path: 'kept.txt' },
        { op: 'add', path: 'new/file.txt' },
        { op: 'add', path: 'gen/bundle.generated.js' },
      ],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(result.lines.includes('stop_reason=none'));
  } finally {
    cleanup(dir);
  }
});

test('generated fileもmanifestから漏れていれば通常ファイルと同様にfailする', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'kept.txt', 'kept\n', 'base');
    fs.mkdirSync(path.join(dir, 'gen'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'gen', 'bundle.generated.js'), '// generated\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'head'], dir);
    const headSha = git(['rev-parse', 'HEAD'], dir);

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'modify', path: 'kept.txt' }],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('unexpected_change=gen/bundle.generated.js:add'));
    assert.ok(result.lines.includes('stop_reason=diff_not_in_manifest'));
  } finally {
    cleanup(dir);
  }
});

test('余分な変更（manifest外差分）はfail/diff_not_in_manifest', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'kept.txt', 'kept\n', 'base');
    fs.writeFileSync(path.join(dir, 'extra.txt'), 'extra\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'head'], dir);
    const headSha = git(['rev-parse', 'HEAD'], dir);

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'add', path: 'other.txt' }],
    };
    // manifestが宣言するpath自体は実差分に存在しないため、missingとunexpectedが両方出る。
    // unexpectedがあるので stop_reason は diff_not_in_manifest を優先する。

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('unexpected_change=extra.txt:add'));
    assert.ok(result.lines.includes('missing_change=other.txt:add'));
    assert.ok(result.lines.includes('stop_reason=diff_not_in_manifest'));
  } finally {
    cleanup(dir);
  }
});

test('不足変更（manifest記載だが実差分になし）のみはfail/manifest_change_missing', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'kept.txt', 'kept\n', 'base');
    // headはbaseと同一内容のコミットのみ（実差分なし）
    fs.writeFileSync(path.join(dir, 'unrelated.txt'), 'noop\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'noop'], dir);
    const headSha = git(['rev-parse', 'HEAD'], dir);

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [
        { op: 'add', path: 'unrelated.txt' },
        { op: 'modify', path: 'kept.txt' },
      ],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('missing_change=kept.txt:modify'));
    assert.ok(!result.lines.some((line) => line.startsWith('unexpected_change=')));
    assert.ok(result.lines.includes('stop_reason=manifest_change_missing'));
  } finally {
    cleanup(dir);
  }
});

test('rename: delete(旧path)+add(新path)へ正規化してmanifestと一致すればpass', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'old/name.txt', 'content\n', 'base');
    fs.mkdirSync(path.join(dir, 'new'), { recursive: true });
    fs.renameSync(path.join(dir, 'old', 'name.txt'), path.join(dir, 'new', 'name.txt'));
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'rename'], dir);
    const headSha = git(['rev-parse', 'HEAD'], dir);

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [
        { op: 'delete', path: 'old/name.txt' },
        { op: 'add', path: 'new/name.txt' },
      ],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('delete: 削除されたpathはdeleteとして一致する', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'gone.txt', 'bye\n', 'base');
    const headSha = removeAndCommit(dir, 'gone.txt', 'remove');

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'delete', path: 'gone.txt' }],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('mode変更のみ（100644→100755）はmodifyとして一致する', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'script.sh', 'echo hi\n', 'base');
    git(['update-index', '--chmod=+x', 'script.sh'], dir);
    const headSha = commitIndex(dir, 'chmod +x');

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'modify', path: 'script.sh' }],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('symlink先変更（120000のblob変更）はmodifyとして一致する', async () => {
  const dir = makeRepo();
  try {
    const blobA = hashObject(dir, 'target-v1');
    setCacheInfo(dir, '120000', blobA, 'link.txt', { add: true });
    const baseSha = commitIndex(dir, 'base symlink');

    const blobB = hashObject(dir, 'target-v2');
    setCacheInfo(dir, '120000', blobB, 'link.txt', { add: false });
    const headSha = commitIndex(dir, 'change symlink target');

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'modify', path: 'link.txt' }],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('submodule SHA変更（160000のgitlink変更）はmodifyとして一致する', async () => {
  const dir = makeRepo();
  try {
    const shaA = '1111111111111111111111111111111111111111';
    setCacheInfo(dir, '160000', shaA, 'vendor/mod', { add: true });
    const baseSha = commitIndex(dir, 'base submodule pointer');

    const shaB = '2222222222222222222222222222222222222222';
    setCacheInfo(dir, '160000', shaB, 'vendor/mod', { add: false });
    const headSha = commitIndex(dir, 'change submodule pointer');

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'modify', path: 'vendor/mod' }],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('型変更（regular file→symlink）もmodifyとして一致する', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'thing.txt', 'plain content\n', 'base');
    const blob = hashObject(dir, 'target');
    setCacheInfo(dir, '120000', blob, 'thing.txt', { add: false });
    const headSha = commitIndex(dir, 'typechange to symlink');

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'modify', path: 'thing.txt' }],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('manifest欠落（marker無し）はblocked/manifest_missing', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const headSha = baseSha;

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor('manifestなしの本文です。'),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=manifest_missing']);
  } finally {
    cleanup(dir);
  }
});

test('manifest重複（start markerが2件）はblocked/manifest_ambiguous', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'add', path: 'a.txt' }],
    };
    const body = `${manifestBody(manifest)}\n${manifestBody(manifest)}`;

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: baseSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=manifest_ambiguous']);
  } finally {
    cleanup(dir);
  }
});

test('manifestが不正JSONはblocked/manifest_invalid_json', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const body = [
      '<!-- issue-change-manifest:v1:start -->',
      '```json',
      '{ this is not valid json',
      '```',
      '<!-- issue-change-manifest:v1:end -->',
    ].join('\n');

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: baseSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=manifest_invalid_json']);
  } finally {
    cleanup(dir);
  }
});

test('manifest内で重複pathはblocked/manifest_schema_invalid', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [
        { op: 'add', path: 'a.txt' },
        { op: 'modify', path: 'a.txt' },
      ],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: baseSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=manifest_schema_invalid']);
  } finally {
    cleanup(dir);
  }
});

test('manifestのop不正はblocked/manifest_schema_invalid', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const body = manifestBody({
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'rename', path: 'a.txt' }],
    });

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: baseSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=manifest_schema_invalid']);
  } finally {
    cleanup(dir);
  }
});

test('不正なbase_sha形式（40桁hexでない）はblocked/base_sha_invalid', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const body = manifestBody({
      schema: 'issue-change-manifest/v1',
      base_sha: 'not-a-sha',
      changes: [{ op: 'add', path: 'a.txt' }],
    });

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: baseSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=base_sha_invalid']);
  } finally {
    cleanup(dir);
  }
});

test('base_shaが解決不能（存在しないcommit）はblocked/base_sha_unresolved', async () => {
  const dir = makeRepo();
  try {
    const headSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const fakeSha = '0'.repeat(40);
    const body = manifestBody({
      schema: 'issue-change-manifest/v1',
      base_sha: fakeSha,
      changes: [{ op: 'add', path: 'a.txt' }],
    });

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=base_sha_unresolved']);
  } finally {
    cleanup(dir);
  }
});

test('head_shaが解決不能はblocked/head_sha_unresolved', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const body = manifestBody({
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'add', path: 'a.txt' }],
    });

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: 'deadbeef'.repeat(5),
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=head_sha_unresolved']);
  } finally {
    cleanup(dir);
  }
});

test('base_shaがheadの祖先でない（非ancestor）はblocked/base_sha_not_ancestor', async () => {
  const dir = makeRepo();
  try {
    writeAndCommit(dir, 'a.txt', 'a\n', 'commit-1');
    const branchPointSha = git(['rev-parse', 'HEAD'], dir);

    // mainから分岐した無関係のbranchをbase_shaにする
    git(['checkout', '-q', '-b', 'unrelated-branch'], dir);
    const unrelatedSha = writeAndCommit(dir, 'unrelated.txt', 'x\n', 'unrelated');

    git(['checkout', '-q', '-b', 'main-continue', branchPointSha], dir);
    const headSha = writeAndCommit(dir, 'b.txt', 'b\n', 'commit-2-on-main-line');

    const body = manifestBody({
      schema: 'issue-change-manifest/v1',
      base_sha: unrelatedSha,
      changes: [{ op: 'add', path: 'b.txt' }],
    });

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=base_sha_not_ancestor']);
  } finally {
    cleanup(dir);
  }
});

test('fetchIssueBodyがStopResultを投げた場合、runCheckerはblocked結果として返す（issue_unavailable相当）', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: baseSha,
      cwd: dir,
      fetchIssueBody: async () => {
        throw new checker.StopResult('blocked', 'issue_unavailable');
      },
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=issue_unavailable']);
  } finally {
    cleanup(dir);
  }
});

test('parseArgs: 必須引数欠落はUsageError', () => {
  assert.throws(() => checker.parseArgs(['--repo', 'kikujizo/ai-harness']), checker.UsageError);
});

test('parseArgs: 正常な3引数を受理する', () => {
  const args = checker.parseArgs([
    '--repo',
    'kikujizo/ai-harness',
    '--issue',
    '122',
    '--head',
    'deadbeef',
  ]);
  assert.deepEqual(args, { repo: 'kikujizo/ai-harness', issue: '122', head: 'deadbeef' });
});

test('validatePathRule: "." "..", 空文字, glob文字, 先頭スラッシュを拒否する', () => {
  assert.equal(checker.validatePathRule('a/./b'), false);
  assert.equal(checker.validatePathRule('a/../b'), false);
  assert.equal(checker.validatePathRule(''), false);
  assert.equal(checker.validatePathRule('a/*.txt'), false);
  assert.equal(checker.validatePathRule('/a.txt'), false);
  assert.equal(checker.validatePathRule('a.txt/'), false);
  assert.equal(checker.validatePathRule('a/b.txt'), true);
});

test('validatePathRule: バックスラッシュ区切り・Windowsドライブ形式を拒否する', () => {
  assert.equal(checker.validatePathRule('docs\\decisions.md'), false);
  assert.equal(checker.validatePathRule('C:\\repo\\file.txt'), false);
  assert.equal(checker.validatePathRule('C:/file.txt'), false);
  assert.equal(checker.validatePathRule('d:/file.txt'), false);
  assert.equal(checker.validatePathRule('docs/decisions.md'), true);
});

test('manifest pathがバックスラッシュ区切りはblocked/manifest_schema_invalid', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const body = manifestBody({
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'modify', path: 'docs\\decisions.md' }],
    });

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: baseSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=manifest_schema_invalid']);
  } finally {
    cleanup(dir);
  }
});

test('manifest pathがWindowsドライブ形式（C:\\...）はblocked/manifest_schema_invalid', async () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.txt', 'a\n', 'base');
    const body = manifestBody({
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'modify', path: 'C:\\repo\\file.txt' }],
    });

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: baseSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(body),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.lines, ['result=blocked', 'stop_reason=manifest_schema_invalid']);
  } finally {
    cleanup(dir);
  }
});

test('compareBytes: UTF-8 byte順で比較する（UTF-16コード単位順とは逆転するケース）', () => {
  const bmpPrivateUse = String.fromCodePoint(0xe000); // UTF-8 3byte (先頭byte 0xEE)
  const astralEmoji = String.fromCodePoint(0x1f600); // UTF-8 4byte・サロゲートペア（先頭byte 0xF0）
  const a = `a-${bmpPrivateUse}-file.txt`;
  const b = `a-${astralEmoji}-file.txt`;

  // JS標準の文字列比較（UTF-16コード単位順）ではbがaより小さいと判定される
  // （サロゲート上位0xD83Dが0xE000より小さいため）。byte順とは逆。
  assert.equal(a < b, false);
  // compareBytesはUTF-8 byte順（0xEE < 0xF0）でaが先になる。
  assert.equal(checker.compareBytes(a, b), -1);
  assert.deepEqual([b, a].sort(checker.compareBytes), [a, b]);
});

test('unexpected_change/missing_changeの出力行はbyte順でsortされる（非ASCIIファイル名）', async () => {
  const dir = makeRepo();
  try {
    const bmpPrivateUse = String.fromCodePoint(0xe000);
    const astralEmoji = String.fromCodePoint(0x1f600);
    const nameWithBmp = `a-${bmpPrivateUse}-file.txt`;
    const nameWithAstral = `a-${astralEmoji}-file.txt`;

    const baseSha = writeAndCommit(dir, 'kept.txt', 'kept\n', 'base');
    // 実差分側にbyte順で先になるはずのnameWithBmpと、後になるはずのnameWithAstralを
    // 両方manifest外の余分な変更として発生させ、出力順を確認する。
    fs.writeFileSync(path.join(dir, nameWithAstral), 'x\n');
    fs.writeFileSync(path.join(dir, nameWithBmp), 'x\n');
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'add non-ascii files'], dir);
    const headSha = git(['rev-parse', 'HEAD'], dir);

    const manifest = {
      schema: 'issue-change-manifest/v1',
      base_sha: baseSha,
      changes: [{ op: 'modify', path: 'kept.txt' }],
    };

    const result = await checker.runChecker({
      repo: 'kikujizo/ai-harness',
      issue: '122',
      head: headSha,
      cwd: dir,
      fetchIssueBody: fetcherFor(manifestBody(manifest)),
    });

    assert.equal(result.exitCode, 1);
    const unexpectedLines = result.lines.filter((line) => line.startsWith('unexpected_change='));
    assert.deepEqual(unexpectedLines, [
      `unexpected_change=${nameWithBmp}:add`,
      `unexpected_change=${nameWithAstral}:add`,
    ]);
  } finally {
    cleanup(dir);
  }
});

test('toChangeMap: 同一pathの重複はStopResult(checker_internal_error)', () => {
  assert.throws(
    () =>
      checker.toChangeMap([
        { op: 'add', path: 'dup.txt' },
        { op: 'modify', path: 'dup.txt' },
      ]),
    (err) => err instanceof checker.StopResult && err.stopReason === 'checker_internal_error',
  );
});
