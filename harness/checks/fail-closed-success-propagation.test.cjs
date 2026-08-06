'use strict';

// Issue #123: fail-closed-success-propagation.cjs の正常系・異常系を実git fixtureで再現する。
// node:test / node:assert のみ。fixture構築失敗は終了コード0扱いにしない。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const checker = require('./fail-closed-success-propagation.cjs');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'success-propagation-'));
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'user.name', 'Success Propagation Test'], dir);
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

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runOnRepo(dir, baseSha, headSha) {
  try {
    return checker.runChecker({ base: baseSha, head: headSha, cwd: dir });
  } catch (err) {
    if (err instanceof checker.StopResult) {
      return {
        exitCode: 1,
        lines: ['result=blocked', `stop_reason=${err.stopReason}`, ...err.extraLines],
      };
    }
    throw err;
  }
}

function fixtureExplicitPropagationShell() {
  const pause = ['sl', 'eep', ' 5'].join('');
  // fail_closedは単一statement(exit n単体)の定義でなければconfirmedFailClosedへ
  // 確定登録されない契約(R5参照)のため、echo文を含む複数statement定義にすると
  // hasProofOnLineがfalseになり証明されない。fixtureは単一statement定義に保つ。
  return [
    '#!/bin/bash',
    'set -e',
    'fail_closed() { exit 1; }',
    `${pause} 2>/dev/null || fail_closed`,
    '',
  ].join('\n');
}

function fixtureUnprovenPauseShell() {
  const pause = ['sl', 'eep', ' 5'].join('');
  return ['#!/bin/bash', 'echo start', pause, 'echo done', ''].join('\n');
}

function fixturePr157NodeBypass() {
  const status = ['sk', 'ipped'].join('');
  const reason = ['bash ', 'un', 'available'].join('');
  return [
    "'use strict';",
    'function runShellTest() {',
    '  if (!process.env.HAS_BASH) {',
    `    console.log('${status}: ${reason}');`,
    '    return;',
    '  }',
    '  process.exit(1);',
    '}',
    'runShellTest();',
    '',
  ].join('\n');
}

function fixturePromiseResolveBypass() {
  const status = ['sk', 'ipped'].join('');
  const reason = ['tool ', 'un', 'available'].join('');
  return [
    "'use strict';",
    'function verifyTool() {',
    '  if (!process.env.TOOL) {',
    `    console.log('${status}: ${reason}');`,
    '    return Promise.resolve();',
    '  }',
    '  process.exit(1);',
    '}',
    'verifyTool();',
    '',
  ].join('\n');
}

function fixtureCheckerHarnessBypass() {
  const status = ['sk', 'ipped'].join('');
  const reason = ['bash ', 'un', 'available'].join('');
  return [
    "'use strict';",
    'function runVerify() {',
    '  if (!process.env.HAS_BASH) {',
    `    console.log('${status}: ${reason}');`,
    '    return;',
    '  }',
    '  process.exit(1);',
    '}',
    'runVerify();',
    '',
  ].join('\n');
}

function writeAndCommitBinary(dir, relPath, buffer, message) {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  git(['add', relPath], dir);
  git(['commit', '-q', '-m', message], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

function fixtureGeneratedBypassJs() {
  const status = ['sk', 'ipped'].join('');
  const reason = ['tool ', 'un', 'available'].join('');
  return [
    'if (!globalThis.__tool) {',
    `  console.log('${status}: ${reason}');`,
    '  return;',
    '}',
    '',
  ].join('\n');
}

test('対象ファイルなし: pass applicable=false', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'README.md', '# readme\n', 'base');
    const headSha = baseSha;
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(result.lines.includes('applicable=false'));
    assert.ok(result.lines.includes('stop_reason=none'));
  } finally {
    cleanup(dir);
  }
});

test('AC2 pass候補: 明示的failure伝播', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/ok.sh', '#!/bin/bash\nset -e\n', 'base');
    const headSha = writeAndCommit(dir, 'scripts/ok.sh', fixtureExplicitPropagationShell(), 'explicit propagation');

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(result.lines.includes('applicable=true'));
  } finally {
    cleanup(dir);
  }
});

test('AC2 blocked: 未処理外部コマンドは SP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/bad.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(dir, 'scripts/bad.sh', fixtureUnprovenPauseShell(), 'unproven pause');

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_failure_propagation_unproven'));
    assert.ok(result.lines.includes('stop_reason=static_analysis_unknown'));
  } finally {
    cleanup(dir);
  }
});

