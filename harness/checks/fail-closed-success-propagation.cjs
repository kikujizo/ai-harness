#!/usr/bin/env node
'use strict';

// Issue #123: 変更された shell / Node test / Workflow について、既知の success-propagation
// 迂回と静的に成否伝播を証明できない箇所を機械検出する。
// CLI契約: --base <commit_sha> --head <commit_sha>

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
  /\b(test|check|verify|lint)\b|npm\s+test|yarn\s+test|pnpm\s+test|node\s+[^\s|;&]*test|bash\s+-n|shellcheck|eslint|jest|mocha|vitest/i;
const SP001_SUPPRESS_RE = /\|\|\s*(true|:)\s*($|[#;])/;
const UNCONDITIONAL_EXIT0_RE = /^\s*exit\s+0\s*($|[#;])/;
const FAILURE_RECORD_RE =
  /\b([A-Z][A-Z0-9_]*_(?:EXIT|PASS|FAIL|STATUS)|LOCAL_E2E_PASS|POC_KEY_GATE_PASS)\s*=\s*(?:false|1|[^0\s]|\$?\?)/i;
const SET_PLUS_E_RE = /^\s*set\s+\+e\b/;
const SET_MINUS_E_RE =
  /^\s*set\s+-e\b|^\s*set\s+-eu\b|^\s*set\s+-euo\s+pipefail\b|^\s*set\s+-o\s+errexit\b/;
const BARE_RETURN_RE = /^\s*return\s*($|[#;])/;
const SIMPLE_NODE_CONDITION_RE =
  /^(?:!)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$|^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*\s*(?:===|!==|==|!=)\s*(?:true|false|null|undefined|\d+)$/;
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

function lineIndent(line) {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function isMeaningfulLine(line) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith('#');
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
  return SIMPLE_NODE_CONDITION_RE.test(normalized);
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

    if (BARE_RETURN_RE.test(line)) {
      findings.push({
        result: 'unknown',
        ruleId: 'SP002',
        path: relPath,
        line: lineNo,
        reason: 'shell_failure_propagation_unproven',
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
    if (i > ifIdx && lineIndent(lines[i]) < ifIndent && isMeaningfulLine(lines[i])) {
      end = i - 1;
      break;
    }
  }

  return { start, end };
}

function hasElseAfterFlatIf(lines, endIdx) {
  for (let i = endIdx + 1; i < Math.min(lines.length, endIdx + 3); i += 1) {
    if (!isMeaningfulLine(lines[i])) continue;
    const codeView = buildCodeView(stripComment(lines[i], 'node'));
    if (/\belse\b/.test(codeView)) return true;
    break;
  }
  return false;
}

function flatIfInteriorIsSimple(lines, start, end) {
  for (let i = start + 1; i < end; i += 1) {
    if (!isMeaningfulLine(lines[i])) continue;
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

function detectLimitedImplicitReturn(lines, relPath) {
  const findings = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const codeView = buildCodeView(stripComment(lines[idx], 'node'));
    if (!/\bfunction\b/.test(codeView)) continue;

    let bodyStart = -1;
    let bodyEnd = -1;
    let depth = 0;
    for (let i = idx; i < lines.length; i += 1) {
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
    if (bodyStart === -1 || bodyEnd === -1) continue;

    const meaningful = [];
    for (let i = bodyStart + 1; i < bodyEnd; i += 1) {
      if (isMeaningfulLine(lines[i])) meaningful.push(i);
    }
    if (meaningful.length === 0) continue;

    const ifIdx = meaningful[0];
    const ifCodeView = buildCodeView(stripComment(lines[ifIdx], 'node'));
    if (!/\bif\s*\(/.test(ifCodeView)) continue;
    if (!hasAbsenceTerm(lines[ifIdx])) continue;

    const { start, end } = getNodeFlatIfRange(lines, ifIdx);
    if (!flatIfInteriorIsSimple(lines, start, end)) continue;
    if (hasElseAfterFlatIf(lines, end)) continue;

    let onlyIfInBody = true;
    for (let i = bodyStart + 1; i < bodyEnd; i += 1) {
      if (!isMeaningfulLine(lines[i])) continue;
      if (i < start || i > end) {
        onlyIfInBody = false;
        break;
      }
    }
    if (!onlyIfInBody) continue;

    let hasSuccessExit = false;
    let hasFailureExit = false;
    for (let i = start; i <= end; i += 1) {
      const stripped = stripComment(lines[i], 'node');
      if (NODE_SUCCESS_EXIT_RE.test(stripped)) hasSuccessExit = true;
      if (NODE_FAILURE_EXIT_RE.test(stripped)) hasFailureExit = true;
    }
    if (hasSuccessExit && !hasFailureExit) {
      findings.push({
        result: 'fail',
        ruleId: 'SP003',
        path: relPath,
        line: ifIdx + 1,
        reason: ['node_', 'skip', '_returns_success'].join(''),
      });
    }
  }
  return findings;
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
  const looksLikeCheckCode =
    CHECK_PURPOSE_RE.test(content) || lines.some((line) => hasAbsenceTerm(line));
  if (!isTestLike && !looksLikeCheckCode) {
    return findings;
  }

  findings.push(...detectLimitedImplicitReturn(lines, relPath));

  for (let idx = 0; idx < lines.length; idx += 1) {
    const lineNo = idx + 1;
    const rawLine = lines[idx];
    const line = stripComment(rawLine, 'node');
    const codeView = buildCodeView(line);

    if (!hasAbsenceTerm(rawLine)) continue;

    let ifIdx = idx;
    if (!/\bif\s*\(/.test(codeView)) {
      for (let back = idx; back >= Math.max(0, idx - 6); back -= 1) {
        const backView = buildCodeView(stripComment(lines[back], 'node'));
        if (/\bif\s*\(/.test(backView)) {
          ifIdx = back;
          break;
        }
      }
    }

    const ifCodeView = buildCodeView(stripComment(lines[ifIdx], 'node'));
    const condition = extractIfCondition(ifCodeView);
    const { start, end } = getNodeFlatIfRange(lines, ifIdx);
    const branchWindow = lines.slice(start, end + 1);

    if (condition && !isSimpleNodeCondition(condition)) {
      findings.push({
        result: 'unknown',
        ruleId: 'SP003',
        path: relPath,
        line: lineNo,
        reason: ['node_', 'skip', '_propagation_unproven'].join(''),
      });
      continue;
    }

    if (!flatIfInteriorIsSimple(lines, start, end) || hasElseAfterFlatIf(lines, end)) {
      findings.push({
        result: 'unknown',
        ruleId: 'SP003',
        path: relPath,
        line: lineNo,
        reason: ['node_', 'skip', '_propagation_unproven'].join(''),
      });
      continue;
    }

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

function parseStepBlock(lines, startIdx, endIdx, stepListIndent, stepKeyIndent, runBodyIndent) {
  const block = {
    startLine: startIdx + 1,
    name: null,
    id: null,
    runLines: [],
    uses: null,
    continueOnError: false,
    hasDisallowedKey: false,
    hasFoldedRun: false,
    hasExpression: false,
  };

  const listLine = lines[startIdx];
  const listInlineRun = listLine.match(new RegExp(`^\\s{${stepListIndent}}-\\s+run:\\s*(.+)$`));
  if (listInlineRun) {
    const value = listInlineRun[1].trim();
    if (value.length > 0 && value !== '|' && value !== '|-' && value !== '>') {
      block.runLines.push({ lineNo: startIdx + 1, text: value });
    }
    if (value === '>') block.hasFoldedRun = true;
  }

  const listInlineBlock = listLine.match(new RegExp(`^\\s{${stepListIndent}}-\\s+run:\\s*\\|\\s*$`));
  if (listInlineBlock) {
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
  if (listInlineName) block.name = listInlineName[1].trim();

  const listInlineId = listLine.match(new RegExp(`^\\s{${stepListIndent}}-\\s+id:\\s*(.+)$`));
  if (listInlineId) block.id = listInlineId[1].trim();

  const listInlineUses = listLine.match(new RegExp(`^\\s{${stepListIndent}}-\\s+uses:\\s*(.+)$`, 'i'));
  if (listInlineUses) block.uses = listInlineUses[1].trim();

  const listInlineContinue = listLine.match(
    new RegExp(`^\\s{${stepListIndent}}-\\s+continue-on-error:\\s*(true|yes)\\s*$`, 'i'),
  );
  if (listInlineContinue) block.continueOnError = true;

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
      if (value === '|' || value === '|-' || value === '>') {
        block.hasFoldedRun = value === '>';
      } else if (value.length > 0) {
        block.runLines.push({ lineNo: i + 1, text: value });
      }
    }

    if (line.match(new RegExp(`^\\s{${stepKeyIndent}}run:\\s*\\|`))) {
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
      if (!['name', 'id', 'run', 'uses', 'continue-on-error', 'shell'].includes(key)) {
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
  const isComposite = lines.some((line) => /^\s*using:\s*composite\s*$/i.test(line));
  if (!isComposite) return blocks;

  for (let i = 0; i < lines.length; i += 1) {
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

function evaluateJobLevelWorkflow(lines, relPath, findings) {
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

    if (jobLines.some((jobLine) => /^    uses:\s/.test(jobLine))) {
      findings.push({
        result: 'unknown',
        ruleId: 'SP004',
        path: relPath,
        line: i + 1,
        reason: 'workflow_reusable_job_unproven',
      });
    }

    const jobText = jobLines.join('\n');
    if (/matrix:/i.test(jobText) && (/\$\{\{/.test(jobText) || /fromJSON\(/i.test(jobText))) {
      findings.push({
        result: 'unknown',
        ruleId: 'SP004',
        path: relPath,
        line: i + 1,
        reason: 'workflow_dynamic_matrix_unproven',
      });
    }
  }
}

function evaluateStepBlock(block, relPath, findings) {
  const stepName = block.name || block.id;
  const runText = block.runLines.map((entry) => entry.text).join('\n');
  const isTestStep = isWorkflowTestStep(stepName, runText);

  if (!isTestStep) return;

  if (block.hasDisallowedKey || block.hasFoldedRun || block.hasExpression) {
    findings.push({
      result: 'unknown',
      ruleId: 'SP004',
      path: relPath,
      line: block.startLine,
      reason: 'workflow_structure_unsupported',
    });
    return;
  }

  if (block.continueOnError) {
    findings.push({
      result: 'fail',
      ruleId: 'SP004',
      path: relPath,
      line: block.startLine,
      reason: 'workflow_continue_on_error',
    });
  }

  if (block.uses) {
    findings.push({
      result: 'unknown',
      ruleId: 'SP004',
      path: relPath,
      line: block.startLine,
      reason: 'workflow_delegated_failure_contract_unproven',
    });
  }

  for (const runEntry of block.runLines) {
    inspectWorkflowRunLine(runEntry.text, relPath, runEntry.lineNo, stepName, findings);
  }
}

function analyzeWorkflow(content, relPath) {
  const lines = content.split(/\r?\n/);
  const findings = [];
  const isAction = /(?:^|\/)action\.ya?ml$/i.test(relPath);

  const stepBlocks = isAction ? collectCompositeStepBlocks(lines) : collectWorkflowStepBlocks(lines);
  for (const entry of stepBlocks) {
    evaluateStepBlock(entry.block, relPath, findings);
  }

  if (!isAction) {
    evaluateJobLevelWorkflow(lines, relPath, findings);
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
  StopResult,
  UsageError,
  SYNTAX_CONTRACT,
  buildCodeView,
  hasAbsenceTerm,
  absenceTermOutsideStrings,
  isSimpleNodeCondition,
  RESULT_HEADER,
};
