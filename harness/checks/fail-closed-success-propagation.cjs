#!/usr/bin/env node
'use strict';

// Issue #123: 変更された shell / Node test / Workflow について、既知の success-propagation
// 迂回と静的に成否伝播を証明できない箇所を機械検出する。
// CLI契約: --base <commit_sha> --head <commit_sha>

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const RESULT_HEADER = 'SUCCESS_PROPAGATION_STATIC';
const BASE_SHA_RE = /^[0-9a-f]{40}$/;
const TARGET_EXTENSIONS = new Set(['.sh', '.bash', '.js', '.cjs', '.mjs', '.yml', '.yaml']);
const MAX_FILE_BYTES = 512 * 1024;
const SHELL_EXTENSIONS = new Set(['.sh', '.bash']);
const NODE_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);
const YAML_EXTENSIONS = new Set(['.yml', '.yaml']);

const CHECK_PURPOSE_RE =
  /\b(test|check|verify|lint)\b|npm\s+test|yarn\s+test|pnpm\s+test|node\s+[^\s|;&]*test|bash\s+-n|shellcheck|eslint|jest|mocha|vitest/i;
const SP001_SUPPRESS_RE = /\|\|\s*(true|:)\s*($|[#;])/;
const UNCONDITIONAL_EXIT0_RE = /^\s*exit\s+0\s*($|[#;])/;
const FAILURE_RECORD_RE =
  /\b([A-Z][A-Z0-9_]*_(?:EXIT|PASS|FAIL|STATUS)|LOCAL_E2E_PASS|POC_KEY_GATE_PASS)\s*=\s*(?:false|1|[^0\s]|\$?\?)/i;
const SET_PLUS_E_RE = /^\s*set\s+\+e\b/;
const SET_MINUS_E_RE = /^\s*set\s+-e\b|^\s*set\s+-o\s+errexit\b/;
const EXIT_STATUS_CHECK_RE = /\$?\?|PIPESTATUS/;
const PROPAGATION_PROOF_RE =
  /\|\|\s*(?:exit|return|fail_closed)\b|&&\s*(?:exit|return|fail_closed)\b|;\s*then\s+(?:exit|return|fail_closed)\b/;
const IF_NOT_RE = /^\s*if\s+!\s+/;
const EXTERNAL_CMD_RE =
  /^\s*(?:[A-Za-z_][\w]*=.*&&\s*)?(?:sleep|curl|wget|git|node|python|bash|sh|npm|yarn|pnpm|make|docker|kubectl|gh|aws|gcloud|terraform|ansible|helm|cargo|go|rustc|java|mvn|gradle|cmake|ninja|tar|cp|mv|rm|mkdir|chmod|chown|flock|timeout|wait|read|command|eval|exec)\b/i;
const SHELL_BUILTIN_ONLY_RE =
  /^\s*(?:#|echo|printf|true|false|exit|return|local|export|unset|shift|set|trap|source|\.|:)\b/;
const SKIP_TERMS_RE = /\b(skip|skipped|unavailable|cannot run|can't run|prerequisite)\b/i;
const NODE_SUCCESS_EXIT_RE =
  /^\s*(?:return\s*;?|process\.exit\s*\(\s*0\s*\)|process\.exitCode\s*=\s*0)\s*;?\s*($|\/\/|#)/;
const NODE_FAILURE_EXIT_RE =
  /^\s*(?:throw\b|process\.exit\s*\(\s*[1-9]\d*\s*\)|process\.exitCode\s*=\s*[1-9]\d*)\b/;
const WORKFLOW_TEST_STEP_RE =
  /\b(test|check|verify|lint|fail-closed)\b/i;

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
    throw new StopResult('diff_unavailable');
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

function readBlobAtCommit(commitSha, relPath, cwd) {
  let raw;
  try {
    raw = execFileSync('git', ['show', `${commitSha}:${relPath}`], {
      cwd,
      encoding: 'buffer',
      maxBuffer: MAX_FILE_BYTES + 1,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return { kind: 'missing' };
  }

  if (raw.length > MAX_FILE_BYTES) {
    return { kind: 'too_large' };
  }
  if (raw.includes(0)) {
    return { kind: 'binary' };
  }
  try {
    return { kind: 'text', content: raw.toString('utf8') };
  } catch {
    return { kind: 'encoding' };
  }
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

function analyzeShell(content, relPath) {
  const lines = content.split(/\r?\n/);
  const findings = [];
  let errexitEnabled = false;
  let errexitDisabled = false;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const rawLine = lines[idx];
    const line = stripComment(rawLine, 'shell').trimEnd();
    if (line.trim().length === 0) continue;

    if (SET_MINUS_E_RE.test(line)) {
      errexitEnabled = true;
      errexitDisabled = false;
    }
    if (SET_PLUS_E_RE.test(line)) {
      errexitDisabled = true;
    }

    if (CHECK_PURPOSE_RE.test(line) && SP001_SUPPRESS_RE.test(line)) {
      findings.push({
        result: 'fail',
        ruleId: 'SP001',
        path: relPath,
        line: lineNo,
        reason: 'shell_success_suppression',
      });
      continue;
    }

    if (UNCONDITIONAL_EXIT0_RE.test(line)) {
      const window = lines.slice(Math.max(0, idx - 8), idx).join('\n');
      if (FAILURE_RECORD_RE.test(window)) {
        findings.push({
          result: 'fail',
          ruleId: 'SP001',
          path: relPath,
          line: lineNo,
          reason: 'shell_unconditional_exit0_after_failure_record',
        });
        continue;
      }
    }

    if (errexitDisabled && CHECK_PURPOSE_RE.test(line) && !EXIT_STATUS_CHECK_RE.test(line)) {
      const lookahead = lines.slice(idx + 1, idx + 4).join('\n');
      if (!EXIT_STATUS_CHECK_RE.test(lookahead) && !PROPAGATION_PROOF_RE.test(line)) {
        findings.push({
          result: 'fail',
          ruleId: 'SP001',
          path: relPath,
          line: lineNo,
          reason: 'shell_set_plus_e_without_exit_check',
        });
        continue;
      }
    }

    if (SHELL_BUILTIN_ONLY_RE.test(line)) continue;
    if (!EXTERNAL_CMD_RE.test(line) && !/^\s*[A-Za-z_][\w-]*\s+/.test(line)) continue;

    if (hasShellPropagationProof(lines, idx, errexitEnabled && !errexitDisabled)) {
      continue;
    }

    findings.push({
      result: 'unknown',
      ruleId: 'SP002',
      path: relPath,
      line: lineNo,
      reason: 'shell_failure_propagation_unproven',
    });
  }

  return findings;
}

function hasShellPropagationProof(lines, idx, globalErrexit) {
  const line = stripComment(lines[idx], 'shell');
  if (globalErrexit) return true;
  if (PROPAGATION_PROOF_RE.test(line)) return true;
  if (IF_NOT_RE.test(line)) return true;
  if (EXIT_STATUS_CHECK_RE.test(line)) return true;

  const nextBlock = lines.slice(idx + 1, idx + 4).join('\n');
  if (EXIT_STATUS_CHECK_RE.test(nextBlock)) return true;
  if (/\b(?:exit|return|fail_closed)\b/.test(nextBlock) && /\$?\?/.test(nextBlock)) return true;

  const prev = idx > 0 ? stripComment(lines[idx - 1], 'shell') : '';
  if (/^\s*if\s+/.test(prev) || IF_NOT_RE.test(prev)) return true;

  return false;
}

function analyzeNode(content, relPath) {
  const lines = content.split(/\r?\n/);
  const findings = [];
  const isTestLike = /\.test\.|\.spec\.|test\.cjs$|check|verify|lint/i.test(relPath);

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const rawLine = lines[idx];
    const line = stripComment(rawLine, 'node');

    if (!isTestLike && !CHECK_PURPOSE_RE.test(line) && !SKIP_TERMS_RE.test(line)) {
      continue;
    }

    if (!SKIP_TERMS_RE.test(line)) continue;

    const branchWindow = lines.slice(idx, Math.min(lines.length, idx + 8));
    let hasSuccessExit = false;
    let hasFailureExit = false;
    for (const branchLine of branchWindow) {
      const stripped = stripComment(branchLine, 'node');
      if (NODE_SUCCESS_EXIT_RE.test(stripped)) hasSuccessExit = true;
      if (NODE_FAILURE_EXIT_RE.test(stripped)) hasFailureExit = true;
    }

    if (hasSuccessExit && !hasFailureExit) {
      findings.push({
        result: 'fail',
        ruleId: 'SP003',
        path: relPath,
        line: lineNo,
        reason: 'node_skip_returns_success',
      });
      continue;
    }

    if (!hasFailureExit && !tracksReturnToCaller(lines, idx)) {
      findings.push({
        result: 'unknown',
        ruleId: 'SP003',
        path: relPath,
        line: lineNo,
        reason: 'node_skip_propagation_unproven',
      });
    }
  }

  return findings;
}

function tracksReturnToCaller(lines, idx) {
  const tail = lines.slice(idx, Math.min(lines.length, idx + 20)).join('\n');
  return /\bprocess\.exit\s*\(|process\.exitCode\s*=|throw\b/.test(tail);
}

function analyzeWorkflow(content, relPath) {
  const lines = content.split(/\r?\n/);
  const findings = [];
  let inRunBlock = false;
  let runIndent = 0;
  let currentStep = null;
  let stepStartLine = 1;
  let continueOnError = false;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const line = lines[idx];
    const trimmed = line.trim();

    const stepMatch = line.match(/^\s*-\s+name:\s*(.+)\s*$/);
    if (stepMatch) {
      currentStep = stepMatch[1];
      stepStartLine = lineNo;
      continueOnError = false;
      inRunBlock = false;
    }

    const idMatch = line.match(/^\s*id:\s*(.+)\s*$/);
    if (idMatch && !currentStep) {
      currentStep = idMatch[1];
      stepStartLine = lineNo;
    }

    const continueMatch = line.match(/^\s*continue-on-error:\s*(true|yes)\s*$/i);
    if (continueMatch) {
      continueOnError = true;
      if (currentStep && WORKFLOW_TEST_STEP_RE.test(currentStep)) {
        findings.push({
          result: 'fail',
          ruleId: 'SP004',
          path: relPath,
          line: lineNo,
          reason: 'workflow_continue_on_error',
        });
      }
    }

    const runHeader = line.match(/^(\s*)run:\s*(.*)$/);
    if (runHeader) {
      inRunBlock = true;
      runIndent = runHeader[1].length;
      const inlineRun = runHeader[2];
      if (inlineRun.length > 0) {
        inspectWorkflowRunLine(inlineRun, relPath, lineNo, currentStep, findings);
      }
      continue;
    }

    if (inRunBlock) {
      const indent = line.match(/^(\s*)/)[1].length;
      if (trimmed.length === 0) continue;
      if (indent <= runIndent && !line.match(/^\s+/)) {
        inRunBlock = false;
      } else if (indent > runIndent) {
        inspectWorkflowRunLine(line.trim(), relPath, lineNo, currentStep, findings);
      }
    }

    if (/uses:\s*[^#\n]+/i.test(line) && currentStep && WORKFLOW_TEST_STEP_RE.test(currentStep)) {
      if (!/^\s*uses:\s*[^@\s]+@[^@\s]+/i.test(line)) {
        findings.push({
          result: 'unknown',
          ruleId: 'SP004',
          path: relPath,
          line: stepStartLine,
          reason: 'workflow_delegated_failure_contract_unproven',
        });
      }
    }
  }

  return findings;
}

function inspectWorkflowRunLine(runLine, relPath, lineNo, stepName, findings) {
  if (!stepName || !WORKFLOW_TEST_STEP_RE.test(stepName)) return;
  if (CHECK_PURPOSE_RE.test(runLine) && SP001_SUPPRESS_RE.test(runLine)) {
    findings.push({
      result: 'fail',
      ruleId: 'SP004',
      path: relPath,
      line: lineNo,
      reason: 'workflow_shell_success_suppression',
    });
  }
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

function pickOverallResult(findings) {
  if (findings.length === 0) {
    return { result: 'pass', primary: null };
  }
  const unknown = findings.find((f) => f.result === 'unknown');
  if (unknown) {
    return { result: 'blocked', primary: unknown };
  }
  const fail = findings.find((f) => f.result === 'fail');
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
      lines: [
        'result=pass',
        'applicable=false',
        'checked_file_count=0',
        'fail_count=0',
        'unknown_count=0',
        'stop_reason=none',
      ],
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
      lines: [
        'result=pass',
        'applicable=true',
        `checked_file_count=${checkedCount}`,
        'fail_count=0',
        'unknown_count=0',
        'stop_reason=none',
      ],
    };
  }

  const primary = overall.primary;
  const stopReason =
    overall.result === 'blocked' ? 'static_analysis_unknown' : 'known_bypass_detected';

  return {
    exitCode: 1,
    lines: [
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
    ],
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
      const lines = ['result=blocked', `stop_reason=${err.stopReason}`, ...err.extraLines];
      printResult(lines);
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
  parseArgs,
  analyzeFile,
  analyzeShell,
  analyzeNode,
  analyzeWorkflow,
  listTargetChanges,
  hasTargetExtension,
  pickOverallResult,
  StopResult,
  UsageError,
  RESULT_HEADER,
};
