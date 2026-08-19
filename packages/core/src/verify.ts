import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { loadConfig } from './config.js';
import { runSecurityChecks } from './security.js';
import type { Finding, VerificationCheck, VerificationReport } from './types.js';

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.php']);
const ignoredDirs = new Set(['node_modules', 'vendor', 'dist', 'build', '.git', '.ycf']);
function walkSourceFiles(target: string): string[] {
  const out: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirs.has(entry)) continue;
      const file = join(directory, entry);
      const info = statSync(file);
      if (info.isDirectory()) visit(file); else if (sourceExtensions.has(extname(file))) out.push(file);
    }
  };
  visit(target);
  return out;
}

const severityRank: Record<string, number> = { low: 1, moderate: 2, high: 3, critical: 4 };
function securityCheckStatus(target: string, findings: Finding[]): { status: 'passed' | 'failed'; output: string } {
  const threshold = loadConfig(target).security.dependencyFailOn;
  const output = findings.length ? findings.map((finding) => `[${finding.ruleId}] ${finding.file} -- ${finding.evidence}`).join('\n') : 'No security findings.';
  if (threshold === 'none') return { status: 'passed', output };
  const thresholdRank = severityRank[threshold];
  // A dependency-vulnerability finding whose sourceSeverity is 'unknown' (or, defensively,
  // missing) is treated as meeting any configured threshold except 'none': an unrecognized
  // severity should never be silently ignored just because we can't rank it.
  const failing = findings.some((finding) => {
    if (finding.ruleId !== 'dependency-vulnerability') return false;
    if (finding.sourceSeverity === undefined || finding.sourceSeverity === 'unknown') return true;
    return severityRank[finding.sourceSeverity] >= thresholdRank;
  });
  return { status: failing ? 'failed' : 'passed', output };
}

export function verificationPlan(target: string): VerificationCheck[] {
  const packagePath = join(resolve(target), 'package.json');
  const securityCheck: VerificationCheck = { name: 'security', command: [], status: 'skipped' };
  if (!existsSync(packagePath)) return [securityCheck];
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, string>; packageManager?: string };
  const runner = pkg.packageManager?.startsWith('pnpm@') ? ['corepack', 'pnpm'] : ['npm'];
  return [
    ...(['lint', 'typecheck', 'test', 'build'] as const).map((name) => ({ name, command: [...runner, 'run', name], status: 'skipped' as const, output: pkg.scripts?.[name] ? undefined : 'No matching package script.' })),
    securityCheck
  ];
}

export function verify(target: string): VerificationReport {
  const resolvedTarget = resolve(target);
  const checks = verificationPlan(resolvedTarget).map((check) => {
    if (check.name === 'security') {
      const result = securityCheckStatus(resolvedTarget, runSecurityChecks(resolvedTarget, walkSourceFiles(resolvedTarget)));
      return { ...check, status: result.status, output: result.output };
    }
    if (check.output) return check;
    const [command, ...args] = check.command;
    const result = spawnSync(command, args, { cwd: resolvedTarget, encoding: 'utf8', shell: process.platform === 'win32' });
    return { ...check, status: result.status === 0 ? 'passed' as const : 'failed' as const, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
  });
  return { target: resolvedTarget, verifiedAt: new Date().toISOString(), checks, passed: checks.every((check) => check.status !== 'failed') };
}

export function verifyFast(target: string): VerificationReport {
  const resolvedTarget = resolve(target);
  const fast = new Set(['lint', 'typecheck']);
  const checks = verificationPlan(resolvedTarget).filter((check) => fast.has(check.name)).map((check) => {
    if (check.output) return check;
    const [command, ...args] = check.command;
    const result = spawnSync(command, args, { cwd: resolvedTarget, encoding: 'utf8', shell: process.platform === 'win32' });
    return { ...check, status: result.status === 0 ? 'passed' as const : 'failed' as const, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
  });
  return { target: resolvedTarget, verifiedAt: new Date().toISOString(), checks, passed: checks.every((check) => check.status !== 'failed') };
}
