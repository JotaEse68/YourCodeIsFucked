import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { ignoredDirectories, loadConfig } from './config.js';
import { findGitRoot } from './git.js';
import { writeAuditReport as persistAuditReport, writeRefactorPlan } from './reporters.js';
import { buildRefactorPlan } from './planner.js';
import { wordpressAjaxFindings, wordpressFindings } from './wordpress.js';
import { createReleaseReadiness } from './release.js';
import type { AuditReport, CleanupReport, Finding, RefactorPlan, Stack, UnderstandReport, YcfConfig } from './types.js';
export type { AuditReport, CleanupReport, Finding, FindingRisk, GitCheckpoint, GitState, RefactorPlan, RefactorRecommendation, ReleaseCheck, ReleaseReport, Stack, UnderstandReport, UnfuckReport, VerificationCheck, VerificationReport, YcfConfig } from './types.js';
export { defaultConfig, loadConfig } from './config.js';
export { createCheckpoint, findGitRoot, latestCheckpoint, rollbackToCheckpoint } from './git.js';
export { verificationPlan, verify } from './verify.js';
export { writeUnfuckReport } from './reporters.js';
export { writeReleaseReport } from './reporters.js';
export { releaseCheckLabel, releaseCheckedLabel, releaseHeading, releaseReportLabel } from './i18n.js';

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.php']);

export const releaseReadiness = createReleaseReadiness(audit, understand);

function walk(directory: string, ignored = ignoredDirectories): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (ignored.has(entry)) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) result.push(...walk(path, ignored));
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

function sourceFilesIn(target: string, config = loadConfig(target)): string[] {
  return walk(target, new Set([...ignoredDirectories, ...config.ignore])).filter((file) => sourceExtensions.has(extname(file)));
}

function lineNumbers(content: string, expression: RegExp): number[] {
  return content.split(/\r?\n/).flatMap((line, index) => expression.test(line) ? [index + 1] : []);
}

