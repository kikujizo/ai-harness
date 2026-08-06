#!/usr/bin/env node
'use strict';

// Issue #123: 変更された shell / Node test / GitHub Workflow について、既知の
// success-propagation 迂回と静的に成否伝播を証明できない箇所を機械検出する。
// CLI契約: --base <commit_sha> --head <commit_sha>
//
// 構造: 各言語の extractor が候補(候補=判定対象1件)だけを抽出し、classifier が
// 候補ごとに fail > unknown > pass を一度だけ決定し、aggregator が重複排除・
// 全体結果・primary findingを決定する（Issue #123 固定構文v3の候補モデル）。
// 候補を経由しない直接判定経路は持たない。

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const RESULT_HEADER = 'SUCCESS_PROPAGATION_STATIC';
const SYNTAX_CONTRACT = 'success-propagation-fixed/v1';
const BASE_SHA_RE = /^[0-9a-f]{40}$/;
const TARGET_EXTENSIONS = new Set(['.sh', '.bash', '.js', '.cjs', '.mjs', '.yml', '.yaml']);
const MAX_FILE_BYTES = 512 * 1024;
const SHELL_EXTENSIONS = new Set(['.sh', '.bash']);
const NODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const YAML_EXTENSIONS = new Set(['.yml', '.yaml']);

const CHECK_PURPOSE_RE =
  /\b(test|tests|check|verify|lint|fail-closed)\b|npm\s+test|yarn\s+test|pnpm\s+test|node\s+[^\s|;&]*test|bash\s+-n|shellcheck|eslint|jest|mocha|vitest/i;