test('AC2 fail: PR #157相当の成功扱い迂回は SP003', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      fixturePr157NodeBypass(),
      'bypass success',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
    assert.ok(result.lines.includes('stop_reason=known_bypass_detected'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 fail: shell の || true は SP001', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/check.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/check.sh',
      `#!/bin/bash
npm test || true
`,
      'suppress failure',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP001'));
    assert.ok(result.lines.includes('reason=shell_success_suppression'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 fail: Workflow continue-on-error は SP004', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run unit test
        continue-on-error: true
        run: npm test
`,
      'workflow suppress',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_continue_on_error'));
  } finally {
    cleanup(dir);
  }
});

test('AC1: deleteのみは非対象、renameは新パス側を検査', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'old/script.sh', '#!/bin/bash\necho old\n', 'base');
    fs.mkdirSync(path.join(dir, 'new'), { recursive: true });
    fs.renameSync(path.join(dir, 'old', 'script.sh'), path.join(dir, 'new', 'script.sh'));
    git(['add', '-A'], dir);
    git(['commit', '-q', '-m', 'rename'], dir);
    const headSha = git(['rev-parse', 'HEAD'], dir);

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(result.lines.includes('applicable=true'));
    assert.ok(result.lines.includes('checked_file_count=1'));
  } finally {
    cleanup(dir);
  }
});

test('AC1: generated file も対象拡張子なら検査する', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'kept.txt', 'x\n', 'base');
    // AC1 修正後は「test/spec拡張子・test|tests|__tests__|check|checks path segment・
    // 本文にPURPOSE_TOKEN」のいずれかでのみ対象化される。generated file が除外されない
    // ことを確認する対象として checks/ 配下に置く（path segment 経由で対象化）。
    const headSha = writeAndCommit(
      dir,
      'checks/gen/bundle.generated.js',
      fixtureGeneratedBypassJs(),
      'generated bypass',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('rule_id=SP003'));
  } finally {
    cleanup(dir);
  }
});

test('base_sha_unresolved は blocked', () => {
  const dir = makeRepo();
  try {
    const headSha = writeAndCommit(dir, 'a.sh', '#!/bin/bash\n', 'head');
    assert.throws(
      () => checker.runChecker({ base: '0'.repeat(40), head: headSha, cwd: dir }),
      (err) => err instanceof checker.StopResult && err.stopReason === 'base_sha_unresolved',
    );
  } finally {
    cleanup(dir);
  }
});

test('head_sha_unresolved は blocked', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'a.sh', '#!/bin/bash\n', 'base');
    assert.throws(
      () => checker.runChecker({ base: baseSha, head: 'f'.repeat(40), cwd: dir }),
      (err) => err instanceof checker.StopResult && err.stopReason === 'head_sha_unresolved',
    );
  } finally {
    cleanup(dir);
  }
});

test('parseArgs: 必須引数欠落は UsageError', () => {
  assert.throws(() => checker.parseArgs(['--base', 'a'.repeat(40)]), checker.UsageError);
});

test('pickOverallResult: unknown があれば blocked を優先', () => {
  const overall = checker.pickOverallResult([
    { result: 'fail', ruleId: 'SP001', path: 'a.sh', line: 1, reason: 'x' },
    { result: 'unknown', ruleId: 'SP002', path: 'b.sh', line: 2, reason: 'y' },
  ]);
  assert.equal(overall.result, 'blocked');
  assert.equal(overall.primary.ruleId, 'SP002');
  assert.equal(overall.primary.path, 'b.sh');
});

test('analyzeShell unit: set -e 下の外部コマンドは pass 候補', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const findings = checker.analyzeShell(`#!/bin/bash\nset -e\n${pause}\n`, 'unit.sh');
  assert.equal(findings.length, 0);
});

test('AC3 fail: nameなしWorkflow step の || true は SP004', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test || true
`,
      'unnamed workflow suppress',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_shell_success_suppression'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 fail: harness/checks の check用途コードも SP003 対象', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example-verify.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example-verify.cjs',
      fixtureCheckerHarnessBypass(),
      'checker harness bypass',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 fail: return Promise.resolve() は SP003', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      fixturePromiseResolveBypass(),
      'promise resolve bypass',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('AC2 blocked: if ! だけでは伝播証明にならない', () => {
  const dir = makeRepo();
  try {
    const pause = ['sl', 'eep', ' 5'].join('');
    const baseSha = writeAndCommit(dir, 'scripts/ifnot.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/ifnot.sh',
      `#!/bin/bash
if ! ${pause}; then
  echo failed
fi
`,
      'if not without stop',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('blocked: 不正UTF-8は unsupported_encoding', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/ok.sh', '#!/bin/bash\n', 'base');
    const invalidUtf8 = Buffer.from([0xff, 0xfe, 0xfd, 0x0a]);
    const headSha = writeAndCommitBinary(dir, 'scripts/bad.sh', invalidUtf8, 'invalid utf8');

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('stop_reason=unsupported_encoding'));
    assert.ok(result.lines.includes('reason=unsupported_encoding'));
  } finally {
    cleanup(dir);
  }
});

test('blocked: 上限超過は target_file_too_large', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/ok.sh', '#!/bin/bash\n', 'base');
    const oversized = Buffer.alloc(512 * 1024 + 1, 0x61);
    const headSha = writeAndCommitBinary(dir, 'scripts/large.sh', oversized, 'too large');

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('stop_reason=target_file_too_large'));
    assert.ok(result.lines.includes('reason=target_file_too_large'));
  } finally {
    cleanup(dir);
  }
});

test('analyzeShell unit: if ! だけでは SP002 proof にならない', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const findings = checker.analyzeShell(
    `#!/bin/bash\nif ! ${pause}; then\n  echo failed\nfi\n`,
    'unit.sh',
  );
  assert.ok(findings.some((finding) => finding.ruleId === 'SP002'));
});

test('analyzeNode unit: Promise.resolve は欠落時successとして fail', () => {
  const status = ['sk', 'ipped'].join('');
  const missing = ['un', 'avail', 'able'].join('');
  const findings = checker.analyzeNode(
    `if (!tool) {\n  console.log('${status}: ${missing}');\n  return Promise.resolve();\n}\n`,
    'harness/checks/example-verify.cjs',
  );
  assert.ok(findings.some((finding) => finding.reason === 'node_skip_returns_success'));
});

test('isValidUtf8 unit: 不正シーケンスを拒否', () => {
  assert.equal(checker.isValidUtf8(Buffer.from([0xff, 0xfe, 0xfd])), false);
  assert.equal(checker.isValidUtf8(Buffer.from('ok\n', 'utf8')), true);
});

test('analyzeNode unit: throw 後は fail ではなく unknown/未検出', () => {
  const missing = ['un', 'available'].join('');
  const findings = checker.analyzeNode(
    `if (!tool) {\n  throw new Error('${missing}');\n}\n`,
    'unit.test.cjs',
  );
  assert.equal(findings.length, 0);
});

test('AC3 fail: nameなし複数行 run: | の || true は SP004', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: |
          npm test || true
`,
      'multiline workflow suppress',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_shell_success_suppression'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 fail: - id: test の continue-on-error は SP004', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: test
        continue-on-error: true
        run: echo run
`,
      'id step suppress',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_continue_on_error'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: test用途の外部actionは SP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests
        uses: vendor/test-action@v1
`,
      'delegated action',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_delegated_failure_contract_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('AC2 blocked: if ! 分岐の bare return は伝播証明にならない', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/verify.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/verify.sh',
      `#!/bin/bash
verify() {
  if ! npm test; then
    echo failed
    return
  fi
}
verify
`,
      'bare return proof',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 fail: 別分岐の throw は欠落分岐の failure 証明に使わない', () => {
  const dir = makeRepo();
  try {
    const status = ['sk', 'ipped'].join('');
    const reason = ['un', 'available'].join('');
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function verify() {
  if (!tool) {
    console.log('${status}: ${reason}');
    return;
  }
  throw new Error('later failure');
}
verify();
`,
      'cross branch throw',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('自checkerは path 除外せず、自己誤検出しない', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const checkerPath = path.join(__dirname, 'fail-closed-success-propagation.cjs');
  const content = fs.readFileSync(checkerPath, 'utf8');
  const findings = checker.analyzeNode(content, 'harness/checks/fail-closed-success-propagation.cjs');
  assert.equal(findings.length, 0);
});

test('hasIfNotFailureStop unit: bare return は failure 停止ではない', () => {
  const lines = ['if ! npm test; then', '  echo failed', '  return', 'fi'];
  assert.equal(checker.hasIfNotFailureStop(lines, 0), false);
});

test('AC2: npm test || true は SP001 のみ（SP002=0）', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/check.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/check.sh',
      '#!/bin/bash\nnpm test || true\n',
      'suppress only sp001',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP001'));
    assert.ok(result.lines.includes('fail_count=1'));
    assert.ok(result.lines.includes('unknown_count=0'));
    assert.ok(!result.lines.some((line) => line.includes('rule_id=SP002')));
  } finally {
    cleanup(dir);
  }
});

