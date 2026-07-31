'use strict';

// Issue #123: fail-closed-success-propagation.cjs の正常系・異常系を実git fixtureで再現する。
// node:test / node:assert のみ。fixture構築失敗はskip+0にしない。

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
  return checker.runChecker({ base: baseSha, head: headSha, cwd: dir });
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

test('AC2 pass候補: 明示的failure伝播（sleep + fail_closed）', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/ok.sh', '#!/bin/bash\nset -e\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/ok.sh',
      `#!/bin/bash
set -e
fail_closed() { echo "$1" >&2; exit 1; }
sleep 5 2>/dev/null || fail_closed "sleep_failed"
`,
      'explicit propagation',
    );

    const result = runOnRepo(dir, baseSha, headSha);
    assert.equal(result.exitCode, 0);
    assert.ok(result.lines.includes('result=pass'));
    assert.ok(result.lines.includes('applicable=true'));
  } finally {
    cleanup(dir);
  }
});

test('AC2 blocked: 未処理 sleep 5 は SP002 unknown', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'scripts/bad.sh', '#!/bin/bash\n', 'base');
    const headSha = writeAndCommit(
      dir,
      'scripts/bad.sh',
      `#!/bin/bash
echo start
sleep 5
echo done
`,
      'unproven sleep',
    );

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

test('AC2 fail: PR #157相当の skip-success は SP003', () => {
  const dir = makeRepo();
  try {
    const baseSha = writeAndCommit(dir, 'harness/checks/example.test.cjs', "'use strict';\n", 'base');
    const headSha = writeAndCommit(
      dir,
      'harness/checks/example.test.cjs',
      `'use strict';
function runShellTest() {
  if (!process.env.HAS_BASH) {
    console.log('skipped: bash unavailable');
    return;
  }
  process.exit(1);
}
runShellTest();
`,
      'skip success',
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
      `if (!globalThis.__tool) {
  console.log('skipped: tool unavailable');
  return;
}
`,
      'generated skip',
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
});

test('analyzeShell unit: set -e 下の外部コマンドは pass 候補', () => {
  const findings = checker.analyzeShell(
    `#!/bin/bash
set -e
sleep 5
`,
    'unit.sh',
  );
  assert.equal(findings.length, 0);
});

test('analyzeNode unit: throw 後は fail ではなく unknown/未検出', () => {
  const findings = checker.analyzeNode(
    `if (!tool) {
  throw new Error('unavailable');
}
`,
    'unit.test.cjs',
  );
  assert.equal(findings.length, 0);
});