const SP001_SUPPRESS_RE = /\|\|\s*(true|:)\s*($|[#;])/;
const UNCONDITIONAL_EXIT0_RE = /^\s*exit\s+0\s*($|[#;])/;
// 値側は非ゼロ整数(`1`等)/`false`/`$?`参照/`PIPESTATUS`参照だけをfailure値として認める。
// `[^0\s]`（0でも空白でもない任意の1文字）は`true`のような成功値の1文字目にも
// 一致してしまい、`CHECK_STATUS=true`を誤ってfailure記録扱いする過剰検出だったため
// 修正(Issue #123固定構文v3)。
const FAILURE_RECORD_RE =
  /\b([A-Z][A-Z0-9_]*_(?:EXIT|PASS|FAIL|STATUS)|LOCAL_E2E_PASS|POC_KEY_GATE_PASS)\s*=\s*(?:false|[1-9]\d*|\$?\?|PIPESTATUS)(?:\s|$|[#;])/i;
const FAILURE_RECORD_WINDOW_MAX_MEANINGFUL = 3;
const SET_PLUS_E_RE = /^\s*set\s+\+e\b/;
const SET_MINUS_E_RE =
  /^\s*set\s+-e\b|^\s*set\s+-eu\b|^\s*set\s+-euo\s+pipefail\b|^\s*set\s+-o\s+errexit\b/;
const BARE_RETURN_RE = /^\s*return\s*($|[#;])/;
const SIMPLE_NODE_CONDITION_RE =
  /^(?:!)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$|^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\s*(?:===|!==|==|!=)\s*(?:true|false|null|undefined|\d+)$/;
const EXIT_STATUS_CHECK_RE = /\$?\?|PIPESTATUS/;
// 証明として使えるのは positive integer の exit/return だけ（`exit nope` 等は証明にならない）。
const FIXED_PROPAGATION_PROOF_RE =
  /\|\|\s*(?:exit\s+[1-9]\d*|return\s+[1-9]\d*)\b|;\s*then\s+(?:exit\s+[1-9]\d*|return\s+[1-9]\d*)\b/;
const FAIL_CLOSED_CALL_RE = /\|\|\s*fail_closed\b|;\s*then\s+fail_closed\b/;
// bashのerrexit(`set -e`)は `&&`/`||` list内の非最終commandの失敗を伝播しない既知の仕様が
// あるため、TARGET_COMMANDが `&&` を含む行にある場合はerrexit契約による証明とみなさない
// (Issue #123固定構文v3)。
const AND_AND_RE = /&&/;
// `||`自体は固定pass形(`|| exit n`/`|| return n`/`|| fail_closed`)やSP001 suppress
// (`|| true`/`|| :`)なら別経路で処理されるが、それ以外(`|| echo ok`等)の`||`はerrexit契約の
// 証明にならない(Issue #123固定構文v3)。
const OR_OR_RE = /\|\|/;
const FLAT_IF_MAX_MEANINGFUL = 8;
const ERREXIT_CONTRACT_MAX_MEANINGFUL = 3;
const IF_NOT_RE = /^\s*if\s+!\s+/;
const SHELL_BLOCK_KEYWORD_RE = /\b(?:if|then|elif|for|while|until|case|function)\b/;
const TARGET_COMMAND_NAMES = new Set([
  'sleep', 'curl', 'wget', 'git', 'node', 'python', 'python3', 'bash', 'sh', 'npm', 'yarn',
  'pnpm', 'make', 'docker', 'kubectl', 'gh', 'aws', 'gcloud', 'terraform', 'ansible', 'helm',
  'cargo', 'go', 'rustc', 'java', 'mvn', 'gradle', 'cmake', 'ninja', 'tar', 'cp', 'mv', 'rm',
  'mkdir', 'chmod', 'chown', 'flock', 'timeout', 'wait', 'read', 'command', 'eval', 'exec',
]);
// 未定義wrapper（例: sudo、env、xargs）経由は直接実行へ変換せず unknown にする(Issue #123 固定構文v3)。
const UNKNOWN_WRAPPER_NAMES = new Set(['sudo', 'env', 'xargs']);
// 値部分がクォートで始まる場合は閉じクォートまでを1トークンとして要求する。
// `MSG="run npm test"`のように閉じていない`"run`のような断片は、実際には文字列
// リテラルの一部でしかなくenv prefixではないため、ここでマッチさせず後続のtoken
// 解決(getFirstCommandToken)に進ませない(commandBasenameが解決できずunknownへ
// 倒れる。Issue #123固定構文v3)。
const ENV_PREFIX_TOKEN_RE = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s'"]*)$/;
// 行継続は先頭token方式ではTARGET_COMMANDの成否を静的に証明できない契約上の
// 未対応shell構造(Issue #123固定構文v3)。
const LINE_CONTINUATION_RE = /\\\s*$/;
// 間接参照(`CMD=npm` → `"$CMD" test`)はTARGET_COMMANDを静的に解決できないため常に
// unknownとする。先頭tokenが変数展開("$VAR"またはunquoted $VAR)である行を検出する
// (Issue #123固定構文v3)。
const INDIRECT_REF_START_RE = /^\s*(?:if\s+!\s+)?"?\$\{?[A-Za-z_][A-Za-z0-9_]*\}?"?(?=\s|$)/;
// positive `if TARGET_COMMAND`(`if !`ではない)はflat `if !` guard契約の対象外。
// 単体の`!`(if文を伴わない否定)も固定構文外。いずれもTARGET_COMMANDの先頭token解決
// 自体を`if`/`!`にしてしまうため、resolveCommandBasenameの結果で自然に弾かれるが、
// 意図を明示するため個別にも判定する(Issue #123固定構文v3)。
const POSITIVE_IF_RE = /^\s*if\s+(?!!\s)/;
const BARE_NEGATION_RE = /^\s*!\s+/;
const SHELL_BLOCK_CLOSE_RE = /^\s*(?:fi|done|esac|\})\s*($|[#;])/;
const SHELL_BUILTIN_ONLY_RE =
  /^\s*(?:#|echo|printf|true|false|exit|return|local|export|unset|shift|set|trap|source|\.|:)\b/;
const ABSENCE_TERM_PARTS = [
  ['sk', 'ip'],
  ['sk', 'ip', 'ped'],
  ['un', 'avail', 'able'],
  ['cannot', ' run'],
  ['can', "'", 't run'],
  ['prere', 'quisite'],
  ['bash', ' un', 'avail', 'able'],
  ['shell', ' un', 'avail', 'able'],
  ['runtime', ' un', 'avail', 'able'],
  ['tool', ' un', 'avail', 'able'],
  ['bash', ' miss', 'ing'],
  ['shell', ' miss', 'ing'],
  ['runtime', ' miss', 'ing'],
  ['tool', ' miss', 'ing'],
  ['no', ' bash'],
  ['no', ' shell'],
  ['no', ' runtime'],
  ['no', ' tool'],
];
const SKIP_TERMS_RE = new RegExp(
  ABSENCE_TERM_PARTS.map((parts) => {
    const joined = parts.join('');
    const escaped = joined.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!/\s/.test(joined)) {
      return `\\b${escaped}\\b`;
    }
    return `\\b${escaped.replace(/\s+/g, '\\s+')}\\b`;
  }).join('|'),
  'i',
);
const NODE_SUCCESS_EXIT_RE =
  /^\s*(?:return\s*;?|return\s+Promise\.resolve\s*\(|process\.exit\s*\(\s*0\s*\)|process\.exitCode\s*=\s*0)/;
const NODE_FAILURE_EXIT_RE =
  /^\s*(?:throw\b|process\.exit\s*\(\s*[1-9]\d*\s*\)\s*;?|process\.exitCode\s*=\s*[1-9]\d*)\s*;?/;
const WORKFLOW_TEST_STEP_RE = /\b(tests?|check|verify|lint|fail-closed)\b/i;
const WORKFLOW_ALLOWED_STEP_KEYS = ['name', 'id', 'run', 'uses', 'continue-on-error', 'shell'];

class UsageError extends Error {}

class StopResult extends Error {
  constructor(stopReason, extraLines = []) {
    super(stopReason);
    this.stopReason = stopReason;
    this.extraLines = extraLines;
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--base') {
      out.base = argv[i + 1];
      i += 1;
    } else if (token === '--head') {
      out.head = argv[i + 1];
      i += 1;
    } else {
      throw new UsageError(`unknown argument: ${token}`);
    }
  }
  if (!out.base || !out.head) {
    throw new UsageError('missing required --base/--head');
  }
  if (!BASE_SHA_RE.test(out.base) || !BASE_SHA_RE.test(out.head)) {
    throw new UsageError('invalid --base/--head: expected 40-char lowercase hex commit SHA');
  }
  return out;
}

function git(args, cwd) {
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

function listTargetChanges(baseSha, headSha, cwd) {
  let raw;
  try {
    raw = git(['diff', '--no-renames', '--name-status', '-z', baseSha, headSha], cwd);
  } catch {
    throw new StopResult(['diff_', 'un', 'available'].join(''));
  }

  const tokens = raw.split('\u0000').filter((token) => token.length > 0);
  const paths = [];
  let i = 0;
  while (i < tokens.length) {
    const statusLetter = tokens[i][0];
    if (statusLetter === 'A' || statusLetter === 'M' || statusLetter === 'T') {
      const relPath = tokens[i + 1];
      if (hasTargetExtension(relPath)) {
        paths.push(relPath);
      }
      i += 2;
    } else if (statusLetter === 'D') {
      i += 2;
    } else {
      throw new StopResult('checker_internal_error');
    }
  }
  return paths;
}

function hasTargetExtension(relPath) {
  const ext = path.posix.extname(relPath);
  return TARGET_EXTENSIONS.has(ext);
}

function blobSizeAtCommit(commitSha, relPath, cwd) {
  try {
    const sizeText = git(['cat-file', '-s', `${commitSha}:${relPath}`], cwd).trim();
    const size = Number.parseInt(sizeText, 10);
    return Number.isFinite(size) ? size : null;
  } catch {
    return null;
  }
}

function isValidUtf8(buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function readBlobAtCommit(commitSha, relPath, cwd) {
  const blobSize = blobSizeAtCommit(commitSha, relPath, cwd);
  if (blobSize === null) {
    return { kind: 'missing' };
  }
  if (blobSize > MAX_FILE_BYTES) {
    return { kind: 'too_large' };
  }

  let raw;
  try {
    raw = execFileSync('git', ['show', `${commitSha}:${relPath}`], {
      cwd,
      encoding: 'buffer',
      maxBuffer: MAX_FILE_BYTES + 4096,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (err && (err.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || /maxBuffer/i.test(String(err.message)))) {
      return { kind: 'too_large' };
    }
    return { kind: 'missing' };
  }

  if (raw.length > MAX_FILE_BYTES) {
    return { kind: 'too_large' };
  }
  if (raw.includes(0)) {
    return { kind: 'binary' };
  }
  if (!isValidUtf8(raw)) {
    return { kind: 'encoding' };
  }
  return { kind: 'text', content: raw.toString('utf8') };
}

function lineIndent(line) {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function isMeaningfulLine(line) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith('#');
}

// Node用のmeaningful line判定。shell/workflow用のisMeaningfulLineは`#`コメントしか
// 除外しないため、Nodeの`//` comment-only行もmeaningfulとしてカウントしてしまい、
// comment/空行を挟んだflat-ifの契約上限(8 meaningful lines)を実質より狭くしていた。
// 言語別に判定を分離する(Issue #123固定構文v3)。
function isMeaningfulNodeLine(line) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('//');
}

function isShebangLine(line) {
  return /^\s*#!/.test(line);
}

function countMeaningfulLines(lines, start, end) {
  let count = 0;
  for (let i = start; i <= end; i += 1) {
    if (isMeaningfulNodeLine(lines[i])) count += 1;
  }
  return count;
}

function buildCodeView(line) {
  let view = line;
  const slash = view.indexOf('//');
  if (slash !== -1) {
    view = view.slice(0, slash) + ' '.repeat(view.length - slash);
  }
  view = view.replace(/'(?:[^'\\]|\\.)*'/g, (match) => ' '.repeat(match.length));
  view = view.replace(/"(?:[^"\\]|\\.)*"/g, (match) => ' '.repeat(match.length));
  view = view.replace(/`[^`\\$]*`/g, (match) => ' '.repeat(match.length));
  return view;
}

function hasAbsenceTerm(line) {
  return SKIP_TERMS_RE.test(stripComment(line, 'node'));
}

function absenceTermOutsideStrings(line) {
  const raw = stripComment(line, 'node');
  if (!SKIP_TERMS_RE.test(raw)) return false;
  return SKIP_TERMS_RE.test(buildCodeView(raw));
}

function isSimpleNodeCondition(conditionText) {
  const normalized = conditionText.trim().replace(/\s+/g, ' ');
  if (/[()]/.test(normalized)) return false;
  return SIMPLE_NODE_CONDITION_RE.test(normalized);
}

function getEnclosingFunctionBody(lines, idx) {
  let funcLine = -1;
  for (let i = idx; i >= 0; i -= 1) {
    const codeView = buildCodeView(stripComment(lines[i], 'node'));
    if (/\bfunction\b/.test(codeView)) {
      funcLine = i;
      break;
    }
  }
  if (funcLine === -1) return null;

  let bodyStart = -1;
  let bodyEnd = -1;
  let depth = 0;
  for (let i = funcLine; i < lines.length; i += 1) {
    const view = buildCodeView(stripComment(lines[i], 'node'));
    for (const ch of view) {
      if (ch === '{') {
        depth += 1;
        if (bodyStart === -1) bodyStart = i;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          bodyEnd = i;
          break;
        }
      }
    }
    if (bodyEnd !== -1) break;
  }
  if (bodyStart === -1 || bodyEnd === -1) return null;
  return { funcLine, bodyStart, bodyEnd };
}

function isLoneClosingBraceLine(line, kind) {
  return /^\s*}\s*($|[#;])/.test(stripComment(line, kind));
}

function stripComment(line, kind) {
  if (kind === 'shell') {
    const hash = line.indexOf('#');
    return hash === -1 ? line : line.slice(0, hash);
  }
  if (kind === 'node') {
    const slash = line.indexOf('//');
    return slash === -1 ? line : line.slice(0, slash);
  }
  return line;
}

// ---------------------------------------------------------------------------
// SP001 / SP002: shell — 候補抽出
// ---------------------------------------------------------------------------

function collectConfirmedFailClosedNames(lines) {
  const confirmed = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const stripped = stripComment(lines[i], 'shell');
    const defMatch =
      stripped.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{(.*)$/) ||
      stripped.match(/^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(\))?\s*\{(.*)$/);
    if (!defMatch) continue;
    const name = defMatch[1];

    // defMatch の '{' 直後から文字単位で深さを追跡し、対応する '}' までの
    // 本文だけを取り出す(複数行にまたがってもよい)。
    let depth = 1;
    let bodyText = '';
    let consumed = false;

    const consumeChars = (text) => {
      for (const ch of text) {
        if (consumed) break;
        if (ch === '{') {
          depth += 1;
        } else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            consumed = true;
            break;
          }
        }
        bodyText += ch;
      }
    };

    consumeChars(defMatch[2]);
    let j = i;
    while (!consumed && j + 1 < lines.length) {
      j += 1;
      bodyText += '\n';
      consumeChars(stripComment(lines[j], 'shell'));
    }
    if (!consumed) continue; // 閉じ括弧未解決は確認不能

    const statements = [];
    for (const stmt of bodyText.split(/[;\n]/)) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) statements.push(trimmed);
    }
    if (statements.length === 1 && /^(?:exit|return)\s+[1-9]\d*$/.test(statements[0])) {
      confirmed.add(name);
    }
  }
  return confirmed;
}

// 行に`||`が2回以上出現する場合(`npm test || echo ok || exit 1`等)、TARGET_COMMAND
// 直後の中間commandが成功すれば固定形(`exit n`等)には到達しないため、直接の伝播証明
// として扱わない。固定pass形はTARGET_COMMANDに直接接続された唯一の`||`のみを証明とする
// (Issue #123固定構文v3)。
function hasMultipleOrSegments(line) {
  return (line.match(/\|\|/g) || []).length >= 2;
}

function hasShellProofOnLine(line, confirmedFailClosed) {
  if (hasMultipleOrSegments(line)) return false;
  if (FIXED_PROPAGATION_PROOF_RE.test(line)) return true;
  if (confirmedFailClosed.has('fail_closed') && FAIL_CLOSED_CALL_RE.test(line)) return true;
  return false;
}

// 先頭の連続する NAME=value 環境変数プレフィックスを読み飛ばし、TARGET_COMMAND判定対象の
// 最初のtokenを返す(basename判定はcaller側で行う)。
function getFirstCommandToken(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const tokens = trimmed.split(/\s+/);
  let i = 0;
  while (i < tokens.length && ENV_PREFIX_TOKEN_RE.test(tokens[i])) {
    i += 1;
  }
  return i < tokens.length ? tokens[i] : null;
}

function basenameOfCommandToken(token) {
  const idx = token.lastIndexOf('/');
  return idx === -1 ? token : token.slice(idx + 1);
}

// flat `if !` 開始行は候補としてTARGET_COMMANDを直接実行候補と統合するため、`if !`
// prefixを読み飛ばした残りからcommand tokenを解決する。
function resolveCommandBasename(line) {
  let commandPortion = line;
  const ifNotMatch = line.match(IF_NOT_RE);
  if (ifNotMatch) {
    commandPortion = line.slice(ifNotMatch[0].length);
  }
  const token = getFirstCommandToken(commandPortion);
  if (!token) return null;
  const cleaned = token.replace(/[;&|]+$/, '');
  if (cleaned.length === 0) return null;
  return basenameOfCommandToken(cleaned).toLowerCase();
}

function lineMentionsTargetCommandName(line) {
  for (const name of TARGET_COMMAND_NAMES) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(line)) return true;
  }
  return false;
}

// 末尾の固定OR証明(`|| exit n`/`|| return n`/確認済み`|| fail_closed`)だけを
// 「本体」から除いて判定するための境界。証明部分にはメタ文字許可を与え、
// それより前の本体には一切のshellメタ文字を許さない(下のUNSAFE_SHELL_META_CHAR_RE)。
const TRAILING_OR_PROOF_RE =
  /\|\|\s*(?:exit\s+[1-9]\d*|return\s+[1-9]\d*|fail_closed)\b\s*$/;
// 単体のpipeline(`||`の一部でない`|`)・単体のbackground(`&&`の一部でない`&`)・
// list区切り(;)・subshell/command substitution((・)・$)・backtick substitution(`)・
// here-doc(<<)は、いずれも先頭token方式では成否を静的に証明できない構造を作りうる。
// 個別の構造を検出器として都度追加する設計(ブラックリスト)は「新しい構造が
// 見つかるたび次のラウンドが生まれる」を繰り返した反省から、本体にこれらの
// メタ文字が1文字でもあれば理由を問わずunknownへ倒すpositive whitelistへ統一する
// (Issue #123固定構文v3)。`&&`/`||`自体はここでは弾かない(候補化はする)。
// errexit契約下・OR伝播の証明可否はAND_AND_RE/hasShellProofOnLine/
// hasMultipleOrSegments等の既存ロジックが判定する(単一/複数のOR区別も含め、
// 候補化されたあとにそこで正しくunproven判定される)。process substitution
// (`<(`/`>(`)は`(`自体がここで検出されるため、単純なredirect(`>file`/`2>&1`)を
// 誤って弾かないよう単体の`<`/`>`はメタ文字に含めない(here-docの`<<`のみ検出)。
const UNSAFE_SHELL_META_CHAR_RE = /(?<!\|)\|(?!\|)|(?<!&)&(?!&)|[;()$`]|<</;

// 行末の固定OR証明を除いた「本体」を返す。fail_closedはconfirmedFailClosedで
// 確認済み(単一statement定義)の場合のみ証明として扱う(R5契約)。
function stripTrailingOrProof(line, confirmedFailClosed) {
  const match = line.match(TRAILING_OR_PROOF_RE);
  if (!match) return line;
  if (/fail_closed\s*$/.test(match[0]) && !confirmedFailClosed.has('fail_closed')) {
    return line;
  }
  return line.slice(0, match.index);
}

// TARGET_COMMANDへの言及がある行を「まず候補化」したうえで、次の固定ホワイトリスト
// 形に完全一致する場合だけpass判定ロジック(hasProofOnLine/errexitProven/ifNotProven)
// へ進める。一致しなければ理由を問わずSP002 unknownへ倒す(デフォルトunknown・
// ホワイトリストのみpassという反転ルールの中核、Issue #123固定構文v3)。
// flat `if !` guardの終端(`; then <TERM>; fi`)を検出する。この終端はif文構文
// そのものであり、TARGET_COMMAND本体への危険な追加構造ではないため、メタ文字
// 判定の対象から除く(TERMがexit n/return n/fail_closedかどうかの精査は別関数
// hasIfNotFailureStopが担う。ここでは構文の形だけを許容する)。
const IF_NOT_THEN_FI_TAIL_RE = /;\s*then\b[\s\S]*;\s*fi\s*$/;

function isCleanDirectTargetCommand(line, commandBasename, confirmedFailClosed = new Set()) {
  if (!commandBasename || !TARGET_COMMAND_NAMES.has(commandBasename)) return false;
  if (POSITIVE_IF_RE.test(line)) return false;
  if (BARE_NEGATION_RE.test(line)) return false;
  // 2個以上の`||`(TARGET_COMMAND直後の中間commandが成功すれば固定形に到達しない)は
  // 単一の`||`(候補化してhasShellProofOnLineの証明可否に委ねる)とは扱いを分け、
  // ここで無条件unknownにする(Issue #123固定構文v3、hasMultipleOrSegments契約)。
  if (hasMultipleOrSegments(line)) return false;

  let body = line;
  const ifNotMatch = line.match(IF_NOT_RE);
  if (ifNotMatch) {
    body = body.slice(ifNotMatch[0].length);
    const tailMatch = body.match(IF_NOT_THEN_FI_TAIL_RE);
    if (tailMatch) {
      body = body.slice(0, tailMatch.index);
    }
  }
  body = stripTrailingOrProof(body, confirmedFailClosed);
  return !UNSAFE_SHELL_META_CHAR_RE.test(body);
}

// ブロック開始キーワード(if/for/while/until/case)と裸の`{`(function本体・
// グルーピング)。対応する終端(fi/done/esac/`}`)が現れるまでブロック内とみなす。
// 単語境界ベースの緩い検出で、文字列リテラル内の誤検出は安全側(depth過大→unknown
// 増加)に倒れるだけなので許容する(Issue #123固定構文v3)。
const BLOCK_OPEN_KEYWORD_RE = /\b(?:if|for|while|until|case)\b/g;
const BLOCK_CLOSE_KEYWORD_RE = /\b(?:fi|done|esac)\b/g;
const BRACE_OPEN_RE = /\{/g;
const BRACE_CLOSE_RE = /\}/g;

// TARGET_COMMANDがトップレベル(depth 0)にあるか、複数行if条件・function本体・
// for/while/until/caseのボディ内(depth > 0)にあるかを判定する。depth > 0の
// TARGET_COMMANDは、呼び出し元でどう扱われるか(`|| true`で握りつぶされる等)や
// 実際に実行されるかどうか(if条件の真偽次第)を静的に証明できないため、flat
// `if !` guardの1行完結形を除き常にunknownとする(Issue #123固定構文v3)。
// 行頭時点でのdepthを返す(その行自体が開くブロックはこの行のTARGET_COMMAND
// 判定には影響しない。1行完結の`if !`guard等は既存の別ロジックで判定する)。
function computeShellBlockDepths(lines) {
  const depths = [];
  let depth = 0;
  for (const rawLine of lines) {
    const line = stripComment(rawLine, 'shell');
    depths.push(depth);
    const opens =
      (line.match(BLOCK_OPEN_KEYWORD_RE) || []).length +
      (line.match(BRACE_OPEN_RE) || []).length;
    const closes =
      (line.match(BLOCK_CLOSE_KEYWORD_RE) || []).length +
      (line.match(BRACE_CLOSE_RE) || []).length;
    depth = Math.max(0, depth + opens - closes);
  }
  return depths;
}

// line continuation(行末`\`)は複数行にまたがるため、開始行だけを見ても
// TARGET_COMMANDへの言及を検出できない。契約上、行継続自体が未対応構造(常にunknown)
// のため、チェーン全体を結合したテキストで用途一致だけ判定し、開始行1件のunknown
// 候補にまとめる。2行目以降は個別処理せずスキップする(Issue #123固定構文v3)。
function computeLineContinuationChains(lines) {
  const skipLines = new Set();
  const chainByStartIdx = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    if (skipLines.has(i)) continue;
    const stripped = stripComment(lines[i], 'shell');
    if (!LINE_CONTINUATION_RE.test(stripped)) continue;
    let combined = stripped.replace(/\\\s*$/, ' ');
    let j = i;
    while (LINE_CONTINUATION_RE.test(stripComment(lines[j], 'shell'))) {
      if (j + 1 >= lines.length) break;
      j += 1;
      skipLines.add(j);
      const jStripped = stripComment(lines[j], 'shell');
      combined += LINE_CONTINUATION_RE.test(jStripped)
        ? jStripped.replace(/\\\s*$/, ' ')
        : jStripped.trim();
    }
    chainByStartIdx.set(i, { endIdx: j, combinedText: combined });
  }
  return { skipLines, chainByStartIdx };
}

// 行末が未閉じの`(`/`$(`で終わる行から対応する`)`までの範囲を追跡する
// (複数行subshell・複数行command substitution)。単一行で閉じる場合は
// isCleanDirectTargetCommandのUNSAFE_SHELL_META_CHAR_RE判定(`(`/`)`/`$`/backtick
// を含む行は無条件unknown)に任せ、ここでは扱わない。範囲内の
// TARGET_COMMANDへの言及だけを判定し、開始行1件のunknown候補にまとめる
// (Issue #123固定構文v3)。
// クォート(シングル/ダブル)内の`(`/`)`/バッククォートを無視して、行の括弧深さ変化と
// バッククォート出現回数を計算する。文字列リテラル内の閉じ括弧を字句境界として
// 誤カウントしないため(Issue #123固定構文v3)。
function scanShellLexicalDelta(text) {
  let parenDelta = 0;
  let backtickCount = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
    } else if (ch === '"') {
      inDouble = true;
    } else if (ch === '(') {
      parenDelta += 1;
    } else if (ch === ')') {
      parenDelta -= 1;
    } else if (ch === '`') {
      backtickCount += 1;
    }
  }
  return { parenDelta, backtickCount };
}

// 行末が未閉じの`(`/`$(`で終わる行、または未閉じのbacktickを含む行から、対応する
// 閉じ位置までの範囲を追跡する(複数行subshell・複数行command substitution・複数行
// backtick substitution)。クォート内の括弧・バッククォートは無視する(quote-aware)。
// 単一行で閉じる場合はisCleanDirectTargetCommandのUNSAFE_SHELL_META_CHAR_RE判定に
// 任せ、ここでは扱わない。ファイル末尾まで閉じ位置が確定できない場合も、静的に境界を確定できない構造として
// 範囲をファイル末尾まで広げ、unknown判定の対象に含める(Issue #123固定構文v3)。
function computeMultilineGroupingRanges(lines) {
  const skipLines = new Set();
  const rangeByStartIdx = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    if (skipLines.has(i)) continue;
    const stripped = stripComment(lines[i], 'shell').trimEnd();
    const { parenDelta, backtickCount } = scanShellLexicalDelta(stripped);
    const opensParenGroup = parenDelta > 0 && /(?:^|[;&=]\s*)\$?\(\s*$/.test(stripped);
    const opensBacktickGroup = !opensParenGroup && backtickCount % 2 === 1 && /`\s*$/.test(stripped);
    if (!opensParenGroup && !opensBacktickGroup) continue;

    let parenDepth = opensParenGroup ? parenDelta : 0;
    let backtickOpen = opensBacktickGroup;
    let endIdx = i;
    let combined = stripped;
    for (let j = i + 1; j < lines.length; j += 1) {
      const jStripped = stripComment(lines[j], 'shell');
      const jDelta = scanShellLexicalDelta(jStripped);
      if (opensParenGroup) parenDepth += jDelta.parenDelta;
      if (opensBacktickGroup && jDelta.backtickCount % 2 === 1) backtickOpen = !backtickOpen;
      combined += `\n${jStripped}`;
      endIdx = j;
      skipLines.add(j);
      const stillOpen = opensParenGroup ? parenDepth > 0 : backtickOpen;
      if (!stillOpen) break;
    }
    rangeByStartIdx.set(i, { endIdx, combinedText: combined });
  }
  return { skipLines, rangeByStartIdx };
}

// `set +e`検出後、後続の3 meaningful lines(空行・コメント除く実効行)だけをcontextとする
// 固定窓を、ファイル全体に対して1パスで前計算する。fi/done/esac/}/set -e系のいずれかが
// 現れたら窓を終了し、窓外へ`set +e`状態を持ち越さない。複数の`set +e`が重なる場合は
// 最も近い先行anchorだけを採用する(新しいanchorが常に前の窓を上書きする)。
function computeSetPlusEWindows(lines) {
  const windowByLine = new Array(lines.length).fill(null);
  let current = null;
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!isMeaningfulLine(rawLine)) continue;
    const stripped = stripComment(rawLine, 'shell').trimEnd();
    if (current && current.remaining > 0) {
      if (SHELL_BLOCK_CLOSE_RE.test(stripped) || SET_MINUS_E_RE.test(stripped)) {
        current = null;
      } else {
        windowByLine[i] = current;
        current.indices.push(i);
        current.remaining -= 1;
      }
    }
    if (SET_PLUS_E_RE.test(stripped)) {
      current = { remaining: ERREXIT_CONTRACT_MAX_MEANINGFUL, indices: [] };
    }
  }
  return windowByLine;
}

// failure record(`FOO_STATUS=1`等)検出後、後続の3 meaningful lines(空行・コメント除く
// 実効行)だけをcontextとする固定窓を前計算する。fi/done/esac/}、または
// set -e/-eu/-euo pipefail/-o errexitのいずれかが現れたら窓を終了する。旧実装は
// `exit 0`側から直前8物理行を逆走査しており、契約(次の3 meaningful linesかつ
// terminatorまで)より広すぎる窓だったため`set +e`窓と同じ前向き固定窓方式に修正
// (Issue #123固定構文v3)。
function computeFailureRecordWindows(lines) {
  const windowByLine = new Array(lines.length).fill(false);
  let remaining = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!isMeaningfulLine(rawLine)) continue;
    const stripped = stripComment(rawLine, 'shell').trimEnd();
    if (remaining > 0) {
      if (SHELL_BLOCK_CLOSE_RE.test(stripped) || SET_MINUS_E_RE.test(stripped)) {
        remaining = 0;
      } else {
        windowByLine[i] = true;
        remaining -= 1;
      }
    }
    if (FAILURE_RECORD_RE.test(stripped)) {
      remaining = FAILURE_RECORD_WINDOW_MAX_MEANINGFUL;
    }
  }
  return windowByLine;
}

function findFlatIfNotBlock(lines, idx) {
  let ifIdx = idx;
  const line = stripComment(lines[idx], 'shell');
  if (!IF_NOT_RE.test(line)) {
    for (let back = idx; back >= Math.max(0, idx - 2); back -= 1) {
      if (IF_NOT_RE.test(stripComment(lines[back], 'shell'))) {
        ifIdx = back;
        break;
      }
    }
    if (!IF_NOT_RE.test(stripComment(lines[ifIdx], 'shell'))) return null;
  }

  const ifIndent = lineIndent(lines[ifIdx]);
  let fiIdx = -1;
  let meaningful = 0;
  for (let i = ifIdx; i < lines.length; i += 1) {
    const stripped = stripComment(lines[i], 'shell');
    if (isMeaningfulLine(lines[i])) meaningful += 1;
    if (i > ifIdx && /^\s*fi\s*($|[#;])/.test(stripped) && lineIndent(lines[i]) === ifIndent) {
      fiIdx = i;
      break;
    }
    if (meaningful > FLAT_IF_MAX_MEANINGFUL) return null;
  }
  if (fiIdx === -1) return null;
  return { ifIdx, fiIdx, meaningful };
}

function isShellBlockFlat(lines, startIdx, endIdx) {
  for (let i = startIdx + 1; i < endIdx; i += 1) {
    if (!isMeaningfulLine(lines[i])) continue;
    const stripped = stripComment(lines[i], 'shell');
    if (SHELL_BLOCK_KEYWORD_RE.test(stripped)) return false;
    if (/\{\s*($|[#;])/.test(stripped)) return false;
  }
  return true;
}

function hasIfNotFailureStop(lines, idx, confirmedFailClosed = new Set()) {
  const block = findFlatIfNotBlock(lines, idx);
  if (!block) return false;
  if (!isShellBlockFlat(lines, block.ifIdx, block.fiIdx)) return false;

  let lastIdx = -1;
  for (let i = block.fiIdx - 1; i > block.ifIdx; i -= 1) {
    if (isMeaningfulLine(lines[i])) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx === -1) return false;

  const stripped = stripComment(lines[lastIdx], 'shell');
  if (/^\s*exit\s+[1-9]\d*\s*($|[#;])/.test(stripped)) return true;
  if (/^\s*return\s+[1-9]\d*\s*($|[#;])/.test(stripped)) return true;
  if (confirmedFailClosed.has('fail_closed') && /^\s*fail_closed\s*($|[#;])/.test(stripped)) return true;
  return false;
}

function extractShellCandidates(content, relPath) {
  const lines = content.split(/\r?\n/);
  const candidates = [];
  const confirmedFailClosed = collectConfirmedFailClosedNames(lines);
  const setPlusEWindows = computeSetPlusEWindows(lines);
  const failureRecordWindows = computeFailureRecordWindows(lines);
  const continuationInfo = computeLineContinuationChains(lines);
  const groupingInfo = computeMultilineGroupingRanges(lines);
  const blockDepths = computeShellBlockDepths(lines);

  let errexitInContract = false;
  let errexitContractVoided = false;
  let meaningfulBeforeCommand = 0;

  for (let idx = 0; idx < lines.length; idx += 1) {
    if (continuationInfo.skipLines.has(idx) || groupingInfo.skipLines.has(idx)) continue;

    const lineNo = idx + 1;
    const rawLine = lines[idx];
    const line = stripComment(rawLine, 'shell').trimEnd();
    if (line.trim().length === 0) continue;
    if (isShebangLine(line)) continue;

    if (isMeaningfulLine(rawLine)) {
      meaningfulBeforeCommand += 1;
      if (SET_MINUS_E_RE.test(line) && meaningfulBeforeCommand <= ERREXIT_CONTRACT_MAX_MEANINGFUL) {
        errexitInContract = true;
        errexitContractVoided = false;
      }
    }
    if (SET_PLUS_E_RE.test(line)) {
      errexitContractVoided = true;
      errexitInContract = false;
    }

    if (CHECK_PURPOSE_RE.test(line) && SP001_SUPPRESS_RE.test(line)) {
      candidates.push({
        kind: 'fixed',
        result: 'fail',
        ruleId: 'SP001',
        line: lineNo,
        reason: 'shell_success_suppression',
      });
      continue;
    }

    if (BARE_RETURN_RE.test(line)) {
      candidates.push({
        kind: 'fixed',
        result: 'unknown',
        ruleId: 'SP002',
        line: lineNo,
        reason: 'shell_failure_propagation_unproven',
      });
      continue;
    }

    if (UNCONDITIONAL_EXIT0_RE.test(line) && failureRecordWindows[idx]) {
      candidates.push({
        kind: 'fixed',
        result: 'fail',
        ruleId: 'SP001',
        line: lineNo,
        reason: 'shell_unconditional_exit0_after_failure_record',
      });
      continue;
    }

    // line continuation・複数行subshell・複数行command substitutionは開始行だけを
    // 見てもTARGET_COMMANDへの言及を検出できないため、結合済みテキスト(範囲全体)で
    // 用途一致だけを判定し、開始行1件のunknown候補にまとめる(Issue #123固定構文v3)。
    const multilineGroup = continuationInfo.chainByStartIdx.get(idx) || groupingInfo.rangeByStartIdx.get(idx);
    if (multilineGroup) {
      const combined = multilineGroup.combinedText;
      if (
        INDIRECT_REF_START_RE.test(combined) ||
        lineMentionsTargetCommandName(combined) ||
        TARGET_COMMAND_NAMES.has(resolveCommandBasename(combined) || '')
      ) {
        candidates.push({
          kind: 'fixed',
          result: 'unknown',
          ruleId: 'SP002',
          line: lineNo,
          reason: 'shell_unsupported_structure_unproven',
        });
      }
      continue;
    }

    const commandBasename = resolveCommandBasename(line);
    const hasTargetContext =
      INDIRECT_REF_START_RE.test(line) ||
      lineMentionsTargetCommandName(line) ||
      (commandBasename && TARGET_COMMAND_NAMES.has(commandBasename));

    // TARGET_COMMANDへの言及が全くない行だけがSHELL_BUILTIN_ONLY_REの早期continue
    // 対象。`echo ok | npm test`のようにbuiltinで始まっても言及があれば、下の
    // ホワイトリスト判定へ進める(Issue #123固定構文v3)。
    if (!hasTargetContext) {
      if (SHELL_BUILTIN_ONLY_RE.test(line)) continue;
      if (commandBasename && UNKNOWN_WRAPPER_NAMES.has(commandBasename)) {
        candidates.push({
          kind: 'fixed',
          result: 'unknown',
          ruleId: 'SP002',
          line: lineNo,
          reason: 'shell_unresolved_wrapper_command',
        });
      }
      continue;
    }

    // デフォルトunknown・ホワイトリストのみpassの反転ルール: 固定形(errexit契約下の
    // bare direct execution/TARGET_COMMANDへ直接接続された単一の||証明/flat `if !`
    // guard)に完全一致しない限り、理由を問わずSP002 unknownへ倒す。未対応wrapper
    // (sudo/env/xargs/time等)・pipeline・positive if・background・間接参照等を
    // 都度検出器として追加する設計はshell構文が尽きないため未対応構造が出るたびに
    // 再発する(Issue #123固定構文v3)。
    if (!isCleanDirectTargetCommand(line, commandBasename, confirmedFailClosed)) {
      candidates.push({
        kind: 'fixed',
        result: 'unknown',
        ruleId: 'SP002',
        line: lineNo,
        reason: 'shell_unsupported_structure_unproven',
      });
      continue;
    }

    // 複数行if条件・function本体・for/while/until/caseのボディ内(depth > 0)は、
    // 実際に実行されるか(if条件の真偽次第)・呼び出し元でどう扱われるか(`|| true`で
    // 握りつぶされる等)を静的に証明できないため、常にunknownとする(Issue #123
    // 固定構文v3)。
    if (blockDepths[idx] > 0) {
      candidates.push({
        kind: 'fixed',
        result: 'unknown',
        ruleId: 'SP002',
        line: lineNo,
        reason: 'shell_nested_block_context_unproven',
      });
      continue;
    }

    {
      const windowEntry = setPlusEWindows[idx];
      if (windowEntry) {
        const hasProof = hasShellProofOnLine(line, confirmedFailClosed);
        if (!hasProof) {
          const laterText = windowEntry.indices
            .filter((i) => i > idx)
            .map((i) => stripComment(lines[i], 'shell'))
            .join('\n');
          if (EXIT_STATUS_CHECK_RE.test(laterText)) {
            candidates.push({
              kind: 'fixed',
              result: 'unknown',
              ruleId: 'SP002',
              line: lineNo,
              reason: 'shell_set_plus_e_status_ref_unproven',
            });
          } else {
            candidates.push({
              kind: 'fixed',
              result: 'fail',
              ruleId: 'SP001',
              line: lineNo,
              reason: 'shell_set_plus_e_without_exit_check',
            });
          }
          continue;
        }
      }

      const hasProofOnLine = hasShellProofOnLine(line, confirmedFailClosed);
      const hasUnprovenOrList = OR_OR_RE.test(line) && !hasProofOnLine;
      candidates.push({
        kind: 'target_command',
        line: lineNo,
        hasProofOnLine,
        errexitProven:
          errexitInContract && !errexitContractVoided && !AND_AND_RE.test(line) && !hasUnprovenOrList,
        ifNotProven: hasIfNotFailureStop(lines, idx, confirmedFailClosed),
      });
    }
    continue;
  }

  return candidates.map((c) => Object.assign({}, c, { path: relPath }));
}

function classifyShellCandidate(candidate) {
  if (candidate.kind === 'fixed') {
    return { result: candidate.result, ruleId: candidate.ruleId, reason: candidate.reason };
  }
  if (candidate.kind === 'target_command') {
    if (candidate.hasProofOnLine || candidate.errexitProven || candidate.ifNotProven) {
      return null;
    }
    return {
      result: 'unknown',
      ruleId: 'SP002',
      reason: 'shell_failure_propagation_unproven',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// SP003: Node.js — 候補抽出
// ---------------------------------------------------------------------------

function isNodeTestLikePath(relPath) {
  return (
    /\.(?:test|spec)\.[cm]?js$/i.test(relPath) ||
    /(?:^|\/)(?:__tests__|tests?|checks?)\//i.test(relPath)
  );
}

function getNodeFlatIfRange(lines, ifIdx) {
  const start = ifIdx;
  const ifIndent = lineIndent(lines[ifIdx]);
  let end = ifIdx;
  let depth = 0;
  let started = false;

  for (let i = ifIdx; i < lines.length; i += 1) {
    const codeView = buildCodeView(stripComment(lines[i], 'node'));
    for (const ch of codeView) {
      if (ch === '{') {
        depth += 1;
        started = true;
      } else if (ch === '}') {
        depth -= 1;
      }
    }
    end = i;
    if (started && depth <= 0) {
      break;
    }
    if (i > ifIdx && lineIndent(lines[i]) < ifIndent && isMeaningfulNodeLine(lines[i])) {
      end = i - 1;
      break;
    }
  }

  return { start, end };
}

function hasElseAfterFlatIf(lines, endIdx) {
  for (let i = endIdx + 1; i < Math.min(lines.length, endIdx + 3); i += 1) {
    if (!isMeaningfulNodeLine(lines[i])) continue;
    const codeView = buildCodeView(stripComment(lines[i], 'node'));
    if (/\belse\b/.test(codeView)) return true;
    break;
  }
  return false;
}

function flatIfInteriorIsSimple(lines, start, end) {
  for (let i = start + 1; i < end; i += 1) {
    if (!isMeaningfulNodeLine(lines[i])) continue;
    const codeView = buildCodeView(stripComment(lines[i], 'node'));
    if (/[{}]/.test(codeView)) return false;
    if (/\b(if|else|switch|for|while|do|try|catch|finally|function|class)\b/.test(codeView)) {
      return false;
    }
    if (/\?|=>/.test(codeView)) return false;
  }
  return true;
}

function extractIfCondition(codeView) {
  const match = codeView.match(/\bif\s*\(\s*([^)]*)\)/);
  return match ? match[1] : null;
}

// 「限定implicit return」ゲート: if-block の外側（前後）に他の意味のある行が
// あってはならない。allowTrailingFailureExit=true のときだけ、if-block の後に
// 続く明示的failure終了（throw / process.exit(n>=1) / process.exitCode=n>=1）を
// 例外として許容する。hasSuccessExit（if内に明示的な成功終了がある）候補だけが
// この例外を使ってよく、implicitな候補（if内に何の終了文もない）は例外なしで
// 判定する。
function isLimitedImplicitReturnIfCore(lines, ifIdx, allowTrailingFailureExit) {
  const { start, end } = getNodeFlatIfRange(lines, ifIdx);
  const funcBody = getEnclosingFunctionBody(lines, ifIdx);

  if (!funcBody) {
    for (let i = 0; i < start; i += 1) {
      if (!isMeaningfulNodeLine(lines[i])) continue;
      const stripped = stripComment(lines[i], 'node');
      if (/^['"]use strict['"]/.test(stripped.trim())) continue;
      return false;
    }
    for (let i = end + 1; i < lines.length; i += 1) {
      if (!isMeaningfulNodeLine(lines[i])) continue;
      if (isLoneClosingBraceLine(lines[i], 'node')) continue;
      if (allowTrailingFailureExit) {
        const stripped = stripComment(lines[i], 'node');
        if (NODE_FAILURE_EXIT_RE.test(stripped)) continue;
      }
      return false;
    }
    return true;
  }

  for (let i = funcBody.bodyStart + 1; i < funcBody.bodyEnd; i += 1) {
    if (!isMeaningfulNodeLine(lines[i])) continue;
    if (isLoneClosingBraceLine(lines[i], 'node')) continue;
    if (i >= start && i <= end) continue;
    if (i < start) return false;
    if (allowTrailingFailureExit) {
      const stripped = stripComment(lines[i], 'node');
      if (NODE_FAILURE_EXIT_RE.test(stripped)) continue;
    }
    return false;
  }
  return true;
}

function isLimitedImplicitReturnIf(lines, ifIdx) {
  return isLimitedImplicitReturnIfCore(lines, ifIdx, true);
}

function isLimitedImplicitReturnIfStrict(lines, ifIdx) {
  return isLimitedImplicitReturnIfCore(lines, ifIdx, false);
}

function buildNodeIfCandidate(lines, ifIdx, relPath) {
  const ifCodeView = buildCodeView(stripComment(lines[ifIdx], 'node'));
  const condition = extractIfCondition(ifCodeView);
  const { start, end } = getNodeFlatIfRange(lines, ifIdx);
  const meaningfulCount = countMeaningfulLines(lines, start, end);
  const conditionComplex = condition !== null && !isSimpleNodeCondition(condition);
  const interiorSimple = flatIfInteriorIsSimple(lines, start, end);
  const hasElse = hasElseAfterFlatIf(lines, end);

  const branchWindow = lines.slice(start, end + 1);
  let hasSuccessExit = false;
  let hasFailureExit = false;
  for (const branchLine of branchWindow) {
    const stripped = stripComment(branchLine, 'node');
    if (NODE_SUCCESS_EXIT_RE.test(stripped)) hasSuccessExit = true;
    if (NODE_FAILURE_EXIT_RE.test(stripped)) hasFailureExit = true;
  }

  return {
    kind: 'node_if_absence',
    path: relPath,
    line: ifIdx + 1,
    meaningfulCount,
    conditionComplex,
    interiorSimple,
    hasElse,
    hasSuccessExit,
    hasFailureExit,
    looseOk: isLimitedImplicitReturnIf(lines, ifIdx),
    strictOk: isLimitedImplicitReturnIfStrict(lines, ifIdx),
  };
}

function extractNodeCandidates(content, relPath) {
  const lines = content.split(/\r?\n/);
  const candidates = [];

  const isTestLike = isNodeTestLikePath(relPath);
  const looksLikeCheckCode = CHECK_PURPOSE_RE.test(content);
  if (!isTestLike && !looksLikeCheckCode) {
    return candidates;
  }

  const seenIfIdx = new Set();

  for (let idx = 0; idx < lines.length; idx += 1) {
    if (!hasAbsenceTerm(lines[idx])) continue;

    let ifIdx = idx;
    const codeView = buildCodeView(stripComment(lines[idx], 'node'));
    if (!/\bif\s*\(/.test(codeView)) {
      // 契約上の上限は「8 meaningful lines」(空行・コメント除く実効行)であり物理行数
      // ではない。物理行固定(旧6行)だとcomment/空行が多いflat-ifが候補ゼロで
      // fail-openするため、meaningful line基準の後方探索に修正(Issue #123固定構文v3)。
      let found = -1;
      let meaningfulSeen = 0;
      for (let back = idx; back >= 0 && meaningfulSeen <= FLAT_IF_MAX_MEANINGFUL; back -= 1) {
        const backView = buildCodeView(stripComment(lines[back], 'node'));
        if (/\bif\s*\(/.test(backView)) {
          found = back;
          break;
        }
        if (back !== idx && isMeaningfulNodeLine(lines[back])) {
          meaningfulSeen += 1;
        }
      }
      if (found === -1) continue;
      ifIdx = found;
    }

    if (seenIfIdx.has(ifIdx)) continue;
    seenIfIdx.add(ifIdx);

    candidates.push(buildNodeIfCandidate(lines, ifIdx, relPath));
  }

  return candidates;
}

function classifyNodeCandidate(c) {
  if (c.meaningfulCount > FLAT_IF_MAX_MEANINGFUL) {
    return { result: 'unknown', ruleId: 'SP003', reason: ['node_', 'sk', 'ip', '_propagation_unproven'].join('') };
  }
  if (c.conditionComplex) {
    return { result: 'unknown', ruleId: 'SP003', reason: ['node_', 'sk', 'ip', '_propagation_unproven'].join('') };
  }
  if (!c.interiorSimple || c.hasElse) {
    return { result: 'unknown', ruleId: 'SP003', reason: ['node_', 'sk', 'ip', '_propagation_unproven'].join('') };
  }
  if (c.hasSuccessExit) {
    // flat if内に明示的な正常終了(bare return等)がある場合、function前後の他statementの
    // 有無に関係なく同一候補をfailとする。「function bodyが当該ifだけ」という制限は、
    // 明示的終了文がない限定implicit returnの場合にだけ適用する(下のstrictOk分岐)。
    return { result: 'fail', ruleId: 'SP003', reason: ['node_', 'sk', 'ip', '_returns_success'].join('') };
  }
  if (c.hasFailureExit) {
    return null;
  }
  if (c.strictOk) {
    return { result: 'fail', ruleId: 'SP003', reason: ['node_', 'sk', 'ip', '_returns_success'].join('') };
  }
  return { result: 'unknown', ruleId: 'SP003', reason: ['node_', 'sk', 'ip', '_propagation_unproven'].join('') };
}

// ---------------------------------------------------------------------------
// SP004: Workflow / action YAML — 候補抽出
// ---------------------------------------------------------------------------

function isWorkflowScopePath(relPath) {
  return (
    /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i.test(relPath) ||
    /(?:^|\/)action\.ya?ml$/i.test(relPath)
  );
}

function noteStepKey(block, seenKeys, key) {
  if (seenKeys.has(key)) {
    block.hasDuplicateKey = true;
  }
  seenKeys.add(key);
}

function markAnchorAliasIfPresent(block, line) {
  // inline値付きanchor(`name: &label Run tests`)やcomment付きalias(`name: *label # comment`)も
  // 固定するため、行末までの一致を要求しない(Issue #123 固定構文v3 Workflow anchor/alias/merge key)。
  if (/:\s*&[A-Za-z0-9_]+/.test(line)) block.hasAnchorAlias = true;
  if (/:\s*\*[A-Za-z0-9_]+/.test(line)) block.hasAnchorAlias = true;
  if (/^\s*<<:\s*\*[A-Za-z0-9_]+/.test(line)) block.hasAnchorAlias = true;
  if (/^\s*-\s*\*[A-Za-z0-9_]+\s*$/.test(line)) block.hasAnchorAlias = true;
}

function parseStepBlock(lines, startIdx, endIdx, stepListIndent, stepKeyIndent, runBodyIndent) {
  const block = {
    startLine: startIdx + 1,
    name: null,
    id: null,
    runLines: [],
    uses: null,
    continueOnError: false,
    hasDisallowedKey: false,
    hasDuplicateKey: false,
    hasFoldedRun: false,
    hasChompingRun: false,
    hasExpression: false,
    hasAnchorAlias: false,
  };

  const seenKeys = new Set();

  const listLine = lines[startIdx];
  // `- run: |`/`|-`/`|+`はblock scalarの開始行でもあるため、`(.+)$`は本来
  // listInlineBlockが処理すべき行にも一致してしまう。block scalar indicatorの
  // 場合はここでnoteStepKeyを呼ばず、run keyの登録はlistInlineBlock側に一本化する
  // (二重登録によるhasDuplicateKey誤検知を防ぐ、Issue #123固定構文v3)。
  const listInlineRun = listLine.match(new RegExp(`^\\s{${stepListIndent}}-\\s+run:\\s*(.+)$`));
  if (listInlineRun) {
    const value = listInlineRun[1].trim();
    const isBlockScalarHeader = value === '|' || value === '|-' || value === '|+';
    if (!isBlockScalarHeader) {
      noteStepKey(block, seenKeys, 'run');
      if (value.length > 0 && value !== '>') {
        block.runLines.push({ lineNo: startIdx + 1, text: value });
      }
      if (value === '>') block.hasFoldedRun = true;
    } else if (value === '|-' || value === '|+') {
      block.hasChompingRun = true;
    }
  }

  // chomping indicator(`-`/`+`)は`|`の直後に1文字だけ付く。`(?:-\+)?`は
  // 「`-`の次に`+`」という2文字の並びを意味してしまい`|-`/`|+`単体に一致しない誤りだったため
  // `[-+]?`に修正(Issue #123固定構文v3)。
  const listInlineBlock = listLine.match(
    new RegExp(`^\\s{${stepListIndent}}-\\s+run:\\s*\\|[-+]?\\s*$`),
  );
  if (listInlineBlock) {
    noteStepKey(block, seenKeys, 'run');
    for (let j = startIdx + 1; j < endIdx; j += 1) {
      const bodyLine = lines[j];
      const bodyIndent = lineIndent(bodyLine);
      if (bodyIndent < runBodyIndent && bodyLine.trim().length > 0) break;
      if (bodyIndent >= runBodyIndent && bodyLine.trim().length > 0) {
        block.runLines.push({ lineNo: j + 1, text: bodyLine.trim() });
      }
    }
  }

  const listInlineName = listLine.match(new RegExp(`^\\s{${stepListIndent}}-\\s+name:\\s*(.+)$`));
  if (listInlineName) {
    noteStepKey(block, seenKeys, 'name');
    block.name = listInlineName[1].trim();
  }

  const listInlineId = listLine.match(new RegExp(`^\\s{${stepListIndent}}-\\s+id:\\s*(.+)$`));
  if (listInlineId) {
    noteStepKey(block, seenKeys, 'id');
    block.id = listInlineId[1].trim();
  }

  const listInlineUses = listLine.match(new RegExp(`^\\s{${stepListIndent}}-\\s+uses:\\s*(.+)$`, 'i'));
  if (listInlineUses) {
    noteStepKey(block, seenKeys, 'uses');
    block.uses = listInlineUses[1].trim();
  }

  const listInlineContinue = listLine.match(
    new RegExp(`^\\s{${stepListIndent}}-\\s+continue-on-error:\\s*(true|yes)\\s*$`, 'i'),
  );
  if (listInlineContinue) block.continueOnError = true;

  markAnchorAliasIfPresent(block, listLine);

  for (let i = startIdx; i < endIdx; i += 1) {
    const line = lines[i];
    const indent = lineIndent(line);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (indent === stepListIndent && /^-\s+/.test(trimmed) && i !== startIdx) {
      break;
    }

    if (indent < stepKeyIndent && indent > stepListIndent) {
      break;
    }

    if (/\$\{\{/.test(line)) block.hasExpression = true;
    if (/^\t/.test(line)) block.hasDisallowedKey = true;
    if (i !== startIdx) markAnchorAliasIfPresent(block, line);

    const nameMatch = line.match(new RegExp(`^\\s{${stepKeyIndent}}name:\\s*(.+)\\s*$`));
    if (nameMatch) block.name = nameMatch[1];

    const idMatch = line.match(new RegExp(`^\\s{${stepKeyIndent}}id:\\s*(.+)\\s*$`));
    if (idMatch) block.id = idMatch[1];

    const usesMatch = line.match(new RegExp(`^\\s{${stepKeyIndent}}uses:\\s*(.+)\\s*$`, 'i'));
    if (usesMatch) block.uses = usesMatch[1];

    const continueMatch = line.match(
      new RegExp(`^\\s{${stepKeyIndent}}continue-on-error:\\s*(true|yes)\\s*$`, 'i'),
    );
    if (continueMatch) block.continueOnError = true;

    const foldedRun = line.match(new RegExp(`^\\s{${stepKeyIndent}}run:\\s*>`));
    if (foldedRun) block.hasFoldedRun = true;

    const inlineRun = line.match(new RegExp(`^\\s{${stepKeyIndent}}run:\\s*(.+)$`));
    if (inlineRun) {
      const value = inlineRun[1].trim();
      if (value === '|' || value === '|-' || value === '|+') {
        if (value === '>') block.hasFoldedRun = true;
        if (value === '|-' || value === '|+') block.hasChompingRun = true;
      } else if (value.length > 0) {
        block.runLines.push({ lineNo: i + 1, text: value });
      }
    }

    // chomping indicator(`-`/`+`)は`|`の直後に1文字だけ付く。`(?:-\+)?`は
    // 「`-`の次に`+`」という2文字の並びを意味してしまい`run: |-`/`run: |+`単体に
    // 一致しない誤りだったため`[-+]?`に修正(Issue #123固定構文v3、step直下形式)。
    if (line.match(new RegExp(`^\\s{${stepKeyIndent}}run:\\s*\\|[-+]?\\s*$`))) {
      if (/run:\s*\|-/.test(line) || /run:\s*\|\+/.test(line)) {
        block.hasChompingRun = true;
      }
      for (let j = i + 1; j < endIdx; j += 1) {
        const bodyLine = lines[j];
        const bodyIndent = lineIndent(bodyLine);
        if (bodyIndent < runBodyIndent && bodyLine.trim().length > 0) break;
        if (bodyIndent >= runBodyIndent && bodyLine.trim().length > 0) {
          block.runLines.push({ lineNo: j + 1, text: bodyLine.trim() });
        }
      }
    }

    const keyMatch = line.match(new RegExp(`^\\s{${stepKeyIndent}}([A-Za-z0-9_-]+):`));
    if (keyMatch) {
      const key = keyMatch[1];
      noteStepKey(block, seenKeys, key);
      if (!WORKFLOW_ALLOWED_STEP_KEYS.includes(key)) {
        block.hasDisallowedKey = true;
      }
    }
  }

  return block;
}

function collectWorkflowStepBlocks(lines) {
  const blocks = [];
  let inJobs = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (inJobs && lineIndent(line) === 0 && isMeaningfulLine(line)) {
      inJobs = false;
    }
    if (!inJobs) continue;

    if (/^    steps:\s*$/.test(line)) {
      let j = i + 1;
      while (j < lines.length) {
        if (lineIndent(lines[j]) <= 2 && isMeaningfulLine(lines[j])) break;
        if (/^      -\s/.test(lines[j])) {
          const block = parseStepBlock(lines, j, lines.length, 6, 8, 10);
          blocks.push({ scope: 'workflow_step', block });
          j += 1;
          while (j < lines.length && !(lineIndent(lines[j]) === 6 && /^-\s/.test(lines[j].trim()))) {
            if (lineIndent(lines[j]) <= 4 && isMeaningfulLine(lines[j]) && !/^      -\s/.test(lines[j])) {
              break;
            }
            j += 1;
          }
          continue;
        }
        j += 1;
      }
    }
  }
  return blocks;
}

function collectCompositeStepBlocks(lines) {
  const blocks = [];
  let runsIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^runs:\s*$/.test(lines[i])) {
      runsIdx = i;
      break;
    }
  }
  if (runsIdx === -1) return blocks;

  let isComposite = false;
  for (let i = runsIdx + 1; i < lines.length; i += 1) {
    if (lineIndent(lines[i]) === 0 && isMeaningfulLine(lines[i])) break;
    if (/^  using:\s*composite\s*$/i.test(lines[i])) {
      isComposite = true;
      break;
    }
  }
  if (!isComposite) return blocks;

  for (let i = runsIdx + 1; i < lines.length; i += 1) {
    if (lineIndent(lines[i]) === 0 && isMeaningfulLine(lines[i])) break;
    if (!/^  steps:\s*$/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length) {
      if (lineIndent(lines[j]) < 2 && isMeaningfulLine(lines[j])) break;
      if (/^    -\s/.test(lines[j])) {
        const block = parseStepBlock(lines, j, lines.length, 4, 6, 8);
        blocks.push({ scope: 'composite_step', block });
        j += 1;
        while (j < lines.length && !(lineIndent(lines[j]) === 4 && /^-\s/.test(lines[j].trim()))) {
          if (lineIndent(lines[j]) <= 2 && isMeaningfulLine(lines[j]) && !/^    -\s/.test(lines[j])) {
            break;
          }
          j += 1;
        }
        continue;
      }
      j += 1;
    }
  }
  return blocks;
}

function jobHasTestPurpose(jobLines) {
  const slice = jobLines.join('\n');
  return WORKFLOW_TEST_STEP_RE.test(slice) || CHECK_PURPOSE_RE.test(slice);
}

// collectCompositeStepBlocksは`runs:`直下の`using: composite`/`steps:`を固定2-space
// indentでしか判定できない。有効なaction.yamlだが非標準indent(例: 1-space)の場合、
// isComposite判定自体が失敗しstepブロックが1つも収集されずfail-openする。indentを
// 問わず`runs:`セクション内にcomposite用途の`using:`/`steps:`があるかを緩く判定する
// (Issue #123固定構文v3、composite action版)。
function actionHasNonstandardCompositeSteps(lines) {
  let runsIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^runs:\s*$/.test(lines[i])) {
      runsIdx = i;
      break;
    }
  }
  if (runsIdx === -1) return false;

  let isComposite = false;
  let hasSteps = false;
  let hasStandardStepIndent = false;
  for (let i = runsIdx + 1; i < lines.length; i += 1) {
    if (lineIndent(lines[i]) === 0 && isMeaningfulLine(lines[i])) break;
    if (/^\s*using:\s*composite\s*$/i.test(lines[i])) isComposite = true;
    if (/^\s*steps:\s*$/.test(lines[i])) hasSteps = true;
    if (/^    -\s/.test(lines[i])) hasStandardStepIndent = true;
  }
  return isComposite && hasSteps && !hasStandardStepIndent;
}

// collectWorkflowStepBlocksは固定2/4/6-space indentのsteps:構造しか解析できない。
// 有効なYAMLだが非標準indent(例: 1-space)の場合、stepブロックが1つも収集されず
// test用途のcontinue-on-error等がそのままfail-open(finding 0)する。固定構文へ
// 分類不能な形はunknownにする契約のため、フォールバック候補を1件生成する
// (Issue #123固定構文v3)。
function jobHasStepsSection(jobLines) {
  return jobLines.some((jobLine) => /^\s*steps:\s*$/.test(jobLine));
}

function jobHasStandardStepIndent(jobLines) {
  return jobLines.some((jobLine) => /^      -\s/.test(jobLine));
}

function jobHasDynamicMatrix(jobLines) {
  let inStrategy = false;
  let inMatrix = false;
  for (const jobLine of jobLines) {
    const indent = lineIndent(jobLine);
    if (/^    strategy:\s*$/.test(jobLine)) {
      inStrategy = true;
      inMatrix = false;
      continue;
    }
    if (inStrategy && indent <= 4 && /^    [A-Za-z_]/.test(jobLine) && !/^    strategy:/.test(jobLine)) {
      inStrategy = false;
      inMatrix = false;
    }
    if (!inStrategy) continue;
    if (/^      matrix:/.test(jobLine)) {
      inMatrix = true;
      if (/\$\{\{/.test(jobLine) || /fromJSON\(/i.test(jobLine)) return true;
      continue;
    }
    if (inMatrix && indent >= 8) {
      if (/\$\{\{/.test(jobLine) || /fromJSON\(/i.test(jobLine)) return true;
    }
  }
  return false;
}

function extractJobLevelCandidates(lines, relPath) {
  const candidates = [];
  for (let i = 0; i < lines.length; i += 1) {
    const jobMatch = lines[i].match(/^  ([A-Za-z_][A-Za-z0-9_-]*):\s*$/);
    if (!jobMatch) continue;

    let jobEnd = lines.length;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^  [A-Za-z_][A-Za-z0-9_-]*:\s*$/.test(lines[j])) {
        jobEnd = j;
        break;
      }
      if (lineIndent(lines[j]) === 0 && isMeaningfulLine(lines[j])) {
        jobEnd = j;
        break;
      }
    }

    const jobLines = lines.slice(i, jobEnd);
    if (!jobHasTestPurpose(jobLines)) continue;

    const isReusableJob = jobLines.some((jobLine) => /^    uses:\s/.test(jobLine));
    if (isReusableJob) {
      candidates.push({ kind: 'workflow_job_reusable', path: relPath, line: i + 1 });
    }
    if (jobHasDynamicMatrix(jobLines)) {
      candidates.push({ kind: 'workflow_job_matrix', path: relPath, line: i + 1 });
    }
    if (
      !isReusableJob &&
      jobHasStepsSection(jobLines) &&
      !jobHasStandardStepIndent(jobLines)
    ) {
      candidates.push({ kind: 'workflow_job_nonstandard_step_indent', path: relPath, line: i + 1 });
    }
  }
  return candidates;
}

function isWorkflowTestStep(name, id, runText, usesText) {
  if (name && WORKFLOW_TEST_STEP_RE.test(name)) return true;
  if (id && WORKFLOW_TEST_STEP_RE.test(id)) return true;
  if (runText && (WORKFLOW_TEST_STEP_RE.test(runText) || CHECK_PURPOSE_RE.test(runText))) return true;
  if (usesText && (WORKFLOW_TEST_STEP_RE.test(usesText) || CHECK_PURPOSE_RE.test(usesText))) return true;
  return false;
}

function buildWorkflowStepCandidate(block, relPath) {
  const runText = block.runLines.map((entry) => entry.text).join('\n');
  const isTestStep = isWorkflowTestStep(block.name, block.id, runText, block.uses);
  const suppressed = block.runLines.some(
    (entry) => CHECK_PURPOSE_RE.test(entry.text) && SP001_SUPPRESS_RE.test(entry.text),
  );

  return {
    kind: 'workflow_step',
    path: relPath,
    line: block.startLine,
    isTestStep,
    hasStructuralIssue:
      block.hasDisallowedKey ||
      block.hasDuplicateKey ||
      block.hasFoldedRun ||
      block.hasChompingRun ||
      block.hasExpression ||
      block.hasAnchorAlias,
    continueOnError: block.continueOnError,
    hasUses: Boolean(block.uses),
    suppressed,
  };
}

function extractWorkflowCandidates(content, relPath) {
  if (!isWorkflowScopePath(relPath)) return [];

  const lines = content.split(/\r?\n/);
  const isAction = /(?:^|\/)action\.ya?ml$/i.test(relPath);
  const candidates = [];

  const stepBlocks = isAction ? collectCompositeStepBlocks(lines) : collectWorkflowStepBlocks(lines);
  for (const entry of stepBlocks) {
    candidates.push(buildWorkflowStepCandidate(entry.block, relPath));
  }

  if (!isAction) {
    candidates.push(...extractJobLevelCandidates(lines, relPath));
  } else if (
    stepBlocks.length === 0 &&
    actionHasNonstandardCompositeSteps(lines) &&
    (WORKFLOW_TEST_STEP_RE.test(content) || CHECK_PURPOSE_RE.test(content))
  ) {
    candidates.push({ kind: 'workflow_job_nonstandard_step_indent', path: relPath, line: 1 });
  }

  return candidates;
}

function classifyWorkflowStepCandidate(c) {
  if (!c.isTestStep) return null;

  if (c.continueOnError || c.suppressed) {
    return {
      result: 'fail',
      ruleId: 'SP004',
      reason: c.continueOnError ? 'workflow_continue_on_error' : 'workflow_shell_success_suppression',
    };
  }
  if (c.hasStructuralIssue) {
    return { result: 'unknown', ruleId: 'SP004', reason: 'workflow_structure_unsupported' };
  }
  if (c.hasUses) {
    return { result: 'unknown', ruleId: 'SP004', reason: 'workflow_delegated_failure_contract_unproven' };
  }
  return null;
}

function classifyWorkflowCandidate(c) {
  if (c.kind === 'workflow_step') return classifyWorkflowStepCandidate(c);
  if (c.kind === 'workflow_job_reusable') {
    return { result: 'unknown', ruleId: 'SP004', reason: 'workflow_reusable_job_unproven' };
  }
  if (c.kind === 'workflow_job_matrix') {
    return { result: 'unknown', ruleId: 'SP004', reason: 'workflow_dynamic_matrix_unproven' };
  }
  if (c.kind === 'workflow_job_nonstandard_step_indent') {
    return { result: 'unknown', ruleId: 'SP004', reason: 'workflow_nonstandard_step_indent_unproven' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// aggregator: 候補 → finding
// ---------------------------------------------------------------------------

function aggregateCandidates(candidates, classifyFn, relPath) {
  const findings = [];
  for (const candidate of candidates) {
    const verdict = classifyFn(candidate);
    if (!verdict) continue;
    findings.push({
      result: verdict.result,
      ruleId: verdict.ruleId,
      path: candidate.path || relPath,
      line: candidate.line,
      reason: verdict.reason,
    });
  }
  return findings;
}

function analyzeShell(content, relPath) {
  const candidates = extractShellCandidates(content, relPath);
  return aggregateCandidates(candidates, classifyShellCandidate, relPath);
}

function analyzeNode(content, relPath) {
  const candidates = extractNodeCandidates(content, relPath);
  return aggregateCandidates(candidates, classifyNodeCandidate, relPath);
}

function analyzeWorkflow(content, relPath) {
  const candidates = extractWorkflowCandidates(content, relPath);
  return aggregateCandidates(candidates, classifyWorkflowCandidate, relPath);
}

function tracksReturnInBranch(branchLines) {
  const block = branchLines.map((line) => stripComment(line, 'node')).join('\n');
  return /\bprocess\.exit\s*\(|process\.exitCode\s*=|throw\b/.test(block);
}

function getNodeBranchRange(lines, idx) {
  let start = idx;
  for (let i = idx; i >= 0; i -= 1) {
    const stripped = stripComment(lines[i], 'node');
    if (/\bif\s*\(/.test(stripped)) {
      start = i;
      break;
    }
  }

  let depth = 0;
  let started = false;
  let end = start;
  for (let i = start; i < lines.length; i += 1) {
    const stripped = stripComment(lines[i], 'node');
    for (const ch of stripped) {
      if (ch === '{') {
        depth += 1;
        started = true;
      } else if (ch === '}') {
        depth -= 1;
      }
    }
    end = i;
    if (started && depth <= 0) {
      break;
    }
  }

  if (!started) {
    end = Math.min(lines.length - 1, idx + 4);
  }
  return { start, end };
}

function analyzeFile(relPath, content) {
  const ext = path.posix.extname(relPath);
  if (SHELL_EXTENSIONS.has(ext)) {
    return analyzeShell(content, relPath);
  }
  if (NODE_EXTENSIONS.has(ext)) {
    return analyzeNode(content, relPath);
  }
  if (YAML_EXTENSIONS.has(ext)) {
    return analyzeWorkflow(content, relPath);
  }
  return [];
}

function pickPrimaryFinding(findings, resultKind) {
  const filtered = findings.filter((finding) => finding.result === resultKind);
  if (filtered.length === 0) return null;
  filtered.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    if (a.line !== b.line) return a.line - b.line;
    return a.ruleId.localeCompare(b.ruleId);
  });
  return filtered[0];
}

function pickOverallResult(findings) {
  if (findings.length === 0) {
    return { result: 'pass', primary: null };
  }
  const unknown = pickPrimaryFinding(findings, 'unknown');
  if (unknown) {
    return { result: 'blocked', primary: unknown };
  }
  const fail = pickPrimaryFinding(findings, 'fail');
  if (fail) {
    return { result: 'fail', primary: fail };
  }
  return { result: 'pass', primary: null };
}

function printResult(lines) {
  process.stdout.write(`${RESULT_HEADER}\n`);
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
}

function withContract(lines) {
  return [`syntax_contract=${SYNTAX_CONTRACT}`, ...lines];
}

function runChecker({ base, head, cwd }) {
  const baseResolved = resolveCommit(base, cwd);
  if (!baseResolved) {
    throw new StopResult('base_sha_unresolved');
  }
  const headResolved = resolveCommit(head, cwd);
  if (!headResolved) {
    throw new StopResult('head_sha_unresolved');
  }
  if (!isAncestor(base, head, cwd)) {
    throw new StopResult('checker_internal_error');
  }

  const targetPaths = listTargetChanges(base, head, cwd);
  if (targetPaths.length === 0) {
    return {
      exitCode: 0,
      lines: withContract([
        'result=pass',
        'applicable=false',
        'checked_file_count=0',
        'fail_count=0',
        'unknown_count=0',
        'stop_reason=none',
      ]),
    };
  }

  const allFindings = [];
  let checkedCount = 0;

  for (const relPath of targetPaths) {
    const blob = readBlobAtCommit(head, relPath, cwd);
    if (blob.kind === 'missing') {
      throw new StopResult('checker_internal_error');
    }
    if (blob.kind === 'too_large') {
      throw new StopResult('target_file_too_large', [
        `rule_id=SP002`,
        `path=${relPath}`,
        `line=0`,
        `reason=target_file_too_large`,
      ]);
    }
    if (blob.kind === 'binary') {
      throw new StopResult('binary_target_file', [
        `rule_id=SP002`,
        `path=${relPath}`,
        `line=0`,
        `reason=binary_target_file`,
      ]);
    }
    if (blob.kind === 'encoding') {
      throw new StopResult('unsupported_encoding', [
        `rule_id=SP002`,
        `path=${relPath}`,
        `line=0`,
        `reason=unsupported_encoding`,
      ]);
    }

    checkedCount += 1;
    const findings = analyzeFile(relPath, blob.content);
    allFindings.push(...findings);
  }

  const failCount = allFindings.filter((f) => f.result === 'fail').length;
  const unknownCount = allFindings.filter((f) => f.result === 'unknown').length;
  const overall = pickOverallResult(allFindings);

  if (overall.result === 'pass') {
    return {
      exitCode: 0,
      lines: withContract([
        'result=pass',
        'applicable=true',
        `checked_file_count=${checkedCount}`,
        'fail_count=0',
        'unknown_count=0',
        'stop_reason=none',
      ]),
    };
  }

  const primary = overall.primary;
  const stopReason =
    overall.result === 'blocked' ? 'static_analysis_unknown' : 'known_bypass_detected';

  return {
    exitCode: 1,
    lines: withContract([
      `result=${overall.result}`,
      `rule_id=${primary.ruleId}`,
      `path=${primary.path}`,
      `line=${primary.line}`,
      `reason=${primary.reason}`,
      `applicable=true`,
      `checked_file_count=${checkedCount}`,
      `fail_count=${failCount}`,
      `unknown_count=${unknownCount}`,
      `stop_reason=${stopReason}`,
    ]),
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`usage error: ${err.message}\n`);
    process.stderr.write(
      'usage: node fail-closed-success-propagation.cjs --base <commit_sha> --head <commit_sha>\n',
    );
    process.exitCode = 2;
    return;
  }

  try {
    const { exitCode, lines } = runChecker({
      base: args.base,
      head: args.head,
      cwd: process.cwd(),
    });
    printResult(lines);
    process.exitCode = exitCode;
  } catch (err) {
    if (err instanceof StopResult) {
      const lines = withContract(['result=blocked', `stop_reason=${err.stopReason}`, ...err.extraLines]);
      printResult(lines);
      process.exitCode = 1;
      return;
    }
    printResult(withContract(['result=blocked', 'stop_reason=checker_internal_error']));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runChecker,
  parseArgs,
  analyzeFile,
  analyzeShell,
  analyzeNode,
  analyzeWorkflow,
  isWorkflowTestStep,
  getNodeBranchRange,
  tracksReturnInBranch,
  hasIfNotFailureStop,
  isValidUtf8,
  blobSizeAtCommit,
  readBlobAtCommit,
  listTargetChanges,
  hasTargetExtension,
  pickOverallResult,
  pickPrimaryFinding,
  StopResult,
  UsageError,
  SYNTAX_CONTRACT,
  buildCodeView,
  hasAbsenceTerm,
  absenceTermOutsideStrings,
  isSimpleNodeCondition,
  getEnclosingFunctionBody,
  isLimitedImplicitReturnIf,
  isLimitedImplicitReturnIfStrict,
  isLoneClosingBraceLine,
  extractShellCandidates,
  extractNodeCandidates,
  extractWorkflowCandidates,
  isWorkflowScopePath,
  RESULT_HEADER,
};
