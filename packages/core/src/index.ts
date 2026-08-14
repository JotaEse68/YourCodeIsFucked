import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type Stack = 'javascript' | 'typescript' | 'react' | 'php' | 'wordpress';

export interface GitState {
  detected: boolean;
  root?: string;
}

export interface AuditReport {
  version: 1;
  target: string;
  auditedAt: string;
  readOnly: true;
  stacks: Stack[];
  sourceFiles: number;
  git: GitState;
  findings: [];
  score: {
    fucked: number;
    health: number;
    method: 'deterministic-v1';
  };
}

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'vendor']);
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.php']);

function walk(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
}

export function detectStacks(target: string): Stack[] {
  const stacks = new Set<Stack>();
  const packagePath = join(target, 'package.json');
  if (existsSync(packagePath)) {
    stacks.add('javascript');
    const pkg = readFileSync(packagePath, 'utf8');
    if (existsSync(join(target, 'tsconfig.json')) || /typescript/.test(pkg)) stacks.add('typescript');
    if (/['\"](?:react|next|@vitejs\/plugin-react)['\"]/.test(pkg)) stacks.add('react');
  }
  const files = walk(target);
  const phpFiles = files.filter((file) => file.endsWith('.php'));
  if (phpFiles.length > 0) stacks.add('php');
  if (existsSync(join(target, 'wp-config.php')) || phpFiles.some((file) => /add_(action|filter)|register_rest_route/.test(readFileSync(file, 'utf8')))) {
    stacks.add('wordpress');
  }
  return [...stacks];
}

export function findGitRoot(start: string): GitState {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, '.git'))) return { detected: true, root: current };
    const parent = resolve(current, '..');
    if (parent === current) return { detected: false };
    current = parent;
  }
}

export function audit(target: string): AuditReport {
  const resolvedTarget = resolve(target);
  if (!existsSync(resolvedTarget)) throw new Error(`Target does not exist: ${resolvedTarget}`);
  const sourceFiles = walk(resolvedTarget).filter((file) => sourceExtensions.has(file.slice(file.lastIndexOf('.')))).length;
  return {
    version: 1,
    target: resolvedTarget,
    auditedAt: new Date().toISOString(),
    readOnly: true,
    stacks: detectStacks(resolvedTarget),
    sourceFiles,
    git: findGitRoot(resolvedTarget),
    findings: [],
    score: { fucked: 0, health: 100, method: 'deterministic-v1' }
  };
}