test('AC2 pass候補: set -o errexit', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/errexit.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/errexit.sh',
      `#!/bin/bash\nset -o errexit\n${pause}\n`,
      'errexit pass',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('AC2 pass候補: || exit 1', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/exit1.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/exit1.sh',
      '#!/bin/bash\nnpm test || exit 1\n',
      'explicit exit 1',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('AC2 fail: 限定implicit return は SP003', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['bash ', 'un', 'available'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function runShellTest() {
  if (!process.env.HAS_BASH) {
    console.log('${status}: ${reason}');
    return;
  }
}
runShellTest();
`,
      'limited implicit return',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
  } finally {
    cleanup(dir);
  }
});

test('AC1: deleteのみは applicable=false', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/remove.sh', '#!/bin/bash\necho x\n', 'base');
    git(['rm', 'scripts/remove.sh'], dir);
    git(['commit', '-q', '-m', 'delete only'], dir);
    const headSha = git(['rev-parse', 'HEAD'], dir);
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('applicable=false'));
    assert.ok(result.lines.includes('checked_file_count=0'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: fi後の bare return は SP002 unknown', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/fi-return.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/fi-return.sh',
      `#!/bin/bash
if ! ${pause}; then
  exit 1
fi
return
`,
      'return after fi',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: Node if/else は SP003 unknown', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['tool ', 'un', 'available'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
if (!process.env.TOOL) {
  console.log('${status}: ${reason}');
  process.exit(1);
} else {
  process.exit(0);
}
`,
      'if else unknown',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP003'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: 複雑condition && は SP003 unknown', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['runtime ', 'un', 'available'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
if (!ready && missing) {
  console.log('${status}: ${reason}');
  process.exit(1);
}
`,
      'complex condition',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP003'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: optional chaining condition は SP003 unknown', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['tool ', 'un', 'available'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
if (foo?.bar) {
  console.log('${status}: ${reason}');
  process.exit(1);
}
`,
      'optional chaining',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP003'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 pass: gift/different/classify 識別子は禁止token非該当', () => {
  const findings = checker.analyzeNode(
    `const gift = 1;\nconst different = 2;\nconst classify = 3;\nif (gift === 0) { process.exit(1); }\n`,
    'harness/checks/example.test.cjs',
  );
  assert.equal(findings.length, 0);
});

test('AC3 pass: 文字列内の if は禁止token非該当', () => {
  const status = ['sk', 'ipped'].join('');
  const findings = checker.analyzeNode(
    `if (!tool) {\n  console.log('${status} if note');\n  process.exit(1);\n}\n`,
    'harness/checks/example.test.cjs',
  );
  assert.equal(findings.length, 0);
});

test('AC3 blocked: function call condition は SP003 unknown', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['tool ', 'un', 'available'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
if (!isReady()) {
  console.log('${status}: ${reason}');
  process.exit(1);
}
`,
      'function call condition',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(!result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('G5a AC3: 前後にstatementがあっても明示的successはSP003 fail', () => {
  // Codex技術PM再裁定(#5152685893)グループ5: flat if内にbare return等の明示的な正常終了が
  // ある場合、function前後statementの有無に関係なく同一候補をfailとする。このfixtureは
  // 旧「複雑implicit return」テストと同一だが、実体は bare return を持つ明示的success candidate
  // であり、限定implicit return(strictOk)の制限を適用すべきではない。
  const status = ['sk', 'ipped'].join('');
  const reason = ['bash ', 'un', 'available'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function runShellTest() {
  prepare();
  if (!process.env.HAS_BASH) {
    console.log('${status}: ${reason}');
    return;
  }
  process.exit(1);
}
runShellTest();
`,
      'explicit success with surrounding statements',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('G5b AC3: 前後statement付きで明示的終了のないimplicit returnはSP003 unknown', () => {
  // G5aとの対比: if内に明示的な終了文(bare return等)が一切なく、function前後に他の
  // statementがある「限定implicit return」の本来のケース。この場合はstrictOkの制限
  // (function bodyが当該ifだけ)が適用され続け、unknownのままであること。
  const status = ['sk', 'ipped'].join('');
  const reason = ['bash ', 'un', 'available'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function runShellTest() {
  prepare();
  if (!process.env.HAS_BASH) {
    console.log('${status}: ${reason}');
  }
  process.exit(1);
}
runShellTest();
`,
      'implicit fallthrough with surrounding statements',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_propagation_unproven'));
    assert.ok(!result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: reusable workflow job uses は SP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    uses: org/reusable@test
    steps:
      - run: echo noop
`,
      'reusable job',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_reusable_job_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: dynamic matrix は SP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: \${{ fromJSON('["a","b"]') }}
    steps:
      - name: Run tests
        run: npm test
`,
      'dynamic matrix',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_dynamic_matrix_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: uses先行 step は SP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: vendor/test-action@v1
        name: Run tests
`,
      'uses before name',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 blocked: run: > は SP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests
        run: >
          npm test
`,
      'folded run',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 pass: Workflow scope外 list は候補ゼロ', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
permissions:
  - name: test
    value: read
`,
      'scope outside steps',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('AC3 fail: composite runs.steps continue-on-error は SP004', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'action.yml', 'name: x\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'action.yml',
      `name: test-action
runs:
  using: composite
  steps:
    - name: Run unit test
      continue-on-error: true
      run: npm test
`,
      'composite suppress',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP004'));
  } finally {
    cleanup(dir);
  }
});

test('AC4: 出力に syntax_contract 行を含む', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'README.md', '# readme\n', 'base');
    const headSha = baseSha;
    const result = runOnRepo(dir, baseSha, headSha);
    assert.ok(result.lines.includes(`syntax_contract=${checker.SYNTAX_CONTRACT}`));
  } finally {
    cleanup(dir);
  }
});

test('AC4: PR差分自己検査で test.cjs が誤検出されない', () => {
  const dir = makeRepo();
  try {
    const checkerPath = path.join(__dirname, 'fail-closed-success-propagation.cjs');
    const testPath = path.join(__dirname, 'fail-closed-success-propagation.test.cjs');
    const workflowPath = path.join(
      __dirname,
      '..',
      '..',
      '.github',
      'workflows',
      'fail-closed-success-propagation.yml',
    );
    const baseSha = writeAndCommit(dir, 'README.md', '# readme\n', 'base');
    writeAndCommit(dir, 'harness/checks/fail-closed-success-propagation.cjs', fs.readFileSync(checkerPath, 'utf8'), 'checker');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/fail-closed-success-propagation.test.cjs',
      fs.readFileSync(testPath, 'utf8'),
      'tests',
    );
    writeAndCommit(
      dir,
      '.github/workflows/fail-closed-success-propagation.yml',
      fs.readFileSync(workflowPath, 'utf8'),
      'workflow',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(result.lines.includes(`syntax_contract=${checker.SYNTAX_CONTRACT}`));
  } finally {
    cleanup(dir);
  }
});

test('S1: 先頭3 meaningful後の set -e は SP002 unknown', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/late-errexit.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/late-errexit.sh',
      `#!/bin/bash
echo one
echo two
echo three
set -e
${pause}
`,
      'late errexit',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('S2: sleep && exit 1 は SP002 unknown', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/and-exit.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/and-exit.sh',
      `#!/bin/bash
${pause} && exit 1
`,
      'and exit proof',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('S3: status=$? 参照だけでは SP002 unknown', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/status-ref.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/status-ref.sh',
      `#!/bin/bash
${pause}
status=$?
echo done
`,
      'status ref only',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('S4: fi後の return 1 は SP002 unknown', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/fi-return1.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/fi-return1.sh',
      `#!/bin/bash
if ! ${pause}; then
  echo failed
fi
return 1
`,
      'return after fi',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('N1: bare returnなし限定implicit return は SP003 fail', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['un', 'avail', 'able'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function run() {
  if (!tool) {
    console.log('${status}: ${reason}');
  }
}
run();
`,
      'implicit without return',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('N2: bash+missing ABSENCE_TERM は SP003 fail', () => {
  const missing = ['bash', ' missing'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function run() {
  if (!hasBash) {
    console.log('${missing}');
    return;
  }
  process.exit(1);
}
run();
`,
      'N2 regression fixture',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
  } finally {
    cleanup(dir);
  }
});

test('N3: 8 meaningful lines超 flat if は SP003 unknown', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['tool ', 'un', 'available'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
if (!tool) {
  console.log('${status}: ${reason}');
  console.log('line2');
  console.log('line3');
  console.log('line4');
  console.log('line5');
  console.log('line6');
  console.log('line7');
  return;
}
`,
      'long flat if',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(!result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('W1: uses-only test step は SP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: vendor/test-action@v1
`,
      'uses only test step',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
  } finally {
    cleanup(dir);
  }
});

test('W2: run: |- は SP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests
        run: |-
          npm test
`,
      'chomping strip run',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('W3: step内重複key は SP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests
        name: Duplicate test
        run: npm test
`,
      'duplicate step key',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('W4: composite scope外 steps は候補ゼロ', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'action.yml', 'name: x\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'action.yml',
      `name: nested-action
metadata:
  using: composite
  steps:
    - name: Run unit test
      continue-on-error: true
      run: npm test
`,
      'scope outside runs',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('W5: static matrix + matrix外 expression は dynamic matrix findingなし', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        target: [a, b]
    env:
      LABEL: \${{ github.ref }}
    steps:
      - name: Run tests
        run: npm test
`,
      'static matrix outside expr',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(!result.lines.some((line) => line.includes('workflow_dynamic_matrix_unproven')));
  } finally {
    cleanup(dir);
  }
});

test('P1: primary finding は path→line→rule_id 昇順', () => {
  const overall = checker.pickOverallResult([
    { result: 'unknown', ruleId: 'SP004', path: 'z.yml', line: 1, reason: 'a' },
    { result: 'unknown', ruleId: 'SP002', path: 'a.sh', line: 2, reason: 'b' },
    { result: 'unknown', ruleId: 'SP003', path: 'a.sh', line: 2, reason: 'c' },
  ]);
  assert.equal(overall.result, 'blocked');
  assert.equal(overall.primary.path, 'a.sh');
  assert.equal(overall.primary.line, 2);
  assert.equal(overall.primary.ruleId, 'SP002');
});

// ---------------------------------------------------------------------------
// R系: ChatGPT要件レビュー(#5152301984)・Codex技術PM再裁定(#5152345374)で指摘された
// AC1-AC3の境界反例、および候補モデル再構成に伴う自己反証(falsificationism)で
// 見つけた追加反例を固定する。
// ---------------------------------------------------------------------------

test('R1 AC1: workflows/action 以外の YAML は SP004 対象外(候補ゼロ)', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'config.yml', 'name: x\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'config.yml',
      `name: x
jobs:
  test:
    steps:
      - run: npm test || true
`,
      'non workflow yaml',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(result.lines.includes('applicable=true'));
  } finally {
    cleanup(dir);
  }
});

test('R2 AC1: PURPOSE_TOKENも test path segmentもない Node ファイルは対象外', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['tool ', 'un', 'available'].join('');
  const findings = checker.analyzeNode(
    `function render() {\n  if (!tool) {\n    console.log('${status}: ${reason}');\n    return;\n  }\n}\n`,
    'src/ui.js',
  );
  assert.equal(findings.length, 0);
});

test('R3 AC2: 先頭の NAME=value を読み飛ばして TARGET_COMMAND を認識する', () => {
  const dir = makeRepo();
  try {
    const pause = ['sl', 'eep', ' 5'].join('');
    const baseSha = writeAndCommit(dir, 'scripts/envprefix.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/envprefix.sh',
      `#!/bin/bash\nFOO=1 ${pause}\n`,
      'env prefix command',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('R4 AC2: exit の引数が正の整数でなければ pass 証明にならない', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/badexit.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/badexit.sh',
      '#!/bin/bash\nnpm test || exit nope\n',
      'non numeric exit',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('R5 AC2: fail_closed が exit 単独定義でなければ証明に使えない', () => {
  const dir = makeRepo();
  try {
    const pause = ['sl', 'eep', ' 5'].join('');
    const baseSha = writeAndCommit(dir, 'scripts/badclosed.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/badclosed.sh',
      `#!/bin/bash\nfail_closed() { echo bad; exit 1; }\n${pause} || fail_closed\n`,
      'unconfirmed fail_closed',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('R6 AC2: fail_closed が exit 0 の定義では証明に使えない', () => {
  const dir = makeRepo();
  try {
    const pause = ['sl', 'eep', ' 5'].join('');
    const baseSha = writeAndCommit(dir, 'scripts/exit0closed.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/exit0closed.sh',
      `#!/bin/bash\nfail_closed() { exit 0; }\n${pause} || fail_closed\n`,
      'exit0 fail_closed',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('R7 AC2: fail_closed が exit n(n>=1) 単独定義なら証明として使える', () => {
  const dir = makeRepo();
  try {
    const pause = ['sl', 'eep', ' 5'].join('');
    const baseSha = writeAndCommit(dir, 'scripts/goodclosed.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/goodclosed.sh',
      `#!/bin/bash\nfail_closed() { exit 1; }\n${pause} || fail_closed\n`,
      'confirmed fail_closed',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('R8 AC2: nested if! は flat でないため伝播証明にならない', () => {
  const dir = makeRepo();
  try {
    const pause = ['sl', 'eep', ' 5'].join('');
    const baseSha = writeAndCommit(dir, 'scripts/nestedifnot.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/nestedifnot.sh',
      `#!/bin/bash
if ! ${pause}; then
  if true; then
    exit 1
  fi
fi
`,
      'nested if not',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('R9 AC3: 同一候補内で成功終了がある場合は fail が優先される', () => {
  const dir = makeRepo();
  try {
    const status = ['sk', 'ipped'].join('');
    const reason = ['un', 'avail', 'able'].join('');
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function verify() {
  if (!tool) {
    console.log('${status}: ${reason}');
    return;
    throw new Error('unreachable');
  }
}
verify();
`,
      'success priority over dead failure code',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('R10 AC3: if 内に明示的終了がなく分岐後に failure がある implicit return は unknown', () => {
  const dir = makeRepo();
  try {
    const status = ['sk', 'ipped'].join('');
    const reason = ['un', 'avail', 'able'].join('');
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function run() {
  if (!tool) {
    console.log('${status}: ${reason}');
  }
  process.exit(1);
}
run();
`,
      'implicit fallthrough with trailing failure exit',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(!result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('R11 AC3: name が用途不一致でも id が用途一致なら test step 扱いになる', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Build
        id: test
        uses: vendor/action@v1
`,
      'id purpose match',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_delegated_failure_contract_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('R12 AC3: list開始行の run と step直下の run が重複する形は unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
        run: echo duplicate
`,
      'duplicate run key',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('R13a AC3: inline値付きanchor(&label)を含む step は unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: &test_label Run tests
        run: npm test
`,
      'inline value anchor step',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('R13b AC3: comment付きalias(*label # comment)を含む step は unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: *test_label # comment
        run: npm test
`,
      'alias with comment step',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('R13c AC3: merge key(<<: *alias) を含む step は unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests
        <<: *defaults
        run: npm test
`,
      'merge key step',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('R14 AC3: 同一stepの continue-on-error と uses は fail 1件のみ(unknown併記しない)', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests
        continue-on-error: true
        uses: vendor/test-action@v1
`,
      'continue-on-error and uses together',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_continue_on_error'));
    assert.ok(result.lines.includes('fail_count=1'));
    assert.ok(result.lines.includes('unknown_count=0'));
  } finally {
    cleanup(dir);
  }
});

// ---------------------------------------------------------------------------
// G系: PR #127コメント#5187922715・Codex技術PM再裁定#5152685893で指摘された
// 追加6群(PURPOSE_TOKEN・TARGET_COMMAND basename・未定義wrapper・set +e固定窓・
// Node明示的success/限定implicit return分離・Workflow anchor/alias/merge key)を固定する。
// ---------------------------------------------------------------------------

test('G1a AC2: path非test系でも本文の tests 語でSP003対象になる', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['un', 'avail', 'able'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'src/util.js', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'src/util.js',
      `'use strict';
function run() {
  if (!tool) {
    console.log('${status}: ${reason} (covered by tests)');
    return;
  }
}
run();
`,
      'purpose token tests in body',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('G1b AC2: path非test系でも本文の fail-closed 語でSP003対象になる', () => {
  const status = ['sk', 'ipped'].join('');
  const reason = ['un', 'avail', 'able'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'src/other.js', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'src/other.js',
      `'use strict';
function run() {
  if (!tool) {
    console.log('${status}: ${reason} (fail-closed contract)');
    return;
  }
}
run();
`,
      'purpose token fail-closed in body',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('G2a AC2: 絶対パス(/usr/bin/sleep)もbasenameでTARGET_COMMAND認識', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/abspath.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/abspath.sh',
      '#!/bin/bash\n/usr/bin/sleep 5\n',
      'absolute path target command',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_failure_propagation_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('G2b AC2: 相対パス(./bin/node)もbasenameでTARGET_COMMAND認識', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/relpath.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/relpath.sh',
      '#!/bin/bash\n./bin/node script.js\n',
      'relative path target command',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('G2c AC2 pass候補: パス付きTARGET_COMMANDの || exit 1 は証明になる', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/abspathproof.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/abspathproof.sh',
      '#!/bin/bash\n/usr/bin/sleep 5 || exit 1\n',
      'absolute path proven',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('G3a AC2: sudo経由は直接実行へ変換せずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/sudo.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/sudo.sh',
      '#!/bin/bash\nsudo sleep 5 || exit 1\n',
      'sudo wrapper',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('G3b AC2: env経由は直接実行へ変換せずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/env.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/env.sh',
      '#!/bin/bash\nenv FOO=1 sleep 5 || exit 1\n',
      'env wrapper',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('G3c AC2: xargs経由は直接実行へ変換せずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/xargs.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/xargs.sh',
      '#!/bin/bash\nxargs -I{} sleep {} || exit 1\n',
      'xargs wrapper',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('G3d AC2 反証: 相対パスのwrapper(../bin/sudo)もbasenameでunknown判定', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/relsudo.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/relsudo.sh',
      '#!/bin/bash\n../bin/sudo sleep 5 || exit 1\n',
      'relative path wrapper',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('G4a AC3: set +e 直後の未伝播TARGET_COMMANDはSP001 fail', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/pluse-immediate.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/pluse-immediate.sh',
      `#!/bin/bash\nset +e\n${pause}\n`,
      'set plus e immediate',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP001'));
    assert.ok(result.lines.includes('reason=shell_set_plus_e_without_exit_check'));
  } finally {
    cleanup(dir);
  }
});

test('G4b AC3: } で窓が終了し窓外commandへset +e状態を持ち越さない', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/pluse-terminated.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/pluse-terminated.sh',
      `#!/bin/bash\nset +e\n}\n${pause}\n`,
      'set plus e terminated window',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(!result.lines.includes('rule_id=SP001'));
  } finally {
    cleanup(dir);
  }
});

test('G4c AC3 境界: 3番目のmeaningful lineはまだ窓内でSP001 fail', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/pluse-line3.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/pluse-line3.sh',
      `#!/bin/bash\nset +e\necho one\necho two\n${pause}\n`,
      'set plus e third meaningful line',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP001'));
  } finally {
    cleanup(dir);
  }
});

test('G4d AC3 境界: 4番目のmeaningful lineは窓外でSP002 unknown', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/pluse-line4.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/pluse-line4.sh',
      `#!/bin/bash\nset +e\necho one\necho two\necho three\n${pause}\n`,
      'set plus e fourth meaningful line',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(!result.lines.includes('rule_id=SP001'));
  } finally {
    cleanup(dir);
  }
});

test('G4e AC3: 窓内で終了状態参照はあるが停止未確認はSP002 unknown', () => {
  const pause = ['sl', 'eep', ' 5'].join('');
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/pluse-statusref.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/pluse-statusref.sh',
      `#!/bin/bash\nset +e\n${pause}\nstatus=$?\n`,
      'set plus e status ref',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_set_plus_e_status_ref_unproven'));
    assert.ok(!result.lines.includes('rule_id=SP001'));
  } finally {
    cleanup(dir);
  }
});

test('G6a AC3: nameなし list開始行 run: | + npm test は重複key誤検知せずpass', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: |
          npm test
`,
      'nameless list-inline block run',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(!result.lines.some((line) => line.includes('workflow_structure_unsupported')));
  } finally {
    cleanup(dir);
  }
});

test('G6b AC3: nameなし list開始行 run: |- + npm test は本文収集のうえSP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: |-
          npm test
`,
      'nameless list-inline strip chomping run',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('G6c AC3: nameなし list開始行 run: |+ + npm test は本文収集のうえSP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: |+
          npm test
`,
      'nameless list-inline keep chomping run',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('G7a AC3: step直下 id: t1 + run: | + npm test は本文収集のうえpass', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: t1
        run: |
          npm test
`,
      'step-body block run',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(!result.lines.some((line) => line.includes('workflow_structure_unsupported')));
  } finally {
    cleanup(dir);
  }
});

test('G7b AC3: step直下 id: t1 + run: |- + npm test は本文収集のうえSP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: t1
        run: |-
          npm test
`,
      'step-body strip chomping run',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('G7c AC3: step直下 id: t1 + run: |+ + npm test は本文収集のうえSP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - id: t1
        run: |+
          npm test
`,
      'step-body keep chomping run',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_structure_unsupported'));
  } finally {
    cleanup(dir);
  }
});

test('H1 AC2/AC4: set -e 下で TARGET_COMMAND && echo ok は伝播未証明でSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/and-list.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/and-list.sh',
      '#!/bin/bash\nset -e\nnpm test && echo ok\necho done\n',
      'set -e with non-terminal && list',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_failure_propagation_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('H2 AC3/AC4: 1-space indent Workflowの continue-on-error は候補ゼロにせずSP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, '.github/workflows/ci.yml', 'name: ci\n', 'base');
    const headSha = writeAndCommit(
      dir,
      '.github/workflows/ci.yml',
      `name: ci
on: push
jobs:
 test:
  runs-on: ubuntu-latest
  steps:
   - name: Run tests
     continue-on-error: true
     run: npm test
`,
      'nonstandard 1-space indent workflow',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_nonstandard_step_indent_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('I1 AC2/AC4: set -e 下で TARGET_COMMAND || echo ok は伝播未証明でSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/or-list.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/or-list.sh',
      '#!/bin/bash\nset -e\nnpm test || echo ok\necho done\n',
      'set -e with unproven || list',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_failure_propagation_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('I1b AC2 回帰: set -e 下で TARGET_COMMAND || exit 1 は既存どおり証明されpass', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/or-proof.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/or-proof.sh',
      '#!/bin/bash\nset -e\nnpm test || exit 1\necho done\n',
      'set -e with proven || exit',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('I2 AC3/AC4: 非標準indentのcomposite actionは候補ゼロにせずSP004 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'action.yml', 'name: x\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'action.yml',
      `name: x
runs:
 using: composite
 steps:
  - name: Run tests
    continue-on-error: true
    run: npm test
`,
      'nonstandard indent composite action',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP004'));
    assert.ok(result.lines.includes('reason=workflow_nonstandard_step_indent_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('I3 AC2: failure record後にset -eが現れたら窓を終了しterminator後のexit 0はfailにしない', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/status-then-errexit.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/status-then-errexit.sh',
      '#!/bin/bash\nCHECK_STATUS=1\nset -e\nexit 0\n',
      'failure record window ends at set -e',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(!result.lines.some((line) => line.includes('shell_unconditional_exit0_after_failure_record')));
  } finally {
    cleanup(dir);
  }
});

test('I4 AC2: CHECK_STATUS=PIPESTATUS 直後の無条件exit 0はSP001 fail', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/pipestatus.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/pipestatus.sh',
      '#!/bin/bash\nCHECK_STATUS=PIPESTATUS\nexit 0\n',
      'PIPESTATUS failure record recognized',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP001'));
    assert.ok(result.lines.includes('reason=shell_unconditional_exit0_after_failure_record'));
  } finally {
    cleanup(dir);
  }
});

test('L1 AC2/AC4: positive if TARGET_COMMAND; then はcandidate zeroにせずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/positive-if.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/positive-if.sh',
      '#!/bin/bash\nset -e\nif npm test; then\n  echo ok\nfi\necho done\n',
      'positive if condition',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('L1b AC2/AC4: 単体の! TARGET_COMMAND(if文なし)もSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/bare-negation.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/bare-negation.sh',
      '#!/bin/bash\nset -e\n! npm test\necho done\n',
      'bare negation without if',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('L2 AC2/AC4: background実行(npm test &)はSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/background.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/background.sh',
      '#!/bin/bash\nset -e\nnpm test &\necho done\n',
      'background job',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('L3 AC2/AC4: builtin開始pipeline(echo ok | npm test)は早期continueで消えずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/builtin-pipeline.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/builtin-pipeline.sh',
      '#!/bin/bash\nset -e\necho ok | npm test\n',
      'builtin-started pipeline',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('L4 AC2/AC4: 未登録wrapper(time npm test)は個別列挙なしでSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/time-wrapper.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/time-wrapper.sh',
      '#!/bin/bash\nset -e\ntime npm test\n',
      'time wrapper not in explicit list',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('L5 AC2/AC4: quoted )を含む複数行command substitutionはquote-aware追跡でSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/quoted-paren-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/quoted-paren-cmdsub.sh',
      '#!/bin/bash\nset -e\nRESULT=$(\n  echo ")"\n  npm test\n)\n',
      'quoted closing paren inside multiline command substitution',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('L6 AC2/AC4: 複数行backtick substitutionは範囲追跡でSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/multiline-backtick.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/multiline-backtick.sh',
      '#!/bin/bash\nset -e\nRESULT=`\n  npm test\n`\n',
      'multiline backtick substitution',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('K1 AC2/AC4: echo "$(npm test)" はbuiltin除外より前にcommand substitutionを検出しSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/echo-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/echo-cmdsub.sh',
      '#!/bin/bash\nset -e\necho "$(npm test)"\n',
      'command substitution inside echo builtin',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('K2 AC2/AC4: local RESULT=$(npm test) もbuiltin除外より前に検出しSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/local-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/local-cmdsub.sh',
      '#!/bin/bash\nset -e\nverify() {\n  local RESULT=$(npm test)\n}\n',
      'command substitution inside local builtin',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('K3 AC2/AC4: TARGET_COMMANDが次行にある行継続(FOO=1 \\\\)は範囲追跡でSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/continuation-next-line.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/continuation-next-line.sh',
      '#!/bin/bash\nset -e\nFOO=1 \\\n  npm test\n',
      'TARGET_COMMAND on continuation next line',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('K4 AC2/AC4: 複数行subshell( 改行 npm test 改行 )は範囲追跡でSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/multiline-subshell.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/multiline-subshell.sh',
      '#!/bin/bash\nset -e\n(\n  npm test\n)\n',
      'multiline subshell',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('K5 AC2/AC4: 複数行command substitution(RESULT=$( 改行 npm test 改行 ))は範囲追跡でSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/multiline-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/multiline-cmdsub.sh',
      '#!/bin/bash\nset -e\nRESULT=$(\n  npm test\n)\n',
      'multiline command substitution',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('K6 AC2/AC4: 間接参照(CMD=npm → "$CMD" test)はSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/indirect-ref.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/indirect-ref.sh',
      '#!/bin/bash\nset -e\nCMD=npm\n"$CMD" test\n',
      'indirect command reference',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('J1 AC2/AC4: TARGET_COMMAND || echo ok || exit 1 は間接証明のためSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/or-indirect.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/or-indirect.sh',
      '#!/bin/bash\nnpm test || echo ok || exit 1\n',
      'or list with intermediate success command',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('J2 AC2/AC4: TARGET_COMMAND || echo ok || fail_closed も間接証明のためSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/or-indirect-fc.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/or-indirect-fc.sh',
      '#!/bin/bash\nfail_closed() { exit 1; }\nnpm test || echo ok || fail_closed\n',
      'or list with intermediate success before confirmed fail_closed',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('J3 AC2/AC4: set -e 下の pipeline(npm test | tee) はSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/pipeline.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/pipeline.sh',
      '#!/bin/bash\nset -e\nnpm test | tee out.log\n',
      'pipeline not statically provable',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('J4 AC2/AC4: 行継続(npm test \\\\)はSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/continuation.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/continuation.sh',
      '#!/bin/bash\nset -e\nnpm test \\\n  --runInBand\n',
      'line continuation not statically provable',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('J5 AC2/AC4: here-doc(npm test <<EOF)はSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/heredoc.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/heredoc.sh',
      '#!/bin/bash\nset -e\nnpm test <<EOF\ninput\nEOF\n',
      'heredoc not statically provable',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('J6 AC2/AC4: subshell((npm test))は候補ゼロにせずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/subshell.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/subshell.sh',
      '#!/bin/bash\nset -e\n(npm test)\n',
      'subshell not statically provable',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('J7 AC2/AC4: command substitution(RESULT=$(npm test))は候補ゼロにせずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/cmdsub.sh',
      '#!/bin/bash\nset -e\nRESULT=$(npm test)\n',
      'command substitution not statically provable',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('H3 AC3: ABSENCE_TERMまで7コメント離れたflat-ifもcomment除外のmeaningful line基準でfail検出する', () => {
  const dir = makeRepo();
  try {
    const status = ['sk', 'ipped'].join('');
    const reason = ['tool ', 'un', 'available'].join('');
    const comments = Array.from({ length: 7 }, (_, i) => `    // note ${i}`).join('\n');
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function verify() {
  if (!globalThis.__tool) {
${comments}
    console.log('${status}: ${reason}');
    return;
  }
}
verify();
`,
      'absence term far from if via comments',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP003'));
    // Node用meaningful line判定は`//` comment-only行を除外するため、7コメントを
    // 挟んでもmeaningfulCountは契約上限(8)以内に収まりbare returnとしてfailになる。
    assert.ok(result.lines.includes('reason=node_skip_returns_success'));
  } finally {
    cleanup(dir);
  }
});

test('H4a AC2 回帰: CHECK_STATUS=true; exit 0 はfailure記録の誤検知なくpass', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/status-true.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/status-true.sh',
      '#!/bin/bash\nCHECK_STATUS=true\nexit 0\n',
      'true value is not a failure record',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(!result.lines.some((line) => line.includes('shell_unconditional_exit0_after_failure_record')));
  } finally {
    cleanup(dir);
  }
});

test('H4b AC2: CHECK_STATUS=1直後の無条件exit 0はSP001 fail', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/status-fail.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/status-fail.sh',
      '#!/bin/bash\nCHECK_STATUS=1\nexit 0\n',
      'numeric failure record before unconditional exit 0',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP001'));
    assert.ok(result.lines.includes('reason=shell_unconditional_exit0_after_failure_record'));
  } finally {
    cleanup(dir);
  }
});

// ChatGPT要件再確認#5199636456指摘: isCleanDirectTargetCommandが有限の除外条件の
// 積み上げ(ブラックリスト)のままだったため見逃していた5つのfail-open反例と、
// 文字列リテラル誤検出を、positive whitelist(危険メタ文字なし)+block-nesting
// depth追跡+quote-aware ENV_PREFIX_TOKEN_REで閉じる(M系列)。

test('M1 AC2/AC4: background途中の& (npm test & echo done)はSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/bg-mid.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/bg-mid.sh',
      '#!/bin/bash\nset -e\nnpm test & echo done\n',
      'background execution followed by another command on the same line',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M2 AC2/AC4: 複数行positive if条件内のnpm testはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/multiline-if.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/multiline-if.sh',
      '#!/bin/bash\nset -e\nif\n  npm test\nthen\n  echo ok\nfi\n',
      'multiline positive if condition body',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_nested_block_context_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M3 AC2/AC4: || trueで呼ばれるfunction内部のnpm testはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/func-internal.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/func-internal.sh',
      '#!/bin/bash\nset -e\nrun_tests() {\n  npm test\n}\nrun_tests || true\n',
      'target command inside a function body called with || true',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_nested_block_context_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M4 AC2/AC4: 開始行に別commandがある複数行command substitutionはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/multiline-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/multiline-cmdsub.sh',
      '#!/bin/bash\nset -e\necho prefix; RESULT=$(\n  npm test\n)\n',
      'multiline command substitution whose opening line already has another command',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M5 AC2/AC4: process substitution(cp <(npm test) out.txt)はSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/process-sub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/process-sub.sh',
      '#!/bin/bash\nset -e\ncp <(npm test) out.txt\n',
      'process substitution around the target command',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M6 AC2/AC4: 文字列リテラル内のTARGET_COMMAND名(MSG="run npm test")はSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/string-literal.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/string-literal.sh',
      '#!/bin/bash\nset -e\nMSG="run npm test"\necho $MSG\n',
      'target command name appearing only inside a string literal',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M7 AC2 反証: forループ本体内のnpm testはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/for-body.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/for-body.sh',
      '#!/bin/bash\nset -e\nfor i in 1 2 3; do\n  npm test\ndone\n',
      'target command inside a for loop body',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_nested_block_context_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M8 AC2 反証: caseブランチ内のnpm testはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/case-branch.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/case-branch.sh',
      '#!/bin/bash\nset -e\ncase $1 in\n  x) npm test ;;\nesac\n',
      'target command inside a case branch',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M9 AC2 反証: if本体内にネストしたfunction内部のnpm testはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/nested-func-in-if.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/nested-func-in-if.sh',
      '#!/bin/bash\nset -e\nif true; then\n  run_tests() { npm test; }\n  run_tests\nfi\n',
      'function defined and called inside an if body',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
  } finally {
    cleanup(dir);
  }
});

test('M10 AC2 回帰: 単純なstdoutリダイレクト(npm test > out.log)はpassを維持する', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/redirect-bare.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/redirect-bare.sh',
      '#!/bin/bash\nset -e\nnpm test > out.log\necho done\n',
      'bare direct execution with a simple stdout redirect',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

test('M11 AC2 回帰: stderr破棄リダイレクト+確認済みfail_closed証明はpassを維持する', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/redirect-proof.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/redirect-proof.sh',
      '#!/bin/bash\nfail_closed() { exit 1; }\nnpm test 2>/dev/null || fail_closed\n',
      'stderr-discarding redirect combined with a confirmed fail_closed proof',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

// 独立レビュー#5200025133指摘: 開始行自体に中身がある(行末が`(`/backtickで
// 終わらない)mid-line開始の複数行command/process/backtick substitutionは、
// computeMultilineGroupingRangesの行末位置条件では範囲追跡から漏れ、開始行
// 以外の中身行が独立候補として誤ってpassしていた(M12〜M14)。

test('M12 AC2/AC4: 開始行自体に中身があるmid-line開始のcommand substitutionはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/midline-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/midline-cmdsub.sh',
      '#!/bin/bash\nset -e\nRESULT=$(echo start\n  npm test\n)\n',
      'command substitution whose opening line already contains content before the newline',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M13 AC2/AC4: 開始行自体に中身があるmid-line開始のprocess substitutionはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/midline-process-sub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/midline-process-sub.sh',
      '#!/bin/bash\nset -e\ncat <(echo start\n  npm test\n)\n',
      'process substitution whose opening line already contains content before the newline',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M14 AC2/AC4: 開始行自体に中身があるmid-line開始のbacktick substitutionはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/midline-backtick.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/midline-backtick.sh',
      '#!/bin/bash\nset -e\nRESULT=`echo start\n  npm test\n`\n',
      'backtick substitution whose opening line already contains content before the newline',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M15 AC2 反証: クォート内の括弧は複数行グルーピングを誤発火させない', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/quoted-paren.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/quoted-paren.sh',
      '#!/bin/bash\nset -e\necho "(not a paren group"\nnpm test\necho done\n',
      'unbalanced parenthesis inside a string literal must not be treated as an open group',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

// 独立技術レビュー#5200130028指摘: stripCommentとscanShellLexicalDelta(旧)が
// それぞれ独立・不完全にクォート状態を追跡していたため、(1)double quote内でも
// 実行される$()/backtick substitutionを見落とす fail-open と、(2)single quote内の
// `#`をコメント開始と誤認しcandidate-zeroでpassするfail-openが残っていた。
// 両関数が共有する1本の字句prepass(scanShellLexicalState)へ統合して閉じる
// (M16〜M19)。

test('M16 AC2/AC4: double quote内で開始する複数行command substitutionはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/dq-multiline-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/dq-multiline-cmdsub.sh',
      '#!/bin/bash\nset -e\necho "$(echo start\n  npm test\n  echo ok\n)"\n',
      'command substitution opened inside double quotes, spanning multiple lines',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M17 AC2/AC4: double quote内で開始する複数行backtick substitutionはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/dq-multiline-backtick.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/dq-multiline-backtick.sh',
      '#!/bin/bash\nset -e\necho "`echo start\n  npm test\n  echo ok\n`"\n',
      'backtick substitution opened inside double quotes, spanning multiple lines',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M18 AC2: single quote内の#はコメント開始と誤認されずnpm test || trueが候補化されSP001 fail', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/hash-in-single-quote.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/hash-in-single-quote.sh',
      "#!/bin/bash\nprintf '#'; npm test || true\n",
      'literal # inside single quotes must not truncate the rest of the line as a comment',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP001'));
    assert.ok(result.lines.includes('reason=shell_success_suppression'));
  } finally {
    cleanup(dir);
  }
});

test('M19 AC2 反証: double quote内のsingle quoteはクォート状態を誤ってトグルしない', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/dq-with-apostrophe.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/dq-with-apostrophe.sh',
      '#!/bin/bash\nset -e\necho "it\'s # not a comment"\nnpm test\necho done\n',
      "an apostrophe inside double quotes must stay inert (not open single-quote mode)",
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});

// 独立技術レビュー#5200256283指摘: ad-hocなフラグ(inDouble+doubleSubDepth)は
// command substitution内部で新たに開くネストしたクォートを正しく扱えず、
// quoted `)`をsubstitutionの終端と誤認するfail-openを生んでいた。加えて
// stripCommentは単語途中の`#`(POSIXでは非コメント)も無条件でコメット開始と
// 誤認していた。両方をlexical state stack(型付きpush/pop)とword境界条件で
// 修正する(M20〜M23)。

test('M20 AC2/AC4: $()内部で新たに開くquoted )はsubstitutionの終端と誤認されずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/nested-quote-in-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/nested-quote-in-cmdsub.sh',
      '#!/bin/bash\nset -e\necho "$(printf \'%s\' ")"\n  npm test\n  echo ok\n)"\n',
      'a quoted closing paren opened fresh inside $() must not be treated as the substitution terminator',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M21 AC2/AC4: 二重にネストしたcommand substitutionはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/double-nested-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/double-nested-cmdsub.sh',
      '#!/bin/bash\nset -e\necho "$(echo "$(npm test)" )"\necho done\n',
      'command substitution nested two levels deep inside double quotes',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('M22 AC2: 単語途中の#はコメント開始と誤認されずnpm test || trueが候補化されSP001 fail', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/hash-mid-word.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/hash-mid-word.sh',
      '#!/bin/bash\nprintf foo#bar; npm test || true\n',
      '# in the middle of a word is not a comment start in POSIX shell',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=fail'));
    assert.ok(result.lines.includes('rule_id=SP001'));
    assert.ok(result.lines.includes('reason=shell_success_suppression'));
  } finally {
    cleanup(dir);
  }
});

test('M23 AC2 反証: backtick内のcommand substitution、command substitution内のbacktickはSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/mixed-nesting.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/mixed-nesting.sh',
      '#!/bin/bash\nset -e\nRESULT=$(echo `npm test`\n  echo ok\n)\n',
      'a backtick substitution opened inside a $() command substitution',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

// 独立技術レビュー#5200517828指摘: (A)のlexical state stackは物理行をまたいで
// 状態を引き継がず、かつ型不一致の`)`でもparenDeltaを無条件に減らす箇所が
// 残っていたため、前行から継続するquoted data内の`)`でrangeを早期終了する
// fail-openと、substitution内部のコメント本文にある`)`を終端と誤カウントする
// fail-openが残っていた。PM方針によりB案(開始のみ検出、終了は検出しない。
// 開始行からEOFまでを無条件unknownとする単調規律)へ切り替え、findLexicalOpenRange
// で実装した(N1〜N3)。B案が「無用化(何もpassしなくなる)」していないことは
// 既存のI1b/M10/M11(引き続きpass)で確認する。

test('N1 AC2/AC4: 前行から継続するquoted data内の)でrangeが早期終了しないことを確認しSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/cross-line-quoted-data.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/cross-line-quoted-data.sh',
      '#!/bin/bash\nset -e\nRESULT=$(\n  echo ")"\n  npm test\n)\n',
      'a quoted closing paren on a continuation line must not end the substitution range early',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('N2 AC2/AC4: substitution内部のコメント本文にある)を終端と誤認せずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/comment-inside-cmdsub.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/comment-inside-cmdsub.sh',
      '#!/bin/bash\nset -e\necho "$(echo start # )\n  npm test\n  echo ok\n)"\n',
      'a ) inside a comment inside a command substitution must not be counted as the terminator',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('N3 AC2/AC4: heredoc本体内のnpm testは開始検出のみでSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/heredoc-with-target.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/heredoc-with-target.sh',
      '#!/bin/bash\nset -e\ncat <<EOF\nnpm test\nEOF\n',
      'a target command name inside a heredoc body must not be treated as top-level',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

// 独立技術レビュー#5200711995指摘: findLexicalOpenRangeが行末時点のstack
// 非空(stackDepthAtEnd)を開始判定に使っていたため、command substitution
// 内部のコメント本文にある`)`(#がctx==='top'限定でしか認識されないため
// stripCommentされず素通りし、ctx==='paren'としてpopされる)により、同一行
// 内で見かけ上「閉じた」と誤判定されるfail-openが残っていた。開始判定を
// 「複雑なopenerを1回でも見たか」(sawComplexOpener、同一行の後続closerで
// falseへ戻さない)に変更して修正した(N4)。この変更を入れる過程で、関数
// 定義`name() {`の空括弧`()`まで複雑なopenerとして誤検出し、関数定義を含む
// 行すべてが複数行構造の開始と誤判定されてchecker自体が無用化する新規
// バグを自己検出し、空括弧は対象から除外して修正した(N5)。

test('N4 AC2/AC4: command substitution内部のコメント本文にある)は同一行内でも終端と誤認せずSP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/same-line-comment-paren.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/same-line-comment-paren.sh',
      '#!/bin/bash\nset -e\nRESULT=$(echo start # )\n  npm test\n  echo ok\n)\n',
      'a ) inside a same-line comment inside $() must not be mistaken for the closer',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 1);
    assert.ok(result.lines.includes('result=blocked'));
    assert.ok(result.lines.includes('rule_id=SP002'));
    assert.ok(result.lines.includes('reason=shell_unsupported_structure_unproven'));
  } finally {
    cleanup(dir);
  }
});

test('N5 AC2 反証: 関数定義の空括弧はcomplex openerとして誤検出されずcheckerが機能し続ける', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/function-def-empty-parens.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/function-def-empty-parens.sh',
      '#!/bin/bash\nfail_closed() { exit 1; }\nnpm test 2>/dev/null || fail_closed\n',
      'the empty parens in a function definition must not trigger the multi-line open detector',
    );
    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
  } finally {
    cleanup(dir);
  }
});