function lineAt(content: string, offset: number): number {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function complexityRegions(content: string): Array<{ name: string; start: number; end: number; body: string }> {
  const regions: Array<{ name: string; start: number; end: number; body: string }> = [];
  const declaration = /\bfunction\s+([\w$]+)\s*\([^)]*\)\s*\{|(?:\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>\s*\{)/g;
  for (const match of content.matchAll(declaration)) {
    const openBrace = (match.index ?? 0) + match[0].lastIndexOf('{');
    let depth = 0;
    let end = openBrace;
    for (; end < content.length; end += 1) {
      if (content[end] === '{') depth += 1;
      if (content[end] === '}') depth -= 1;
      if (depth === 0) break;
    }
    if (depth === 0) regions.push({ name: match[1] ?? match[2] ?? 'anonymous', start: lineAt(content, match.index ?? 0), end: lineAt(content, end), body: content.slice(openBrace, end + 1) });
  }
  return regions;
}

function literalDebugConsoleStatements(file: string, content: string): Array<{ start: number; end: number; line: number }> {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
  const statements: Array<{ start: number; end: number; line: number }> = [];
  const isPureLiteral = (node: ts.Expression): boolean => ts.isStringLiteral(node) || ts.isNumericLiteral(node) || node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword || node.kind === ts.SyntaxKind.NullKeyword;
  const visit = (node: ts.Node): void => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && ts.isPropertyAccessExpression(node.expression.expression)) {
      const access = node.expression.expression;
      const method = access.name.text;
      const isConsole = ts.isIdentifier(access.expression) && access.expression.text === 'console';
      const firstArgument = node.expression.arguments[0];
      const markedLog = method === 'log' && firstArgument && ts.isStringLiteral(firstArgument) && /^(?:\[?(?:debug|dev|temporary|test)\b)/i.test(firstArgument.text);
      if (isConsole && (method === 'debug' || markedLog) && node.expression.arguments.every(isPureLiteral)) {
        statements.push({ start: node.getStart(sourceFile), end: node.end, line: lineAt(content, node.getStart(sourceFile)) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return statements;
}

function unusedNamedImportRanges(file: string, content: string): Array<{ start: number; end: number; line: number }> {
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
  const used = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node)) used.add(node.text);
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  const ranges: Array<{ start: number; end: number; line: number }> = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || !statement.importClause.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    const specifiers = statement.importClause.namedBindings.elements;
    const unused = specifiers.filter((specifier) => !used.has(specifier.name.text));
    // Retain an import that would otherwise disappear: it may intentionally run module side effects.
    if (unused.length !== 1 || specifiers.length < 2) continue;
    const specifier = unused[0];
    const index = specifiers.indexOf(specifier);
    const start = index < specifiers.length - 1 ? specifier.getStart(sourceFile) : specifiers[index - 1].end;
    const end = index < specifiers.length - 1 ? specifiers[index + 1].getStart(sourceFile) : specifier.end;
    ranges.push({ start, end, line: lineAt(content, specifier.getStart(sourceFile)) });
  }
  return ranges;
}

function reactEffectsWithoutDependencies(file: string, content: string): number[] {
  if (!['.jsx', '.tsx'].includes(extname(file))) return [];
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const name = ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) && expression.name.text === 'useEffect' ? 'useEffect' : '';
      if (name === 'useEffect' && node.arguments.length < 2) lines.push(lineAt(content, node.getStart(sourceFile)));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return lines;
}

function analyzeFile(target: string, file: string, config: YcfConfig): Finding[] {
  const findings: Finding[] = [];
  const content = readFileSync(file, 'utf8');
  const displayPath = relative(target, file) || file;
  const lines = content.split(/\r?\n/);
  if (extname(file) === '.php') findings.push(...wordpressFindings(displayPath, content));
  if (/(?:^|[._-])(?:final-final|new-version|backup|temp|old|fix\d+|test-final)(?:[._-]|$)/i.test(basename(file))) {
    findings.push({
      id: `suspicious-filename:${displayPath}`,
      ruleId: 'suspicious-filename',
      severity: 'low',
      risk: 'report-only',
      file: displayPath,
      lines: [],
      evidence: 'Filename looks like an iterative or backup artifact. Confirm references and intent before renaming or removing it.',
      scoreImpact: 1
    });
  }
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
  const debugConsoleLines = literalDebugConsoleStatements(file, content).map((statement) => statement.line);
  if (debugConsoleLines.length > 0) {
    findings.push({
      id: `debug-console:${displayPath}`,
      ruleId: 'debug-console',
      severity: 'low',
      risk: 'auto',
      file: displayPath,
      lines: debugConsoleLines,
      evidence: `${debugConsoleLines.length} parser-confirmed literal debug console call(s).`,
      scoreImpact: Math.min(debugConsoleLines.length * 2, 10)
    });
  }
  const unusedImportLines = unusedNamedImportRanges(file, content).map((range) => range.line);
  if (unusedImportLines.length > 0) {
    findings.push({
      id: `unused-import:${displayPath}`,
      ruleId: 'unused-import',
      severity: 'low',
      risk: 'auto',
      file: displayPath,
      lines: unusedImportLines,
      evidence: `${unusedImportLines.length} unused named import(s) can be removed while preserving the module import.`,
      scoreImpact: Math.min(unusedImportLines.length * 2, 10)
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
  if (lines.length > config.refactor.maxFileLines) {
    findings.push({
      id: `large-source-file:${displayPath}`,
      ruleId: 'large-source-file',
      severity: 'medium',
      risk: 'safe-refactor',
      file: displayPath,
      lines: [1, lines.length],
      evidence: `Source file has ${lines.length} lines; configured threshold is ${config.refactor.maxFileLines}.`,
      scoreImpact: 5
    });
  }
  for (const region of complexityRegions(content)) {
    const functionLines = region.end - region.start + 1;
    if (functionLines > config.refactor.maxFunctionLines) findings.push({
      id: `long-function:${displayPath}:${region.name}:${region.start}`,
      ruleId: 'long-function',
      severity: 'medium',
      risk: 'safe-refactor',
      file: displayPath,
      lines: [region.start, region.end],
      evidence: `Function ${region.name} has ${functionLines} lines; configured threshold is ${config.refactor.maxFunctionLines}.`,
      scoreImpact: 4
    });
    if (['.jsx', '.tsx'].includes(extname(file)) && /^[A-Z]/.test(region.name) && /<[A-Za-z][^>]*>/.test(region.body) && functionLines > config.refactor.maxFunctionLines) findings.push({
      id: `large-react-component:${displayPath}:${region.name}:${region.start}`,
      ruleId: 'large-react-component',
      severity: 'medium',
      risk: 'safe-refactor',
      file: displayPath,
      lines: [region.start, region.end],
      evidence: `React component ${region.name} has ${functionLines} lines and JSX. Review opportunities to extract cohesive subcomponents or hooks.`,
      scoreImpact: 5
    });
    const decisionPoints = (region.body.match(/\b(?:if|else\s+if|for|while|case|catch)\b|&&|\|\||\?/g) ?? []).length;
    const complexity = decisionPoints + 1;
    if (complexity > config.refactor.maxComplexity) findings.push({
      id: `high-complexity:${displayPath}:${region.name}:${region.start}`,
      ruleId: 'high-complexity',
      severity: 'medium',
      risk: 'report-only',
      file: displayPath,
      lines: [region.start, region.end],
      evidence: `Function ${region.name} has estimated cyclomatic complexity ${complexity}; configured threshold is ${config.refactor.maxComplexity}. Review before splitting logic.`,
      scoreImpact: Math.min(8, Math.ceil((complexity - config.refactor.maxComplexity) / 2) + 2)
    });
  }
  const effectsWithoutDependencies = reactEffectsWithoutDependencies(file, content);
  if (effectsWithoutDependencies.length > 0) findings.push({
    id: `react-effect-without-dependencies:${displayPath}`,
    ruleId: 'react-effect-without-dependencies',
    severity: 'low',
    risk: 'report-only',
    file: displayPath,
    lines: effectsWithoutDependencies,
    evidence: `${effectsWithoutDependencies.length} useEffect call(s) omit a dependency array. This can be intentional; review render behavior before changing it.`,
    scoreImpact: Math.min(effectsWithoutDependencies.length * 2, 8)
  });
  return findings;
}

function packageName(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return undefined;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function importedPackages(files: string[]): Set<string> {
  const packages = new Set<string>();
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const match of content.matchAll(/(?:import\s+(?:[^'";]+?\s+from\s+)?|require\(|from\s+)["']([^"']+)["']/g)) {
      const name = packageName(match[1]);
      if (name) packages.add(name);
    }
  }
  return packages;
}

function dependencyFindings(target: string, files: string[]): Finding[] {
  const packagePath = join(target, 'package.json');
  if (!existsSync(packagePath)) return [];
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { dependencies?: Record<string, string> };
  const imported = importedPackages(files);
  return Object.keys(pkg.dependencies ?? {}).filter((dependency) => !imported.has(dependency)).map((dependency) => ({
    id: `unused-production-dependency:${dependency}`,
    ruleId: 'unused-production-dependency' as const,
    severity: 'low' as const,
    risk: 'report-only' as const,
    file: 'package.json',
    lines: [],
    evidence: `Production dependency "${dependency}" has no static import or require in scanned source files. Dynamic/runtime use is possible; review before removal.`,
    scoreImpact: 2
  }));
}

export function duplicateGroups(target: string, files: string[]): Array<{ id: string; lines: number; occurrences: Array<{ file: string; startLine: number; endLine: number }> }> {
  const blocks = new Map<string, Array<{ file: string; startLine: number; endLine: number }>>();
  for (const file of files) {
    const displayPath = relative(target, file);
    const normalized = readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.replace(/\/\/.*$/, '').replace(/\s+/g, ' ').trim());
    for (let index = 0; index <= normalized.length - 6; index += 1) {
      const block = normalized.slice(index, index + 6);
      if (block.some((line) => !line) || block.join('').length < 80) continue;
      const key = block.join('\n');
      const occurrences = blocks.get(key) ?? [];
      occurrences.push({ file: displayPath, startLine: index + 1, endLine: index + 6 });
      blocks.set(key, occurrences);
    }
  }
  return [...blocks.values()]
    .filter((occurrences) => occurrences.length > 1)
    .map((occurrences) => ({ id: `duplicate-code:${occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(':')}`, lines: 6, occurrences }));
}

function duplicateFindings(target: string, files: string[]): Finding[] {
  return duplicateGroups(target, files).map((group) => {
    const [, ...copies] = group.occurrences;
    return {
      id: group.id,
      ruleId: 'duplicate-code',
      severity: 'medium',
      risk: 'report-only',
      file: copies[0].file,
      lines: [copies[0].startLine, copies[0].endLine],
      evidence: `Exact normalized ${group.lines}-line block appears in ${group.occurrences.length} locations (${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}). Review behavior and consumers before consolidation.`,
      scoreImpact: Math.min(8, 2 + copies.length * 2)
    };
  });
}

export function calculateScore(findings: Finding[]): AuditReport['score'] {
  const fucked = Math.min(100, findings.reduce((total, finding) => total + finding.scoreImpact, 0));
  return { fucked, health: 100 - fucked, method: 'deterministic-v1' };
}

export function audit(target: string): AuditReport {
  const resolvedTarget = resolve(target);
  if (!existsSync(resolvedTarget)) throw new Error(`Target does not exist: ${resolvedTarget}`);
  const config = loadConfig(resolvedTarget);
  const files = sourceFilesIn(resolvedTarget, config);
  const wordpressSources = files.filter((file) => extname(file) === '.php').map((file) => ({ path: relative(resolvedTarget, file) || file, content: readFileSync(file, 'utf8') }));
  const findings = [
    ...files.flatMap((file) => analyzeFile(resolvedTarget, file, config)),
    ...wordpressAjaxFindings(wordpressSources),
    ...dependencyFindings(resolvedTarget, files),
    ...duplicateFindings(resolvedTarget, files)
  ];
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

export function aiResidueFindings(target: string): Finding[] {
  const residueRules = new Set<Finding['ruleId']>(['ai-residue', 'suspicious-filename', 'debug-statements', 'debug-console']);
  return audit(target).findings.filter((finding) => residueRules.has(finding.ruleId));
}

function scriptKind(file: string): ts.ScriptKind {
  switch (extname(file)) {
    case '.ts': return ts.ScriptKind.TS;
    case '.tsx': return ts.ScriptKind.TSX;
    case '.jsx': return ts.ScriptKind.JSX;
    default: return ts.ScriptKind.JS;
  }
}

function debuggerRanges(sourceFile: ts.SourceFile): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isDebuggerStatement(node)) ranges.push({ start: node.getStart(sourceFile), end: node.end });
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
}

/** Apply only parser-confirmed, literal-only JS/TS debug artifacts. No comments, imports, or files are removed. */
export function cleanupDevArtifacts(target: string): CleanupReport {
  const resolvedTarget = resolve(target);
  const files = sourceFilesIn(resolvedTarget).filter((file) => extname(file) !== '.php');
  const changedFiles: CleanupReport['changedFiles'] = [];
  const skippedFiles: CleanupReport['skippedFiles'] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
    const displayPath = relative(resolvedTarget, file);
    const diagnostics = ts.transpileModule(content, { compilerOptions: { target: ts.ScriptTarget.Latest }, fileName: file, reportDiagnostics: true }).diagnostics ?? [];
    if (diagnostics.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
      skippedFiles.push({ file: displayPath, reason: 'Parser diagnostics prevent a safe transformation.' });
      continue;
    }
    const debuggerStatements = debuggerRanges(sourceFile);
    const debugConsole = literalDebugConsoleStatements(file, content);
    const unusedImports = unusedNamedImportRanges(file, content);
    const ranges = [...debuggerStatements, ...debugConsole, ...unusedImports];
    if (!ranges.length) continue;
    let updated = content;
    for (const range of [...ranges].sort((left, right) => right.start - left.start)) updated = `${updated.slice(0, range.start)}${updated.slice(range.end)}`;
    writeFileSync(file, updated, 'utf8');
    changedFiles.push({ file: displayPath, removedDebugStatements: debuggerStatements.length, removedDebugConsoleCalls: debugConsole.length, removedUnusedImports: unusedImports.length });
  }
  return {
    target: resolvedTarget,
    changedFiles,
    skippedFiles,
    removedDebugStatements: changedFiles.reduce((total, file) => total + file.removedDebugStatements, 0),
    removedDebugConsoleCalls: changedFiles.reduce((total, file) => total + file.removedDebugConsoleCalls, 0),
    removedUnusedImports: changedFiles.reduce((total, file) => total + file.removedUnusedImports, 0)
  };
}

/** @deprecated Use cleanupDevArtifacts to include equally safe literal console cleanup. */
export function cleanupDebugStatements(target: string): CleanupReport {
  return cleanupDevArtifacts(target);
}

function localDependencies(target: string, file: string, knownPaths: Set<string>): string[] {
  const content = readFileSync(file, 'utf8');
  const matches = content.matchAll(/(?:import\s+(?:[^'";]+?\s+from\s+)?|require\(|from\s+)["']([^"']+)["']/g);
  const from = relative(target, file);
  const dependencies: string[] = [];
  for (const match of matches) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) continue;
    const base = resolve(file, '..', specifier);
    const extensionlessBase = extname(base) ? base.slice(0, -extname(base).length) : base;
    const candidates = [base, extensionlessBase, ...[...sourceExtensions].map((extension) => `${extensionlessBase}${extension}`), ...[...sourceExtensions].map((extension) => join(base, `index${extension}`)), ...[...sourceExtensions].map((extension) => join(extensionlessBase, `index${extension}`))];
    const found = candidates.find((candidate) => knownPaths.has(relative(target, candidate)));
    if (found) dependencies.push(relative(target, found));
  }
  return [...new Set(dependencies)];
}

function entryPointPaths(target: string, modules: Array<{ path: string }>): Set<string> {
  const entries = new Set<string>();
  const packagePath = join(target, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { main?: string; module?: string; bin?: string | Record<string, string> };
    const declared = [pkg.main, pkg.module, ...(typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {}))].filter((value): value is string => Boolean(value));
    for (const value of declared) {
      const normalized = value.replace(/^\.\//, '').replaceAll('/', '\\');
      const match = modules.find((module) => module.path === normalized || module.path === normalized.replace(/\\dist\\/, '\\src\\').replace(/\.js$/, '.ts'));
      if (match) entries.add(match.path);
    }
  }
  for (const module of modules) {
    if (/(?:^|[\\/])(?:index|main|app|server|cli|plugin)\.(?:[cm]?[jt]sx?|php)$/i.test(module.path)) entries.add(module.path);
  }
  return entries;
}

function dependencyCycles(nodes: string[], dependencies: Array<{ from: string; to: string }>): string[][] {
  const neighbours = new Map(nodes.map((node) => [node, [] as string[]]));
  for (const dependency of dependencies) neighbours.get(dependency.from)?.push(dependency.to);
  const visited = new Set<string>();
  const active: string[] = [];
  const cycles: string[][] = [];
  const known = new Set<string>();
  const visit = (node: string): void => {
    const activeIndex = active.indexOf(node);
    if (activeIndex >= 0) {
      const cycle = [...active.slice(activeIndex), node];
      const key = [...cycle.slice(0, -1)].sort().join('|');
      if (!known.has(key)) { known.add(key); cycles.push(cycle); }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.push(node);
    for (const neighbour of neighbours.get(node) ?? []) visit(neighbour);
    active.pop();
  };
  for (const node of [...nodes].sort()) visit(node);
  return cycles;
}

function markdownArchitecture(report: UnderstandReport): string {
  const stackText = report.stacks.join(', ') || 'unknown';
  const hotspotText = report.hotspots.length ? report.hotspots.map((hotspot) => `- \`${hotspot.path}\` — ${hotspot.reason}`).join('\n') : '- No hotspots above the configured file-size threshold.';
  const entryPoints = report.graph.nodes.filter((node) => node.entryPoint).map((node) => `- \`${node.file}\``).join('\n') || '- No static entry-point candidate found.';
  const cycleText = report.graph.cycles.length ? report.graph.cycles.map((cycle) => `- ${cycle.map((node) => `\`${node}\``).join(' → ')}`).join('\n') : '- No local dependency cycles found.';
  const duplicateText = report.duplicates.length ? report.duplicates.map((group) => `- ${group.occurrences.length} copies: ${group.occurrences.map((occurrence) => `\`${occurrence.file}:${occurrence.startLine}\``).join(', ')}`).join('\n') : '- No exact duplicate blocks found.';
  return `# YCF architecture report\n\nGenerated: ${report.generatedAt}\n\n## Overview\n\n- Stacks: ${stackText}\n- Source files: ${report.sourceFiles}\n- Local dependency edges: ${report.dependencies.length}\n\n## Entry-point candidates\n\n${entryPoints}\n\n## Dependency cycles\n\n${cycleText}\n\n## Duplicate code groups\n\n${duplicateText}\n\n## Hotspots\n\n${hotspotText}\n`;
}

export function understand(target: string): UnderstandReport {
  const resolvedTarget = resolve(target);
  const config = loadConfig(resolvedTarget);
  const files = sourceFilesIn(resolvedTarget, config);
  const knownPaths = new Set(files.map((file) => relative(resolvedTarget, file)));
  const modules = files.map((file) => ({ path: relative(resolvedTarget, file), extension: extname(file), lines: readFileSync(file, 'utf8').split(/\r?\n/).length }));
  const entryPoints = entryPointPaths(resolvedTarget, modules);
  const dependencies = files.flatMap((file) => localDependencies(resolvedTarget, file, knownPaths).map((to) => ({ from: relative(resolvedTarget, file), to })));
  const duplicates = duplicateGroups(resolvedTarget, files);
  const connectionCount = new Map(modules.map((module) => [module.path, 0]));
  for (const dependency of dependencies) {
    connectionCount.set(dependency.from, (connectionCount.get(dependency.from) ?? 0) + 1);
    connectionCount.set(dependency.to, (connectionCount.get(dependency.to) ?? 0) + 1);
  }
  const hotspots = modules.flatMap((module) => {
    const results: Array<{ path: string; lines: number; reason: string }> = [];
    if (module.lines > config.refactor.maxFileLines) results.push({ path: module.path, lines: module.lines, reason: `Exceeds configured ${config.refactor.maxFileLines}-line threshold` });
    const connections = connectionCount.get(module.path) ?? 0;
    if (connections >= 4) results.push({ path: module.path, lines: module.lines, reason: `Connected to ${connections} local modules; changes may have broad impact` });
    return results;
  });
  const risks = audit(resolvedTarget).findings;
  const report: UnderstandReport = {
    version: 1, target: resolvedTarget, generatedAt: new Date().toISOString(), stacks: detectStacks(resolvedTarget), sourceFiles: files.length,
    modules, dependencies, hotspots, duplicates, risks,
    graph: {
      nodes: modules.map((module) => ({ id: module.path, file: module.path, kind: entryPoints.has(module.path) ? 'entry-point' as const : 'module' as const, entryPoint: entryPoints.has(module.path) })),
      edges: dependencies.map((dependency) => ({ from: dependency.from, to: dependency.to, kind: 'import' as const })),
      cycles: dependencyCycles(modules.map((module) => module.path), dependencies)
    }
  };
  const output = join(resolvedTarget, '.ycf');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'architecture.md'), markdownArchitecture(report), 'utf8');
  writeFileSync(join(output, 'dependencies.json'), JSON.stringify(report.dependencies, null, 2), 'utf8');
  writeFileSync(join(output, 'modules.json'), JSON.stringify(report.modules, null, 2), 'utf8');
  writeFileSync(join(output, 'hotspots.json'), JSON.stringify(report.hotspots, null, 2), 'utf8');
  writeFileSync(join(output, 'duplicates.json'), JSON.stringify(report.duplicates, null, 2), 'utf8');
  writeFileSync(join(output, 'risks.json'), JSON.stringify(report.risks, null, 2), 'utf8');
  writeFileSync(join(output, 'graph.json'), JSON.stringify(report.graph, null, 2), 'utf8');
  return report;
}

export function writeAuditReport(target: string, report = audit(target)): { jsonPath: string; markdownPath: string } {
  return persistAuditReport(target, report);
}

/** Produce a reviewable refactor plan. This intentionally never modifies source files. */
export function refactorPlan(target: string): { plan: RefactorPlan; jsonPath: string; markdownPath: string } {
  const auditReport = audit(target);
  const understanding = understand(target);
  const plan = buildRefactorPlan(auditReport, understanding);
  return { plan, ...writeRefactorPlan(target, plan) };
}
