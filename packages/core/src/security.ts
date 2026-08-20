import { readFileSync } from 'node:fs';
import { extname, relative } from 'node:path';
import { dependencyAudit } from './dependencies.js';
import { unsafeRuntimeCodePattern } from './refactor-safety.js';
import { computeConfidence, type EvidenceItem } from './confidence.js';
import { typescriptFindings } from './typescript.js';
import { SECURITY_RELEVANT_RULE_IDS } from './types.js';
import type { DependencyVulnerability, Finding } from './types.js';
import { wordpressAjaxFindings, wordpressDataFlowFindings, wordpressDestructiveOperationFindings, wordpressFindings, wordpressPrivilegeEscalationFindings, wordpressRestFindings, wordpressRestPersistenceFindings, wordpressSensitiveExposureFindings } from './wordpress.js';

export interface SecurityCheckProvider { name: string; run(target: string, files: string[]): Finding[]; }

const severityToFindingSeverity: Record<DependencyVulnerability['severity'], Finding['severity']> = { critical: 'medium', high: 'medium', moderate: 'low', low: 'low', unknown: 'low' };
const severityScoreImpact: Record<DependencyVulnerability['severity'], number> = { critical: 8, high: 6, moderate: 3, low: 1, unknown: 1 };

export const dependencySecurityProvider: SecurityCheckProvider = {
  name: 'dependency-security',
  run(target) {
    const report = dependencyAudit(target);
    if (!report.available) return [];
    return report.vulnerabilities.map((vulnerability) => ({
      id: `dependency-vulnerability:${vulnerability.name}`,
      ruleId: 'dependency-vulnerability' as const,
      severity: severityToFindingSeverity[vulnerability.severity],
      risk: 'report-only' as const,
      file: 'package.json',
      lines: [],
      evidence: `${vulnerability.name}: ${vulnerability.severity} severity vulnerability${vulnerability.fixAvailable ? ' (a fix is available -- run your package manager\'s audit fix)' : ' (no automated fix available yet)'}.`,
      scoreImpact: severityScoreImpact[vulnerability.severity],
      sourceSeverity: vulnerability.severity
    }));
  }
};

function lineNumbersMatching(content: string, pattern: RegExp): number[] {
  return content.split(/\r?\n/).flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));
}

const secretPattern = /\b(?:AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,})\b|\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"\s]{6,}['"]/i;
const envReadPattern = /process\.env\.|\.env\[/;
function hardcodedSecretFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, secretPattern).filter((lineNumber) => !envReadPattern.test(content.split(/\r?\n/)[lineNumber - 1]));
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'hardcoded secret, API key, or password pattern match' }));
  return [{ id: `hardcoded-secret:${display}`, ruleId: 'hardcoded-secret', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} line(s) look like a hardcoded secret, API key, or password. Move it to an environment variable or a secrets manager.`, scoreImpact: 6, confidence: computeConfidence(70, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="hardcoded-secret")'`, uncertaintyState: 'NEEDS_HUMAN' }];
}

function unsafeEvalFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, unsafeRuntimeCodePattern);
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'eval() or new Function() call' }));
  return [{ id: `unsafe-eval:${display}`, ruleId: 'unsafe-eval', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} use(s) of eval() or new Function() -- runs arbitrary strings as code. Refactor to avoid it if at all possible.`, scoreImpact: 6, confidence: computeConfidence(95, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="unsafe-eval")'` }];
}

const shellExecPattern = /\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|[^)]*\+)/;
function unsafeShellCommandFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, shellExecPattern);
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'shell command built with string interpolation/concatenation' }));
  return [{ id: `unsafe-shell-command:${display}`, ruleId: 'unsafe-shell-command', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} shell command(s) built with string interpolation/concatenation passed to exec()/execSync(), which shell-interprets its argument. Prefer execFile()/execFileSync() with an argument array.`, scoreImpact: 6, confidence: computeConfidence(75, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="unsafe-shell-command")'`, uncertaintyState: 'NEEDS_HUMAN' }];
}

const sqlConcatPattern = /\.(?:query|execute|raw)\s*\(\s*`[^`]*\$\{/;
function sqlInjectionRiskFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, sqlConcatPattern);
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'query/execute/raw call built with template-literal interpolation' }));
  return [{ id: `sql-injection-risk:${display}`, ruleId: 'sql-injection-risk', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} query/execute/raw call(s) built by interpolating a template literal directly. Use parameterized queries instead.`, scoreImpact: 7, confidence: computeConfidence(70, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="sql-injection-risk")'`, uncertaintyState: 'NEEDS_HUMAN' }];
}

const tlsDisabledPattern = /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/;
function tlsVerificationDisabledFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, tlsDisabledPattern);
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'TLS/SSL certificate verification disabled' }));
  return [{ id: `tls-verification-disabled:${display}`, ruleId: 'tls-verification-disabled', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} location(s) disable TLS/SSL certificate verification. This accepts any certificate, including a forged one.`, scoreImpact: 8, confidence: computeConfidence(95, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="tls-verification-disabled")'` }];
}

// Deliberate scope trim: sensitive-repository-file/-tracked findings are produced by a
// function defined inside index.ts itself, not a leaf module. Reusing them here would
// require importing from index.ts, creating the exact import cycle this plan's Global
// Constraints forbid (security.ts must stay a leaf module). They remain fully present in
// `ycf audit`'s security score dimension; they are just not summed into this check.
function reusedSecurityFindings(target: string, files: string[]): Finding[] {
  const relevant = new Set(SECURITY_RELEVANT_RULE_IDS);
  const wordpressSources = files.filter((file) => extname(file) === '.php').map((file) => ({ path: relative(target, file) || file, content: readFileSync(file, 'utf8') }));
  const wordpressPerFile = wordpressSources.flatMap((source) => wordpressFindings(source.path, source.content));
  const wordpressBulk = [...wordpressAjaxFindings(wordpressSources), ...wordpressDataFlowFindings(wordpressSources), ...wordpressRestFindings(wordpressSources), ...wordpressRestPersistenceFindings(wordpressSources), ...wordpressDestructiveOperationFindings(wordpressSources), ...wordpressPrivilegeEscalationFindings(wordpressSources), ...wordpressSensitiveExposureFindings(wordpressSources)];
  const typescript = files.flatMap((file) => typescriptFindings(file, readFileSync(file, 'utf8'), relative(target, file) || file));
  return [...wordpressPerFile, ...wordpressBulk, ...typescript].filter((finding) => relevant.has(finding.ruleId));
}

export const basicStaticSecurityProvider: SecurityCheckProvider = {
  name: 'basic-static-security',
  run(target, files) {
    return [
      ...files.flatMap((file) => [
        ...hardcodedSecretFindings(target, file),
        ...unsafeEvalFindings(target, file),
        ...unsafeShellCommandFindings(target, file),
        ...sqlInjectionRiskFindings(target, file),
        ...tlsVerificationDisabledFindings(target, file)
      ]),
      ...reusedSecurityFindings(target, files)
    ];
  }
};

export function runSecurityChecks(target: string, files: string[]): Finding[] {
  return [dependencySecurityProvider, basicStaticSecurityProvider].flatMap((provider) => provider.run(target, files));
}
