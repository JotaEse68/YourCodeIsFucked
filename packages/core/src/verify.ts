import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { VerificationCheck, VerificationReport } from './types.js';

export function verificationPlan(target: string): VerificationCheck[] {
  const packagePath = join(resolve(target), 'package.json');
  if (!existsSync(packagePath)) return [];
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, string>; packageManager?: string };
  const runner = pkg.packageManager?.startsWith('pnpm@') ? ['corepack', 'pnpm'] : ['npm'];
  return (['lint', 'typecheck', 'test', 'build'] as const).map((name) => ({ name, command: [...runner, 'run', name], status: 'skipped', output: pkg.scripts?.[name] ? undefined : 'No matching package script.' }));
}

export function verify(target: string): VerificationReport {
  const resolvedTarget = resolve(target);
  const checks = verificationPlan(resolvedTarget).map((check) => {
    if (check.output) return check;
    const [command, ...args] = check.command;
    const result = spawnSync(command, args, { cwd: resolvedTarget, encoding: 'utf8', shell: process.platform === 'win32' });
    return { ...check, status: result.status === 0 ? 'passed' as const : 'failed' as const, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
  });
  return { target: resolvedTarget, verifiedAt: new Date().toISOString(), checks, passed: checks.every((check) => check.status !== 'failed') };
}
