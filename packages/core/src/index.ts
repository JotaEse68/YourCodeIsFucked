import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { ignoredDirectories, loadConfig } from './config.js';
import { findGitRoot } from './git.js';
import { writeAuditReport as persistAuditReport, writeRefactorPlan } from './reporters.js';
import { buildRefactorPlan } from './planner.js';
import { wordpressAjaxFindings, wordpressDataFlowFindings, wordpressDestructiveOperationFindings, wordpressFindings, wordpressPrivilegeEscalationFindings, wordpressRestFindings, wordpressRestPersistenceFindings, wordpressSensitiveExposureFindings } from './wordpress.js';
import { createReleaseReadiness } from './release.js';
import { typescriptFindings } from './typescript.js';
import { impactAnalysis as createImpactAnalysis } from './impact.js';
import { duplicateFindings, duplicateGroups } from './duplicates.js';
export type { ArchitecturalRefactorPlan, RefactorBlock, RefactorExecutionReport, RefactorOperation, RefactorBlockStatus, RiskLevel, SafetyMode, RefactorOperationKind, OperationRecord, RollbackEvent, RollbackStep, VerificationStep } from './refactor-types.js';
export { applyRefactorOperation } from './refactor-operations.js';
export { executeRefactorPlan } from './refactor-executor.js';
export { readCheckpointJournal } from './refactor-checkpoints.js';
export { buildArchitecturalRefactorPlan } from './refactor-planner.js';
export { writeRefactorExecutionReport, architectureDiff } from './reporters.js';
import type { AuditReport, CleanupReport, DuplicateGroup, Finding, ImpactReport, RefactorPlan, Stack, UnderstandReport, YcfConfig } from './types.js';
export type { AuditReport, CleanupReport, DependencyAuditReport, DependencyVulnerability, DuplicateGroup, Finding, FindingRisk, GitCheckpoint, GitState, ImpactReport, RefactorPlan, RefactorRecommendation, ReleaseCheck, ReleaseReport, Stack, UnderstandReport, UnfuckReport, VerificationCheck, VerificationReport, YcfConfig } from './types.js';
export { defaultConfig, loadConfig } from './config.js';
export { createCheckpoint, findGitRoot, latestCheckpoint, rollbackToCheckpoint } from './git.js';
export { verificationPlan, verify } from './verify.js';
export { writeUnfuckReport } from './reporters.js';
export { writeReleaseReport } from './reporters.js';
export { dependencyAudit, dependencyAuditPlan, parseDependencyAudit } from './dependencies.js';
export { writeDependencyAuditReport } from './reporters.js';
export { releaseCheckLabel, releaseCheckedLabel, releaseHeading, releaseReportLabel } from './i18n.js';
export { duplicateGroups } from './duplicates.js';

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

