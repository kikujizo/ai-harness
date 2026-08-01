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
  return [
    '#!/bin/bash',
    'set -e',
    'fail_closed() { echo "$1" >&2; exit 1; }',
    `${pause} 2>/dev/null || fail_closed "pause_failed"`,
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
    const headSha = writeAndCommit(
      dir,
      'gen/bundle.generated.js',
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

test('AC3 blocked: 複雑implicit return は SP003 unknown', () => {
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
      'complex implicit return',
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
