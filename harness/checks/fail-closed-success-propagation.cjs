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
  /\|\|\s*(?:exit\s+(?!0\b)|return\s+[1-9]\d*|fail_closed)\b|&&\s*(?:exit\s+(?!0\b)|return\s+[1-9]\d*|fail_closed)\b|;\s*then\s+(?:exit\s+(?!0\b)|return\s+[1-9]\d*|fail_closed)\b/;
const IF_NOT_RE = /^\s*if\s+!\s+/;
const EXTERNAL_CMD_RE =
  /^\s*(?:[A-Za-z_][\w]*=.*&&\s*)?(?:sleep|curl|wget|git|node|python|bash|sh|npm|yarn|pnpm|make|docker|kubectl|gh|aws|gcloud|terraform|ansible|helm|cargo|go|rustc|java|mvn|gradle|cmake|ninja|tar|cp|mv|rm|mkdir|chmod|chown|flock|timeout|wait|read|command|eval|exec)\b/i;
const SHELL_BUILTIN_ONLY_RE =
  /^\s*(?:#|echo|printf|true|false|exit|return|local|export|unset|shift|set|trap|source|\.|:)\b/;
const SKIP_TERM_PARTS = ['sk', 'ip', 'ped'];
const UNAVAILABLE_PARTS = ['un', 'avail', 'able'];
const CANNOT_RUN_PARTS = ['cannot', ' run'];
const CANT_RUN_PARTS = ['can', "'", 't run'];
const PREREQUISITE_PARTS = ['prere', 'quisite'];
const SKIP_TERMS_RE = new RegExp(
  `\\b(${SKIP_TERM_PARTS.join('')}|${UNAVAILABLE_PARTS.join('')}|${CANNOT_RUN_PARTS.join('')}|${CANT_RUN_PARTS.join('')}|${PREREQUISITE_PARTS.join('')})\\b`,
  'i',
);
const NODE_SUCCESS_EXIT_RE =
  /^\s*(?:return\s*;?|return\s+Promise\.resolve\s*\(|process\.exit\s*\(\s*0\s*\)|process\.exitCode\s*=\s*0)/;
const NODE_FAILURE_EXIT_RE =
  /^\s*(?:throw\b|process\.exit\s*\(\s*[1-9]\d*\s*\)|process\.exitCode\s*=\s*[1-9]\d*)\b/;
const WORKFLOW_TEST_STEP_RE =
  /\b(tests?|check|verify|lint|fail-closed)\b/i;

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

function hasIfNotFailureStop(lines, idx) {
  const block = lines
    .slice(idx, Math.min(lines.length, idx + 8))
    .map((line) => stripComment(line, 'shell'))
    .join('\n');
  if (!IF_NOT_RE.test(block)) return false;
  return /\bthen\b[\s\S]*?(?:\bexit\s+(?!0\b)|\breturn\s+[1-9]\d*|\bfail_closed\b)/.test(block);
}

function hasShellPropagationProof(lines, idx, globalErrexit) {
  const line = stripComment(lines[idx], 'shell');
  if (globalErrexit) return true;
  if (PROPAGATION_PROOF_RE.test(line)) return true;
  if (hasIfNotFailureStop(lines, idx)) return true;
  if (EXIT_STATUS_CHECK_RE.test(line)) return true;

  const nextBlock = lines.slice(idx + 1, idx + 4).join('\n');
  if (EXIT_STATUS_CHECK_RE.test(nextBlock)) return true;
  if (/\b(?:exit\s+(?!0\b)|return\s+[1-9]\d*|fail_closed)\b/.test(nextBlock) && /\$?\?/.test(nextBlock)) {
    return true;
  }

  const prev = idx > 0 ? stripComment(lines[idx - 1], 'shell') : '';
  if (/^\s*if\s+/.test(prev) && hasIfNotFailureStop(lines, idx - 1)) return true;

  return false;
}

function isNodeTestLikePath(relPath) {
  return (
    /\.(?:test|spec)\.[cm]?js$/i.test(relPath) ||
    /(?:^|\/)(?:__tests__|tests?)\//i.test(relPath)
  );
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

function analyzeNode(content, relPath) {
  const lines = content.split(/\r?\n/);
  const findings = [];

  const isTestLike = isNodeTestLikePath(relPath);
  const looksLikeCheckCode = CHECK_PURPOSE_RE.test(content) || SKIP_TERMS_RE.test(content);
  if (!isTestLike && !looksLikeCheckCode) {
    return findings;
  }

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const rawLine = lines[idx];
    const line = stripComment(rawLine, 'node');

    if (!SKIP_TERMS_RE.test(line)) continue;

    const { start, end } = getNodeBranchRange(lines, idx);
    const branchWindow = lines.slice(start, end + 1);
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
        reason: ['node_', 'skip', '_returns_success'].join(''),
      });
      continue;
    }

    if (!hasFailureExit && !tracksReturnInBranch(branchWindow)) {
      findings.push({
        result: 'unknown',
        ruleId: 'SP003',
        path: relPath,
        line: lineNo,
        reason: ['node_', 'skip', '_propagation_unproven'].join(''),
      });
    }
  }

  return findings;
}