function sensitiveRepositoryFindings(target: string, config: YcfConfig): Finding[] {
  const findings: Finding[] = [];
  const git = findGitRoot(target);
  for (const file of walk(target, new Set([...ignoredDirectories, ...config.ignore]))) {
    const path = relative(target, file) || file;
    const name = basename(file).toLowerCase();
    const secretFile = /^\.env(?:\.(?!example$|sample$|template$)[a-z0-9_-]+)?$/i.test(name)
      || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i.test(name)
      || /\.(?:pem|key|p12|pfx)$/i.test(name)
      || /^(?:credentials|service-account|firebase-adminsdk)[a-z0-9_.-]*\.json$/i.test(name)
      || /^wp-config\.php$/i.test(name);
    const backupFile = /\.(?:sql|sqlite|db|bak|backup)$/i.test(name) || /(?:^|[._-])backup(?:[._-]|$)/i.test(name);
    if (!secretFile && !backupFile) continue;
    const gitPath = git.root ? relative(git.root, file) : path;
    const tracked = git.root ? spawnSync('git', ['-C', git.root, 'ls-files', '--error-unmatch', '--', gitPath], { encoding: 'utf8' }).status === 0 : false;
    const ignored = !tracked && git.root ? spawnSync('git', ['-C', git.root, 'check-ignore', '-q', '--', gitPath], { encoding: 'utf8' }).status === 0 : false;
    if (tracked) findings.push({ id: `sensitive-repository-file-tracked:${path}`, ruleId: 'sensitive-repository-file-tracked', severity: 'medium', risk: 'architectural', file: path, lines: [], evidence: `Sensitive-looking file is tracked by Git: ${path}. YCF did not read its contents. Remove it from the repository history as appropriate, rotate any credentials, and replace it with deployment secrets or a safe example file.`, scoreImpact: 8 });
    else if (ignored) findings.push({ id: `sensitive-repository-file-protected:${path}`, ruleId: 'sensitive-repository-file-protected', severity: 'low', risk: 'report-only', file: path, lines: [], evidence: `Sensitive-looking local file is ignored by Git: ${path}. YCF did not read its contents. Keep the ignore rule and verify the file is not tracked in another branch or release artifact.`, scoreImpact: 0 });
    else findings.push({ id: `sensitive-repository-file:${path}`, ruleId: 'sensitive-repository-file', severity: secretFile ? 'medium' : 'low', risk: 'architectural', file: path, lines: [], evidence: `Sensitive-looking file detected by name: ${path}. YCF did not read its contents, and Git ignore protection was not confirmed. Keep it out of commits and public deployments; use ignored local files or managed deployment secrets instead.`, scoreImpact: secretFile ? 5 : 1 });
  }
  return findings;
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

function reactAsyncEffectsWithoutCleanup(file: string, content: string): number[] {
  if (!['.jsx', '.tsx'].includes(extname(file))) return [];
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, scriptKind(file));
  const lines: number[] = [];
  const hasAsyncWork = (node: ts.Node): boolean => {
    let found = false;
    const visit = (child: ts.Node): void => {
      if (ts.isAwaitExpression(child)) found = true;
      if (ts.isCallExpression(child) && ((ts.isIdentifier(child.expression) && child.expression.text === 'fetch') || (ts.isPropertyAccessExpression(child.expression) && ['then', 'catch', 'finally'].includes(child.expression.name.text)))) found = true;
      ts.forEachChild(child, visit);
    };
    visit(node);
    return found;
  };
  const hasCleanup = (body: ts.ConciseBody): boolean => ts.isBlock(body) && body.statements.some((statement) => ts.isReturnStatement(statement) && !!statement.expression && (ts.isArrowFunction(statement.expression) || ts.isFunctionExpression(statement.expression)));
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect') {
      const callback = node.arguments[0];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && hasAsyncWork(callback.body) && !hasCleanup(callback.body)) lines.push(lineAt(content, node.getStart(sourceFile)));
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
  const asyncEffectsWithoutCleanup = reactAsyncEffectsWithoutCleanup(file, content);
  if (asyncEffectsWithoutCleanup.length > 0) findings.push({
    id: `react-async-effect-without-cleanup:${displayPath}`,
    ruleId: 'react-async-effect-without-cleanup',
    severity: 'low',
    risk: 'report-only',
    file: displayPath,
    lines: asyncEffectsWithoutCleanup,
    evidence: `${asyncEffectsWithoutCleanup.length} useEffect callback(s) contain visible asynchronous work but no returned cleanup function. Review cancellation, subscriptions, and state updates after unmount before changing the effect.`,
    scoreImpact: Math.min(asyncEffectsWithoutCleanup.length * 2, 8)
  });
  findings.push(...typescriptFindings(file, content, displayPath));
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
  return Object.keys(pkg.dependencies ?? {}).filter((dependency) => !imported.has(dependency)).flatMap((dependency) => [{
    id: `unused-production-dependency:${dependency}`,
    ruleId: 'unused-production-dependency' as const,
    severity: 'low' as const,
    risk: 'report-only' as const,
    file: 'package.json',
    lines: [],
    evidence: `Production dependency "${dependency}" has no static import or require in scanned source files. Dynamic/runtime use is possible; review before removal.`,
    scoreImpact: 2
  }, {
    id: `dependency-nobody-uses:${dependency}`,
    ruleId: 'dependency-nobody-uses' as const,
    severity: 'low' as const,
    risk: 'report-only' as const,
    file: 'package.json',
    lines: [],
    evidence: `DependencyNobodyUses candidate: "${dependency}" has no static import or require in scanned source files. Runtime use is possible; verify before removal.`,
    scoreImpact: 0
  }]);
}

