import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

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
  findings: Finding[];
  score: {
    fucked: number;
    health: number;
    method: 'deterministic-v1';
  };
}

export type FindingRisk = 'report-only' | 'auto' | 'safe-refactor' | 'architectural';

export interface Finding {
  id: string;
  ruleId: 'debug-statements' | 'ai-residue' | 'large-source-file';
  severity: 'low' | 'medium';
  risk: FindingRisk;
  file: string;
  lines: number[];
  evidence: string;
  scoreImpact: number;
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

function sourceFilesIn(target: string): string[] {
  return walk(target).filter((file) => sourceExtensions.has(extname(file)));
}

function lineNumbers(content: string, expression: RegExp): number[] {
  return content.split(/\r?\n/).flatMap((line, index) => expression.test(line) ? [index + 1] : []);
}

function analyzeFile(target: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const content = readFileSync(file, 'utf8');
  const displayPath = relative(target, file) || file;
  const lines = content.split(/\r?\n/);
  const debuggerLines = lineNumbers(content, /^\s*debugger\s*;/);
  if (debuggerLines.length > 0) {
    findings.push({
      id: `debug-statements:${displayPath}`,
      ruleId: 'debug-statements',
      severity: 'low',
      risk: 'auto',
      file: displayPath,
      lines: debuggerLines,
      evidence: `${debuggerLines.length} debugger statement(s).`,
      scoreImpact: Math.min(debuggerLines.length * 2, 10)
    });
  }
  const residueLines = lineNumbers(content, /^\s*(?:\/\/|\/\*|\*|#).*\b(?:temporary\s+fix|todo\s*:\s*(?:remove|delete)|final-final|backup copy)\b/i);
  if (residueLines.length > 0) {
    findings.push({
      id: `ai-residue:${displayPath}`,
      ruleId: 'ai-residue',
      severity: 'low',
      risk: 'report-only',
      file: displayPath,
      lines: residueLines,
      evidence: `${residueLines.length} possible AI/dev residue marker(s); review intent before changing.`,
      scoreImpact: Math.min(residueLines.length * 2, 8)
    });
  }
  if (lines.length > 700) {
    findings.push({
      id: `large-source-file:${displayPath}`,
      ruleId: 'large-source-file',
      severity: 'medium',
      risk: 'safe-refactor',
      file: displayPath,
      lines: [1, lines.length],
      evidence: `Source file has ${lines.length} lines; the default threshold is 700.`,
      scoreImpact: 5
    });
  }
  return findings;
}

export function calculateScore(findings: Finding[]): AuditReport['score'] {
  const fucked = Math.min(100, findings.reduce((total, finding) => total + finding.scoreImpact, 0));
  return { fucked, health: 100 - fucked, method: 'deterministic-v1' };
}

export function audit(target: string): AuditReport {
  const resolvedTarget = resolve(target);
  if (!existsSync(resolvedTarget)) throw new Error(`Target does not exist: ${resolvedTarget}`);
  const files = sourceFilesIn(resolvedTarget);
  const findings = files.flatMap((file) => analyzeFile(resolvedTarget, file));
  return {
    version: 1,
    target: resolvedTarget,
    auditedAt: new Date().toISOString(),
    readOnly: true,
    stacks: detectStacks(resolvedTarget),
    sourceFiles: files.length,
    git: findGitRoot(resolvedTarget),
    findings,
    score: calculateScore(findings)
  };
}
