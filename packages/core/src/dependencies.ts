import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DependencyAuditReport, DependencyVulnerability } from './types.js';

export function dependencyAuditPlan(target: string): { manager: DependencyAuditReport['manager']; command: string[] } {
  const packagePath = join(resolve(target), 'package.json');
  if (!existsSync(packagePath)) return { manager: 'unknown', command: [] };
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { packageManager?: string };
  return pkg.packageManager?.startsWith('pnpm@')
    ? { manager: 'pnpm', command: ['corepack', 'pnpm', 'audit', '--json', '--prod'] }
    : { manager: 'npm', command: ['npm', 'audit', '--json', '--omit=dev'] };
}

function severity(value: unknown): DependencyVulnerability['severity'] {
  return value === 'low' || value === 'moderate' || value === 'high' || value === 'critical' ? value : 'unknown';
}

/** Parses npm and pnpm audit JSON without exposing package-lock contents or changing dependencies. */
export function parseDependencyAudit(raw: string): DependencyVulnerability[] {
  const report = JSON.parse(raw) as { vulnerabilities?: Record<string, { severity?: unknown; fixAvailable?: boolean | object }>; advisories?: Record<string, { module_name?: string; severity?: unknown }> };
  if (report.vulnerabilities) return Object.entries(report.vulnerabilities).map(([name, vulnerability]) => ({ name, severity: severity(vulnerability.severity), fixAvailable: Boolean(vulnerability.fixAvailable) }));
  if (report.advisories) return Object.values(report.advisories).map((advisory) => ({ name: advisory.module_name ?? 'unknown', severity: severity(advisory.severity), fixAvailable: false }));
  return [];
}

export function dependencyAudit(target: string): DependencyAuditReport {
  const resolvedTarget = resolve(target);
  const plan = dependencyAuditPlan(resolvedTarget);
  if (plan.manager === 'unknown') return { target: resolvedTarget, auditedAt: new Date().toISOString(), ...plan, available: false, vulnerabilities: [], error: 'No package.json was found.' };
  const [command, ...args] = plan.command;
  // Bounded so a FULL VERIFY (verify(), possibly multiplied per-block under
  // --apply-plan) can never hang indefinitely when there is no network access or the
  // package manager's registry is firewalled. On timeout, spawnSync returns with empty
  // stdout/stderr, output becomes '', JSON.parse('') throws below, and the existing
  // catch already reports { available: false, ... } -- no other code path changes.
  const result = spawnSync(command, args, { cwd: resolvedTarget, encoding: 'utf8', shell: process.platform === 'win32', timeout: 60_000 });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  try {
    return { target: resolvedTarget, auditedAt: new Date().toISOString(), ...plan, available: true, vulnerabilities: parseDependencyAudit(output) };
  } catch {
    return { target: resolvedTarget, auditedAt: new Date().toISOString(), ...plan, available: false, vulnerabilities: [], error: output || 'The package manager did not return an audit report.' };
  }
}