function deadCodeFindings(target: string, files: string[]): Finding[] {
  const known = new Set(files.map((file) => relative(target, file)));
  const incoming = new Set<string>();
  for (const file of files) for (const dependency of localDependencies(target, file, known)) incoming.add(dependency);
  const entries = entryPointPaths(target, files.map((file) => ({ path: relative(target, file), extension: extname(file), lines: readFileSync(file, 'utf8').split(/\r?\n/).length })));
  return files.filter((file) => {
    const display = relative(target, file);
    const content = readFileSync(file, 'utf8');
    return !incoming.has(display) && !entries.has(display) && /\b(?:export|module\.exports)\b/.test(content) && !/\b(?:index|main|app|server|cli)\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(display);
  }).map((file) => {
    const display = relative(target, file);
    return { id: `dead-code:${display}`, ruleId: 'dead-code' as const, severity: 'low' as const, risk: 'report-only' as const, file: display, lines: [], evidence: 'DeadCode candidate: this module exports code but no scanned local module imports it. Dynamic loading and framework entry points can make this a false positive; verify before removal.', scoreImpact: 2 };
  });
}

function namedDetectorFindings(target: string, files: string[], config: YcfConfig): Finding[] {
  return files.flatMap((file) => {
    const display = relative(target, file);
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    const findings: Finding[] = [];
    const todoLines = lineNumbers(content, /^\s*(?:\/\/|\/\*|\*|#).*\b(?:TODO|FIXME|HACK|temporary\s+fix)\b/i);
    if (todoLines.length >= 2) findings.push({ id: `todo-from-hell:${display}`, ruleId: 'todo-from-hell', severity: 'low', risk: 'report-only', file: display, lines: todoLines, evidence: `TODOFromHell: ${todoLines.length} unresolved TODO/FIXME/HACK markers. Turn each into an issue, a deadline, or a real fix; comments are not a project-management system.`, scoreImpact: Math.min(todoLines.length, 6) });
    const helperLines = lineNumbers(content, /\b(?:function|const|let|var)\s+(?:processDataThing|doThing|helper|mysteryHelper|handleStuff)\b/i);
    if (helperLines.length) findings.push({ id: `mystery-helper:${display}`, ruleId: 'mystery-helper', severity: 'low', risk: 'report-only', file: display, lines: helperLines, evidence: 'MysteryHelper: a vague helper name hides responsibility. Trace its callers and rename or narrow it only after confirming behavior.', scoreImpact: 2 });
    if (['.tsx', '.jsx'].includes(extname(file))) {
      const imports = (content.match(/^\s*import\s/gm) ?? []).length;
      const component = complexityRegions(content).find((region) => /^[A-Z]/.test(region.name) && /<[A-Za-z][^>]*>/.test(region.body));
      if (component && (component.end - component.start + 1 > Math.max(300, config.refactor.maxFunctionLines * 3) || imports >= 15)) findings.push({ id: `god-component:${display}:${component.name}`, ruleId: 'god-component', severity: 'medium', risk: 'safe-refactor', file: display, lines: [component.start, component.end], evidence: `GodComponent: ${component.name} combines a large React body with ${imports} import(s). Identify cohesive responsibilities before extracting anything.`, scoreImpact: 6 });
    }
    return findings;
  });
}

function dimensionPenalty(findings: Finding[], rules: Set<Finding['ruleId']>): number {
  return Math.min(85, findings.filter((finding) => rules.has(finding.ruleId)).reduce((total, finding) => total + finding.scoreImpact, 0) * 3);
}

function scoreDimensions(target: string, files: string[], findings: Finding[]): AuditReport['score']['dimensions'] {
  const architecture = Math.max(0, 100 - dimensionPenalty(findings, new Set(['large-source-file', 'long-function', 'large-react-component', 'god-component', 'dead-code', 'duplicate-code', 'similar-duplicate-code', 'high-complexity'])));
  const maintainability = Math.max(0, 100 - dimensionPenalty(findings, new Set(['unused-import', 'ai-residue', 'suspicious-filename', 'mystery-helper', 'todo-from-hell', 'dependency-nobody-uses', 'unused-production-dependency', 'duplicate-code', 'similar-duplicate-code', 'high-complexity', 'large-source-file', 'long-function'])));
  const security = Math.max(0, 100 - dimensionPenalty(findings, new Set(['sensitive-repository-file', 'sensitive-repository-file-tracked', 'wordpress-hardcoded-config-secret', 'wordpress-wpdb-unprepared-query', 'wordpress-unsanitized-input', 'wordpress-unescaped-output', 'wordpress-rest-route-permission', 'wordpress-ajax-nonce-review', 'wordpress-ajax-capability-review', 'wordpress-sensitive-data-exposure', 'typescript-error-suppression'])));
  const packagePath = join(target, 'package.json');
  const hasTestScript = existsSync(packagePath) && /"test"\s*:/.test(readFileSync(packagePath, 'utf8'));
  const hasTestFiles = files.some((file) => /(?:^|[._-])(?:test|spec)\.[^.]+$|[\\/]__tests__[\\/]/i.test(file));
  const tests = hasTestScript ? 90 : hasTestFiles ? 65 : 25;
  const hasReadme = existsSync(join(target, 'README.md')) || existsSync(join(target, 'README.es.md'));
  const hasDocs = existsSync(join(target, 'docs')) || existsSync(join(target, 'documentation'));
  const documentation = Math.min(100, (hasReadme ? 65 : 20) + (hasDocs ? 25 : 0) + (files.some((file) => /\.md$/i.test(file)) ? 10 : 0));
  return { architecture, maintainability, security, tests, documentation };
}

export function calculateScore(findings: Finding[], dimensions?: AuditReport['score']['dimensions']): AuditReport['score'] {
  const fucked = Math.min(100, findings.reduce((total, finding) => total + finding.scoreImpact, 0));
  return { fucked, health: 100 - fucked, method: 'deterministic-v1', dimensions: dimensions ?? { architecture: 100, maintainability: 100, security: 100, tests: 0, documentation: 0 } };
}

export function audit(target: string): AuditReport {
  const resolvedTarget = resolve(target);
  if (!existsSync(resolvedTarget)) throw new Error(`Target does not exist: ${resolvedTarget}`);
  const config = loadConfig(resolvedTarget);
  const files = sourceFilesIn(resolvedTarget, config);
  const wordpressSources = files.filter((file) => extname(file) === '.php').map((file) => ({ path: relative(resolvedTarget, file) || file, content: readFileSync(file, 'utf8') }));
  const findings = [
    ...files.flatMap((file) => analyzeFile(resolvedTarget, file, config)),
    ...deadCodeFindings(resolvedTarget, files),
    ...namedDetectorFindings(resolvedTarget, files, config),
    ...sensitiveRepositoryFindings(resolvedTarget, config),
    ...wordpressAjaxFindings(wordpressSources),
    ...wordpressDataFlowFindings(wordpressSources),
    ...wordpressRestFindings(wordpressSources),
    ...wordpressRestPersistenceFindings(wordpressSources),
    ...wordpressDestructiveOperationFindings(wordpressSources),
    ...wordpressPrivilegeEscalationFindings(wordpressSources),
    ...wordpressSensitiveExposureFindings(wordpressSources),
    ...dependencyFindings(resolvedTarget, files),
    ...duplicateFindings(resolvedTarget, files)
  ];
  const score = calculateScore(findings, scoreDimensions(resolvedTarget, files, findings));
  return {
    version: 1,
    target: resolvedTarget,
    auditedAt: new Date().toISOString(),
    readOnly: true,
    stacks: detectStacks(resolvedTarget),
    sourceFiles: files.length,
    git: findGitRoot(resolvedTarget),
    findings,
    score
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

/** Explain the statically visible change surface of one local module. Read-only. */
export function impactAnalysis(target: string, module: string): ImpactReport {
  return createImpactAnalysis(target, module, understand);
}

export function writeAuditReport(target: string, report = audit(target)): { jsonPath: string; markdownPath: string } {
  return persistAuditReport(target, report);
}

/** Produce a reviewable refactor plan. This intentionally never modifies source files. */
export function refactorPlan(target: string, options?: { language?: import('./types.js').Language; audience?: import('./types.js').Audience }): { plan: RefactorPlan; jsonPath: string; markdownPath: string } {
  const auditReport = audit(target);
  const understanding = understand(target);
  const config = loadConfig(target);
  const plan = buildRefactorPlan(auditReport, understanding, options?.language ?? config.language, options?.audience ?? config.audience);
  return { plan, ...writeRefactorPlan(target, plan) };
}