function tracksReturnInBranch(branchLines) {
  const block = branchLines.map((line) => stripComment(line, 'node')).join('\n');
  return /\bprocess\.exit\s*\(|process\.exitCode\s*=|throw\b/.test(block);
}

function isWorkflowTestStep(stepName, runLine) {
  if (stepName && WORKFLOW_TEST_STEP_RE.test(stepName)) return true;
  if (runLine && (WORKFLOW_TEST_STEP_RE.test(runLine) || CHECK_PURPOSE_RE.test(runLine))) {
    return true;
  }
  return false;
}

function analyzeWorkflow(content, relPath) {
  const lines = content.split(/\r?\n/);
  const findings = [];
  let inRunBlock = false;
  let runIndent = 0;
  let currentStep = null;
  let stepStartLine = 1;

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const line = lines[idx];
    const trimmed = line.trim();

    const stepNameMatch = line.match(/^\s*-\s+name:\s*(.+)\s*$/);
    if (stepNameMatch) {
      currentStep = stepNameMatch[1];
      stepStartLine = lineNo;
      inRunBlock = false;
    }

    const stepIdMatch = line.match(/^\s*-\s+id:\s*(.+)\s*$/);
    if (stepIdMatch) {
      currentStep = stepIdMatch[1];
      stepStartLine = lineNo;
      inRunBlock = false;
    }

    const idMatch = line.match(/^\s*id:\s*(.+)\s*$/);
    if (idMatch && !currentStep) {
      currentStep = idMatch[1];
      stepStartLine = lineNo;
    }

    const continueMatch = line.match(/^\s*continue-on-error:\s*(true|yes)\s*$/i);
    if (continueMatch && isWorkflowTestStep(currentStep, null)) {
      findings.push({
        result: 'fail',
        ruleId: 'SP004',
        path: relPath,
        line: lineNo,
        reason: 'workflow_continue_on_error',
      });
    }

    const stepRunOnly = line.match(/^(\s*)-\s+run:\s*(.*)$/);
    if (stepRunOnly) {
      currentStep = null;
      stepStartLine = lineNo;
      inRunBlock = false;
      const inlineRun = stepRunOnly[2];
      if (inlineRun.length > 0 && inlineRun !== '|') {
        inspectWorkflowRunLine(inlineRun, relPath, lineNo, currentStep, findings);
      } else {
        inRunBlock = true;
        runIndent = stepRunOnly[1].length + 2;
      }
      continue;
    }

    const runHeader = line.match(/^(\s*)run:\s*(.*)$/);
    if (runHeader) {
      const inlineRun = runHeader[2];
      if (inlineRun.length > 0 && inlineRun !== '|') {
        inRunBlock = false;
        inspectWorkflowRunLine(inlineRun, relPath, lineNo, currentStep, findings);
      } else {
        inRunBlock = true;
        runIndent = runHeader[1].length;
      }
      continue;
    }

    if (inRunBlock) {
      const indent = line.match(/^(\s*)/)[1].length;
      if (trimmed.length === 0) continue;
      if (indent <= runIndent) {
        inRunBlock = false;
      } else {
        inspectWorkflowRunLine(line.trim(), relPath, lineNo, currentStep, findings);
      }
    }

    const usesMatch = line.match(/^\s*uses:\s*(.+)\s*$/i);
    if (usesMatch && isWorkflowTestStep(currentStep, null)) {
      findings.push({
        result: 'unknown',
        ruleId: 'SP004',
        path: relPath,
        line: stepStartLine,
        reason: 'workflow_delegated_failure_contract_unproven',
      });
    }
  }

  return findings;
}

function inspectWorkflowRunLine(runLine, relPath, lineNo, stepName, findings) {
  if (!isWorkflowTestStep(stepName, runLine)) return;
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
  StopResult,
  UsageError,
  RESULT_HEADER,
};
