import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const p = (x) => resolve(root, x);
const read = (x) => readFileSync(p(x), 'utf8');
const write = (x, v) => writeFileSync(p(x), v, 'utf8');

function mustReplace(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing replacement anchor: ${label}`);
  return text.replace(from, to);
}
function replaceRange(text, start, end, replacement, label) {
  const a = text.indexOf(start);
  if (a < 0) throw new Error(`Missing start anchor: ${label}`);
  const b = text.indexOf(end, a);
  if (b < 0) throw new Error(`Missing end anchor: ${label}`);
  return text.slice(0, a) + replacement + text.slice(b);
}

// -----------------------------------------------------------------------------
// Part A — ReferenceRewriter (real TS AST, no regex fallback)
// -----------------------------------------------------------------------------
write('packages/core/src/reference-rewriter.ts', `import { extname } from 'node:path';
import ts from 'typescript';

export interface SpecifierMatch { start: number; end: number; specifier: string; }
export interface ReferenceRewriter {
  canHandle(file: string): boolean;
  findReferences(sourceFile: string, content: string): SpecifierMatch[];
  rewrite(content: string, matches: SpecifierMatch[], newSpecifierFor: (match: SpecifierMatch) => string | undefined): string;
}

const handled = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
function scriptKind(file: string): ts.ScriptKind {
  const ext = extname(file).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  if (ext === '.ts') return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}
function literalMatch(node: ts.StringLiteralLike, source: ts.SourceFile): SpecifierMatch {
  const start = node.getStart(source) + 1;
  return { start, end: node.end - 1, specifier: node.text };
}

export const jsTsReferenceRewriter: ReferenceRewriter = {
  canHandle(file) { return handled.has(extname(file).toLowerCase()); },
  findReferences(sourceFile, content) {
    if (!this.canHandle(sourceFile)) return [];
    const source = ts.createSourceFile(sourceFile, content, ts.ScriptTarget.Latest, true, scriptKind(sourceFile));
    const matches: SpecifierMatch[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        matches.push(literalMatch(node.moduleSpecifier, source));
      } else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
        const requireCall = ts.isIdentifier(node.expression) && node.expression.text === 'require';
        const importCall = node.expression.kind === ts.SyntaxKind.ImportKeyword;
        if (requireCall || importCall) matches.push(literalMatch(node.arguments[0], source));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return matches.sort((a, b) => a.start - b.start);
  },
  rewrite(content, matches, newSpecifierFor) {
    let output = content;
    for (const match of [...matches].sort((a, b) => b.start - a.start)) {
      const replacement = newSpecifierFor(match);
      if (replacement === undefined || replacement === match.specifier) continue;
      output = output.slice(0, match.start) + replacement + output.slice(match.end);
    }
    return output;
  }
};
`);

// -----------------------------------------------------------------------------
// Part C/B — refactor operations: AST rewrite + PHP gating + transaction
// -----------------------------------------------------------------------------
let ops = read('packages/core/src/refactor-operations.ts');
if (!ops.includes("./reference-rewriter.js")) {
  ops = mustReplace(ops, "import { atomicWrite } from './fs-atomic.js';", "import { atomicWrite } from './fs-atomic.js';\nimport { jsTsReferenceRewriter, type SpecifierMatch } from './reference-rewriter.js';", 'reference rewriter import');
}
ops = ops.replace(/^const importSpecifierPattern = .*\n/m, '');

if (ops.includes('function rewriteReferences(root: string')) {
  const replacement = `interface PlannedReferenceWrite { file: string; original: string; updated: string; relativePath: string; }\n\nfunction phpReferenceCandidates(root: string, sourceAbs: string): string[] {\n  const basenameNoExt = sourceAbs.replaceAll('\\\\', '/').split('/').at(-1)?.replace(/\\.php$|\\.[^.]+$/i, '') ?? '';\n  const fileName = sourceAbs.replaceAll('\\\\', '/').split('/').at(-1) ?? '';\n  if (!basenameNoExt) return [];\n  return walk(root).filter((file) => extname(file).toLowerCase() === '.php').filter((file) => {\n    const text = readFileSync(file, 'utf8');\n    return text.includes(fileName) || text.includes(basenameNoExt);\n  });\n}\n\nfunction computeReferenceWrites(root: string, source: string, destination: string, allowSupervised: boolean): PlannedReferenceWrite[] {\n  const sourceAbs = resolve(root, source); const destinationAbs = resolve(root, destination); const configured = aliases(root);\n  if (extname(sourceAbs).toLowerCase() === '.php') throw new Error('BLOCK: PHP files cannot be moved automatically; no verifiable reference rewriter exists for PHP includes/requires yet. Move it manually and update references by hand.');\n  const phpCandidates = phpReferenceCandidates(root, sourceAbs);\n  if (phpCandidates.length && !allowSupervised) throw new Error(\`SUPERVISED: \\${phpCandidates.length} PHP file(s) may reference this module and cannot be automatically verified: \\${phpCandidates.map((file) => relative(root, file).replaceAll('\\\\', '/')).join(', ')}. Review and update them manually, then re-run with explicit supervised approval.\`);\n  const planned: PlannedReferenceWrite[] = [];\n  for (const file of walk(root)) {\n    if (!jsTsReferenceRewriter.canHandle(file)) continue;\n    const original = readFileSync(file, 'utf8');\n    const matches = jsTsReferenceRewriter.findReferences(file, original);\n    if (!matches.length) continue;\n    const updated = jsTsReferenceRewriter.rewrite(original, matches, (match: SpecifierMatch) => {\n      const resolved = resolveImport(file, match.specifier, root, configured);\n      return resolved && sameModule(resolved, sourceAbs) ? relativeSpecifier(file, destinationAbs, match.specifier) : undefined;\n    });\n    if (updated !== original) planned.push({ file, original, updated, relativePath: relative(root, file).replaceAll('\\\\', '/') });\n  }\n  const moved = readFileSync(sourceAbs, 'utf8');\n  if (jsTsReferenceRewriter.canHandle(sourceAbs)) {\n    const matches = jsTsReferenceRewriter.findReferences(sourceAbs, moved);\n    const internal = jsTsReferenceRewriter.rewrite(moved, matches, (match) => {\n      const resolved = resolveImport(sourceAbs, match.specifier, root, configured);\n      if (!resolved) { if (match.specifier.startsWith('.')) throw new Error(\`BLOCK: cannot resolve internal import \\${match.specifier} in \\${source}\`); return undefined; }\n      return relativeSpecifier(destinationAbs, resolved, match.specifier);\n    });\n    if (internal !== moved) planned.push({ file: sourceAbs, original: moved, updated: internal, relativePath: source.replaceAll('\\\\', '/') });\n  }\n  return planned;\n}\n\nfunction restoreWrites(written: Map<string, string>): void {\n  for (const [file, original] of [...written.entries()].reverse()) { try { atomicWrite(file, original); } catch { /* best effort; outer checkpoint still exists */ } }\n}\n\nfunction writeReferenceTransaction(planned: PlannedReferenceWrite[]): { changed: string[]; before: Map<string, string> } {\n  const before = new Map<string, string>(); const changed: string[] = [];\n  try {\n    for (const item of planned) {\n      atomicWrite(item.file, item.updated);\n      before.set(item.file, item.original); changed.push(item.relativePath);\n    }\n    return { changed, before };\n  } catch (error) { restoreWrites(before); throw error; }\n}\n\nfunction rewriteReferences(root: string, source: string, destination: string, allowSupervised: boolean): { changed: string[]; before: Map<string, string> } {\n  return writeReferenceTransaction(computeReferenceWrites(root, source, destination, allowSupervised));\n}\n\n`;
  ops = replaceRange(ops, 'function rewriteReferences(root: string', 'function packageJsonFiles', replacement + 'function packageJsonFiles', 'rewriteReferences');
}

if (ops.includes("if (operation.kind === 'MOVE' || operation.kind === 'RENAME') { const source")) {
  const moveBranch = `if (operation.kind === 'MOVE' || operation.kind === 'RENAME') {\n    const source = resolve(root, operation.source); const destination = resolve(root, operation.destination);\n    if (!existsSync(source)) throw new Error(\`Source does not exist: \\${operation.source}\`);\n    if (existsSync(destination)) throw new Error(\`Destination already exists: \\${operation.destination}\`);\n    if (extname(source).toLowerCase() === '.php') throw new Error('BLOCK: PHP files cannot be moved automatically; no verifiable reference rewriter exists for PHP includes/requires yet. Move it manually and update references by hand.');\n    const contents = new Map(walk(root).map((file) => [file, readFileSync(file, 'utf8')]));\n    const safety = assessRefactorSafety([source], contents);\n    if (safety.mode === 'BLOCKED') throw new Error(\`BLOCK: \\${safety.reason}\`);\n    if (safety.mode === 'SUPERVISED' && !options.allowSupervised) throw new Error(\`SUPERVISED: \\${safety.reason}\`);\n    if (publicEntryPoints(root).has(source)) throw new Error('BLOCKED: this file is a public package entry point (main/module/exports/bin/types); moving it would change a public contract.');\n    if (isReExported(root, operation.source)) throw new Error('BLOCKED: this file is re-exported (export * / export { X } from) elsewhere; moving it would change a public contract.');\n    const planned = operation.updateImports ? computeReferenceWrites(root, operation.source, operation.destination, Boolean(options.allowSupervised)) : [];\n    const ref = writeReferenceTransaction(planned);\n    try {\n      mkdirSync(dirname(destination), { recursive: true }); renameSync(source, destination);\n    } catch (error) { restoreWrites(ref.before); throw error; }\n    return { operationId: id, changedFiles: [...new Set([...ref.changed, operation.source, operation.destination])], description: operation.description, relatedTestFiles: [], undo: () => { if (existsSync(destination)) { mkdirSync(dirname(source), { recursive: true }); renameSync(destination, source); } for (const [file, content] of ref.before) atomicWrite(file, content); } };\n  }\n  `;
  ops = replaceRange(ops, "if (operation.kind === 'MOVE' || operation.kind === 'RENAME')", "if (operation.kind === 'CREATE')", moveBranch + "if (operation.kind === 'CREATE')", 'MOVE/RENAME branch');
}

if (ops.includes("if (operation.kind === 'CONSOLIDATE') {")) {
  const consolidate = `if (operation.kind === 'CONSOLIDATE') {\n    const canonical = resolve(root, operation.canonicalFile); const duplicate = resolve(root, operation.duplicateFile);\n    if (extname(duplicate).toLowerCase() === '.php' || extname(canonical).toLowerCase() === '.php') throw new Error('BLOCK: PHP files cannot be consolidated automatically; no verifiable PHP reference rewriter exists yet.');\n    const canonicalText = readFileSync(canonical, 'utf8'); const duplicateText = readFileSync(duplicate, 'utf8');\n    const safety = assessRefactorSafety([canonical, duplicate], new Map([[canonical, canonicalText], [duplicate, duplicateText]]));\n    if (safety.mode === 'BLOCKED') throw new Error(\`BLOCK: \\${safety.reason}\`);\n    if (safety.mode === 'SUPERVISED' && !options.allowSupervised) throw new Error(\`SUPERVISED: \\${safety.reason}\`);\n    const publicEntries = publicEntryPoints(root);\n    if (publicEntries.has(canonical) || publicEntries.has(duplicate)) throw new Error('BLOCKED: one of these files is a public package entry point (main/exports/bin/types); consolidating would change a public contract.');\n    if (isReExported(root, operation.duplicateFile)) throw new Error('BLOCKED: the duplicate file is re-exported (export * / export { X } from) elsewhere; consolidating would change a public contract.');\n    if (canonicalText.replace(/\\s/g, '') !== duplicateText.replace(/\\s/g, '')) throw new Error('SUPERVISED: files are not exact duplicates.');\n    const planned = computeReferenceWrites(root, operation.duplicateFile, operation.canonicalFile, Boolean(options.allowSupervised));\n    const ref = writeReferenceTransaction(planned);\n    try { unlinkSync(duplicate); } catch (error) { restoreWrites(ref.before); throw error; }\n    return { operationId: id, changedFiles: [...ref.changed, operation.duplicateFile], description: operation.description, relatedTestFiles: [], undo: () => { atomicWrite(duplicate, duplicateText); for (const [file, content] of ref.before) atomicWrite(file, content); } };\n  }\n  `;
  ops = replaceRange(ops, "if (operation.kind === 'CONSOLIDATE')", "throw new Error(`Unsupported operation:", consolidate + "throw new Error(`Unsupported operation:", 'CONSOLIDATE branch');
}
write('packages/core/src/refactor-operations.ts', ops);

// -----------------------------------------------------------------------------
// Part D/F — types, executor runId, archived rollback
// -----------------------------------------------------------------------------
let types = read('packages/core/src/refactor-types.ts');
if (!types.includes('runId?: string;')) {
  types = types.replace("version: 2; target: string; startedAt: string; completedAt: string; status:", "version: 2; runId?: string; target: string; startedAt: string; completedAt: string; status:");
}
write('packages/core/src/refactor-types.ts', types);

let executor = read('packages/core/src/refactor-executor.ts');
if (!executor.includes('runId: checkpoints?.journal.runId')) {
  executor = executor.replace("return { version: 2, target: root, startedAt,", "return { version: 2, runId: checkpoints?.journal.runId, target: root, startedAt,");
}
write('packages/core/src/refactor-executor.ts', executor);

let cps = read('packages/core/src/refactor-checkpoints.ts');
cps = cps.replace("import { existsSync, mkdirSync, readFileSync } from 'node:fs';", "import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';");
if (!cps.includes('readArchivedCheckpointJournal')) {
  cps += `\nexport function readArchivedCheckpointJournal(target: string, runId: string): PersistentCheckpointJournal | undefined {\n  const path = join(resolve(target), '.ycf', 'refactor-checkpoints', \\`\\${runId}.json\\`);\n  if (!existsSync(path)) return undefined;\n  try { const journal = JSON.parse(readFileSync(path, 'utf8')) as PersistentCheckpointJournal; return journal.runId === runId ? journal : undefined; } catch { return undefined; }\n}\n\nexport function archivedCheckpointJournals(target: string): PersistentCheckpointJournal[] {\n  const directory = join(resolve(target), '.ycf', 'refactor-checkpoints');\n  if (!existsSync(directory)) return [];\n  return readdirSync(directory).filter((name) => name.endsWith('.json')).flatMap((name) => {\n    try { return [JSON.parse(readFileSync(join(directory, name), 'utf8')) as PersistentCheckpointJournal]; } catch { return []; }\n  });\n}\n\nexport function findArchivedBlock(target: string, runId: string, blockId: string): PersistentBlockCheckpoint | undefined {\n  return readArchivedCheckpointJournal(target, runId)?.blocks.find((block) => block.blockId === blockId);\n}\n\nexport function findBlockByIdAcrossRuns(target: string, blockId: string): { runId: string; block: PersistentBlockCheckpoint } | undefined {\n  const matches = archivedCheckpointJournals(target).flatMap((journal) => { const block = journal.blocks.find((entry) => entry.blockId === blockId); return block ? [{ runId: journal.runId, block }] : []; });\n  const unique = new Map(matches.map((match) => [match.runId, match]));\n  return unique.size === 1 ? [...unique.values()][0] : undefined;\n}\n`;
}
// Replace markBlockRolledBack with run-qualified implementation.
if (cps.includes('export function markBlockRolledBack(target: string, blockId: string): void')) {
  cps = replaceRange(cps, 'export function markBlockRolledBack(target: string, blockId: string): void {', '\nexport function readArchivedCheckpointJournal', `export function markBlockRolledBack(target: string, blockId: string, runId?: string): void {\n  const current = readCheckpointJournal(target);\n  const journal = runId && current?.runId !== runId ? readArchivedCheckpointJournal(target, runId) : current;\n  if (!journal) return;\n  const block = journal.blocks.find((entry) => entry.blockId === blockId); if (!block) return;\n  const now = new Date().toISOString(); block.status = 'ROLLED_BACK'; block.updatedAt = now; journal.updatedAt = now;\n  const root = resolve(target); const output = join(root, '.ycf'); const archive = join(output, 'refactor-checkpoints'); const currentPath = join(output, 'refactor-checkpoints.json'); const path = join(archive, \\`\\${journal.runId}.json\\`);\n  const serialized = \\`\\${JSON.stringify(journal, null, 2)}\\n\\`; atomicWrite(path, serialized);\n  if (!runId || current?.runId === journal.runId) atomicWrite(currentPath, serialized);\n}\n\nexport function readArchivedCheckpointJournal`, 'markBlockRolledBack');
}
write('packages/core/src/refactor-checkpoints.ts', cps);

write('packages/core/src/recover.ts', `import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { archivedCheckpointJournals, findArchivedBlock, findBlockByIdAcrossRuns, markBlockRolledBack, readArchivedCheckpointJournal, readCheckpointJournal, type PersistentBlockCheckpoint, type PersistentCheckpointJournal } from './refactor-checkpoints.js';
import { findGitRoot, rollbackToCheckpoint } from './git.js';
import { atomicWrite } from './fs-atomic.js';

export interface RecoverReport { target: string; journal?: PersistentCheckpointJournal; }
export function recover(target: string): RecoverReport { return { target, journal: readCheckpointJournal(target) }; }
export type RestoreResult = { restored: true; runId: string; blockId: string; commit: string } | { restored: false; reason: string };

function selectBlock(target: string, runId: string | undefined, blockId: string): { runId: string; block: PersistentBlockCheckpoint } | { error: string } {
  const current = readCheckpointJournal(target);
  if (runId) {
    if (current?.runId === runId) { const block = current.blocks.find((entry) => entry.blockId === blockId); if (block) return { runId, block }; }
    const block = findArchivedBlock(target, runId, blockId);
    return block ? { runId, block } : { error: \\`No block "\\${blockId}" in run "\\${runId}".\\` };
  }
  const currentBlock = current?.blocks.find((entry) => entry.blockId === blockId);
  if (current && currentBlock) return { runId: current.runId, block: currentBlock };
  const candidates = archivedCheckpointJournals(target).flatMap((journal) => { const block = journal.blocks.find((entry) => entry.blockId === blockId); return block ? [{ runId: journal.runId, block }] : []; });
  const unique = new Map(candidates.map((item) => [item.runId, item]));
  if (unique.size === 1) return [...unique.values()][0];
  if (unique.size > 1) return { error: \\`Ambiguous: \\${blockId} exists in \\${unique.size} archived runs (\\${[...unique.keys()].join(', ')}). Use runId + blockId; YCF will not guess.\\` };
  const fallback = findBlockByIdAcrossRuns(target, blockId);
  return fallback ?? { error: \\`No block "\\${blockId}" in the current or archived checkpoint journals.\\` };
}
function safePath(root: string, file: string): string {
  const absolute = resolve(root, file); if (absolute !== root && !absolute.startsWith(root + sep)) throw new Error(\\`Unsafe checkpoint path: \\${file}\\`); return absolute;
}
function restoreChangedFiles(target: string, commit: string, changedFiles: string[]): void {
  const gitState = findGitRoot(target); if (!gitState.detected || !gitState.root) throw new Error('This operation requires a Git repository.');
  const gitRoot = gitState.root; const targetRoot = resolve(target);
  for (const file of changedFiles) {
    const absolute = safePath(targetRoot, file); const repoPath = relative(gitRoot, absolute).replaceAll('\\\\', '/');
    try {
      const content = execFileSync('git', ['-C', gitRoot, 'show', \\`\\${commit}:\\${repoPath}\\`], { encoding: 'utf8' });
      mkdirSync(dirname(absolute), { recursive: true }); atomicWrite(absolute, content);
    } catch {
      if (existsSync(absolute)) unlinkSync(absolute);
    }
  }
}
export function rollbackExecution(target: string, runId: string | undefined, blockId: string): RestoreResult {
  const selected = selectBlock(target, runId, blockId); if ('error' in selected) return { restored: false, reason: selected.error };
  const { block } = selected; if (!block.commit || !block.ref) return { restored: false, reason: \\`Block "\\${blockId}" has no recorded checkpoint ref to restore to.\\` };
  try {
    if (block.changedFiles.length) restoreChangedFiles(target, block.commit, block.changedFiles);
    else rollbackToCheckpoint(target, { ref: block.ref, commit: block.commit, createdAt: block.startedAt ?? block.updatedAt });
  } catch (error) { return { restored: false, reason: error instanceof Error ? error.message : String(error) }; }
  markBlockRolledBack(target, blockId, selected.runId);
  return { restored: true, runId: selected.runId, blockId, commit: block.commit };
}
export function restoreBlock(target: string, blockId: string): RestoreResult { return rollbackExecution(target, undefined, blockId); }
`);

// -----------------------------------------------------------------------------
// Part E — reorganization becomes executor wrapper, old apply path gone
// -----------------------------------------------------------------------------
write('packages/core/src/reorganization.ts', `import { resolve } from 'node:path';
import { executeRefactorPlan } from './refactor-executor.js';
import type { ArchitecturalRefactorPlan, RefactorBlock } from './refactor-types.js';

export type ReorganizationExecutionResult =
  | { status: 'applied'; runId?: string; changedFiles: string[] }
  | { status: 'rolled_back'; error: string }
  | { status: 'blocked'; error: string };
export function reorganizationPlanForBlock(target: string, block: RefactorBlock): ArchitecturalRefactorPlan {
  return { version: 2, target: resolve(target), generatedAt: new Date().toISOString(), blocks: [{ ...block, dependencies: [], validation: [], status: 'PLANNED' }], summary: { auto: block.mode === 'SAFE' ? 1 : 0, safeRefactor: 0, supervised: block.mode === 'SUPERVISED' ? 1 : 0, architectural: 0, blocked: block.mode === 'BLOCKED' ? 1 : 0 }, sourceFindings: [] };
}
export function executeReorganizationBlock(target: string, block: RefactorBlock): ReorganizationExecutionResult {
  const report = executeRefactorPlan(target, reorganizationPlanForBlock(target, block), { allowSupervised: true, fullVerify: false });
  const executed = report.blocks[0];
  if (report.keptBlocks.includes(block.id)) return { status: 'applied', runId: report.runId, changedFiles: executed.result?.changedFiles ?? [] };
  const error = executed.result?.error ?? 'Refactor block did not verify.';
  return report.rolledBackBlocks.includes(block.id) ? { status: 'rolled_back', error } : { status: 'blocked', error };
}
`);

// -----------------------------------------------------------------------------
// Core barrel exports
// -----------------------------------------------------------------------------
let index = read('packages/core/src/index.ts');
index = index.replace("export { applyReorganizationMove, type ReorganizationMoveResult } from './reorganization.js';", "export { executeReorganizationBlock, reorganizationPlanForBlock, type ReorganizationExecutionResult } from './reorganization.js';");
index = index.replace("export { readCheckpointJournal } from './refactor-checkpoints.js';", "export { readCheckpointJournal, readArchivedCheckpointJournal, findArchivedBlock, findBlockByIdAcrossRuns } from './refactor-checkpoints.js';");
index = index.replace("export { recover, restoreBlock } from './recover.js';", "export { recover, restoreBlock, rollbackExecution } from './recover.js';");
if (!index.includes("from './reference-rewriter.js'")) index = index.replace("export { applyRefactorOperation } from './refactor-operations.js';", "export { applyRefactorOperation } from './refactor-operations.js';\nexport { jsTsReferenceRewriter } from './reference-rewriter.js';\nexport type { ReferenceRewriter, SpecifierMatch } from './reference-rewriter.js';");
write('packages/core/src/index.ts', index);

// -----------------------------------------------------------------------------
// Part D — CLI move -> one-block plan -> executeRefactorPlan; recover qualified API
// -----------------------------------------------------------------------------
let cli = read('packages/cli/src/index.ts');
cli = cli.replace('restoreBlock, rollbackToCheckpoint', 'rollbackExecution, rollbackToCheckpoint');
if (!cli.includes("import type { ArchitecturalRefactorPlan }")) {
  const packageImportEnd = cli.indexOf(" from '@jotaese68/core';");
  if (packageImportEnd < 0) throw new Error('CLI core import not found');
  const lineEnd = cli.indexOf('\n', packageImportEnd);
  cli = cli.slice(0, lineEnd + 1) + "import type { ArchitecturalRefactorPlan } from '@jotaese68/core';\n" + cli.slice(lineEnd + 1);
}
if (cli.includes('function relativeImport(')) {
  cli = replaceRange(cli, 'function relativeImport(', "program.command('move <source>", "program.command('move <source>", 'old CLI regex rewriter');
}
if (cli.includes("program.command('move <source> <destination> [target]')")) {
  const newMove = `program.command('move <source> <destination> [target]').description('Move one module through the unified refactor executor.').option('--dry-run', 'Show the planned move without changing files.').option('--yes', 'Approve the move after reviewing the plan.').action((source, destination, target = '.', options) => {\n  const report = understand(target); const sourcePath = resolve(report.target, source); const destinationPath = resolve(report.target, destination);\n  if (!existsSync(sourcePath)) throw new Error(\`Source module does not exist: \\${source}\`); if (existsSync(destinationPath)) throw new Error(\`Destination already exists: \\${destination}\`);\n  console.log(\`Planned structural move: \\${source} → \\${destination}\`); console.log('YCF will use Plan → Safety → Checkpoint → Executor → Verify → Keep/Rollback.');\n  if (options.dryRun || !options.yes) { console.log('No files changed. Re-run with --yes after reviewing the plan.'); return; }\n  const blockId = 'CLI-MOVE';\n  const plan: ArchitecturalRefactorPlan = { version: 2, target: report.target, generatedAt: new Date().toISOString(), blocks: [{ id: blockId, type: 'MOVE', goal: \\`Move \\${source} to \\${destination}\\`, reason: 'Explicit ycf move request', risk: 'LOW', confidence: 99, mode: 'SAFE', evidence: [], confidenceTier: 'CONFIRMED', files: [source, destination], dependencies: [], affectedModules: [], preconditions: [], operations: [{ id: 'CLI-MOVE-OP', kind: 'MOVE', description: \\`Move \\${source} to \\${destination}\\`, source, destination, updateImports: true }], validation: [], rollback: [{ kind: 'git-checkpoint', description: 'Restore this block checkpoint.' }], status: 'PLANNED' }], summary: { auto: 1, safeRefactor: 0, supervised: 0, architectural: 0, blocked: 0 }, sourceFindings: [] };\n  const execution = executeRefactorPlan(target, plan, { fullVerify: true }); const block = execution.blocks[0];\n  if (execution.keptBlocks.includes(blockId)) { console.log(\`Move complete. Changed \\${block.result?.changedFiles.length ?? 0} file(s). Run: \\${execution.runId ?? 'no-git-checkpoint'}\`); console.log(gitDiffSummary(target)); return; }\n  console.error(block.result?.error ?? 'Move was not applied.'); process.exitCode = 1;\n});\n\n`;
  cli = replaceRange(cli, "program.command('move <source> <destination> [target]')", "program.command('ai-residue", newMove + "program.command('ai-residue", 'CLI move command');
}
cli = cli.replace(/restoreBlock\(target,\s*options\.restore\)/g, 'rollbackExecution(target, undefined, options.restore)');
cli = cli.replace(/restoreBlock\(target,\s*String\(options\.restore\)\)/g, 'rollbackExecution(target, undefined, String(options.restore))');
cli = cli.replace(/renameSync,\s*/g, '');
write('packages/cli/src/index.ts', cli);

// -----------------------------------------------------------------------------
// Cockpit: executeRefactorPlan + persistent runId/blockId rollback
// -----------------------------------------------------------------------------
let cockpit = read('packages/core/src/cockpit.ts');
cockpit = cockpit.replace("import { applyReorganizationMove } from './reorganization.js';", "import { executeReorganizationBlock } from './reorganization.js';\nimport { rollbackExecution } from './recover.js';\nimport { findGitRoot } from './git.js';");
cockpit = cockpit.replace("const appliedMoves = new Map<string, Extract<ReturnType<typeof applyReorganizationMove>, { status: 'applied' }>>();", "const appliedMoves = new Map<string, { runId: string; changedFiles: string[] }>();");
cockpit = cockpit.replace("// Per-server-instance only, by design -- see docs/superpowers/specs/2026-08-19-ai-residue-and-cockpit-reorg-design.md.\n  // Undo/Keep only work while this exact process is still running; restarting Cockpit loses\n  // this map, but every applied change is already sitting uncommitted in the working tree,\n  // recoverable with plain git like any other YCF change.\n", "// The in-memory map is only UI state. Durable rollback identity is runId + blockId in\n  // .ycf/refactor-checkpoints; the server never relies on in-memory undo closures.\n");
cockpit = cockpit.replace("res.end(JSON.stringify({ plan, applied: [...appliedMoves.keys()], kept: [...keptMoves] }));", "res.end(JSON.stringify({ plan, applied: [...appliedMoves.keys()], appliedRuns: Object.fromEntries([...appliedMoves.entries()].map(([id, value]) => [id, value.runId])), kept: [...keptMoves] }));");

const oldApply = `      const result = applyReorganizationMove(target, block);\n      if (result.status === 'rolled_back') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'rolled_back', error: result.error })); return; }\n      appliedMoves.set(blockId, result);\n      res.writeHead(200, { 'Content-Type': 'application/json' });\n      res.end(JSON.stringify({ status: 'applied', changedFiles: result.changedFiles }));`;
const newApply = `      if (!findGitRoot(target).detected) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Cockpit refactors require Git so every applied block has a persistent checkpoint.' })); return; }\n      const result = executeReorganizationBlock(target, block);\n      if (result.status === 'rolled_back') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'rolled_back', error: result.error })); return; }\n      if (result.status === 'blocked') { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: result.error })); return; }\n      if (!result.runId) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Refactor verified but no persistent runId was created; refusing an undo-less Cockpit state.' })); return; }\n      appliedMoves.set(blockId, { runId: result.runId, changedFiles: result.changedFiles });\n      res.writeHead(200, { 'Content-Type': 'application/json' });\n      res.end(JSON.stringify({ status: 'applied', runId: result.runId, changedFiles: result.changedFiles }));`;
if (cockpit.includes(oldApply)) cockpit = cockpit.replace(oldApply, newApply); else if (cockpit.includes('applyReorganizationMove(target, block)')) throw new Error('Unexpected cockpit apply shape');

const undoStart = "      const blockId = String(body.blockId ?? '');\n      const applied = appliedMoves.get(blockId);";
if (cockpit.includes(undoStart)) {
  const undoReplacement = `      const blockId = String(body.blockId ?? '');\n      const applied = appliedMoves.get(blockId);\n      const runId = String(body.runId ?? applied?.runId ?? '');`;
  cockpit = cockpit.replace(undoStart, undoReplacement);
  cockpit = cockpit.replace("if (!applied || keptMoves.has(blockId)) {", "if ((!applied && !runId) || keptMoves.has(blockId)) {");
  const oldUndo = `      try { for (const operation of [...applied.applied].reverse()) operation.undo(); }\n      catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); return; }\n      appliedMoves.delete(blockId);`;
  const newUndo = `      const restored = rollbackExecution(target, runId || undefined, blockId);\n      if (!restored.restored) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: restored.reason })); return; }\n      appliedMoves.delete(blockId);`;
  if (!cockpit.includes(oldUndo)) throw new Error('Cockpit undo body anchor missing');
  cockpit = cockpit.replace(oldUndo, newUndo);
}
// Browser preserves runId and sends it back for undo.
cockpit = cockpit.replace("async function loadReorganizePanel(){", "const reorganizeRuns={};async function loadReorganizePanel(){");
cockpit = cockpit.replace("const data=await response.json();renderReorganizeRows(data.plan.blocks,new Set(data.applied),new Set(data.kept))", "const data=await response.json();Object.assign(reorganizeRuns,data.appliedRuns||{});renderReorganizeRows(data.plan.blocks,new Set(data.applied),new Set(data.kept))");
cockpit = cockpit.replace("body:JSON.stringify({blockId:block.id})", "body:JSON.stringify(Object.assign({blockId:block.id},url.includes('/undo/move')?{runId:reorganizeRuns[block.id]}:{}))");
cockpit = cockpit.replace("const failed=result.status==='rolled_back'||(!response.ok&&result.error);", "const failed=result.status==='rolled_back'||(!response.ok&&result.error);if(result.runId)reorganizeRuns[block.id]=result.runId;");
write('packages/core/src/cockpit.ts', cockpit);

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------
write('packages/core/src/reference-rewriter.test.ts', `import { describe, expect, it } from 'vitest';
import { jsTsReferenceRewriter } from './reference-rewriter.js';

describe('jsTsReferenceRewriter', () => {
  it('finds only real AST module references, not comments or unrelated strings', () => {
    const content = [
      "import x from './x';",
      "export * from './x';",
      "const a = require('./x');",
      "const b = import('./x');",
      "// from './x'",
      "const note = \"see also from './x'\";"
    ].join('\\n');
    const matches = jsTsReferenceRewriter.findReferences('fixture.ts', content);
    expect(matches.map((m) => m.specifier)).toEqual(['./x', './x', './x', './x']);
  });
  it('rewrites exact AST ranges and leaves undefined replacements untouched', () => {
    const content = "import a from './a';\\nimport b from './b';\\n";
    const matches = jsTsReferenceRewriter.findReferences('fixture.ts', content);
    const result = jsTsReferenceRewriter.rewrite(content, matches, (m) => m.specifier === './a' ? '../a' : undefined);
    expect(result).toBe("import a from '../a';\\nimport b from './b';\\n");
  });
});
`);

write('packages/core/src/p0b-regression.test.ts', `import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({ failAt: Number.POSITIVE_INFINITY, calls: 0 }));
vi.mock('./fs-atomic.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fs-atomic.js')>();
  return { ...actual, atomicWrite(file: string, content: string) { fault.calls += 1; if (fault.calls === fault.failAt) throw new Error('injected atomic write failure'); return actual.atomicWrite(file, content); } };
});
import { applyRefactorOperation } from './refactor-operations.js';

function fixture() { const target = mkdtempSync(join(tmpdir(), 'ycf-p0b-')); mkdirSync(join(target, 'src'), { recursive: true }); return target; }
describe('P0b transactional reference rewriting and PHP gate', () => {
  it('restores the first rewritten importer when a later write fails', () => {
    const target = fixture();
    writeFileSync(join(target, 'src/moved.ts'), 'export const value = 1;\\n');
    writeFileSync(join(target, 'src/a.ts'), "import { value } from './moved';\\nconsole.log(value);\\n");
    writeFileSync(join(target, 'src/b.ts'), "import { value } from './moved';\\nconsole.log(value);\\n");
    const beforeA = readFileSync(join(target, 'src/a.ts'), 'utf8'); const beforeB = readFileSync(join(target, 'src/b.ts'), 'utf8');
    fault.calls = 0; fault.failAt = 2;
    expect(() => applyRefactorOperation(target, { id: 'm', kind: 'MOVE', description: 'move', source: 'src/moved.ts', destination: 'feature/moved.ts', updateImports: true })).toThrow(/injected atomic write failure/);
    fault.failAt = Number.POSITIVE_INFINITY;
    expect(readFileSync(join(target, 'src/a.ts'), 'utf8')).toBe(beforeA); expect(readFileSync(join(target, 'src/b.ts'), 'utf8')).toBe(beforeB);
    expect(existsSync(join(target, 'src/moved.ts'))).toBe(true); expect(existsSync(join(target, 'feature/moved.ts'))).toBe(false);
  });
  it('blocks PHP source moves before writing anything', () => {
    const target = fixture(); writeFileSync(join(target, 'src/plugin.php'), '<?php require "other.php";'); const before = readFileSync(join(target, 'src/plugin.php'), 'utf8');
    expect(() => applyRefactorOperation(target, { id: 'p', kind: 'MOVE', description: 'move php', source: 'src/plugin.php', destination: 'feature/plugin.php', updateImports: true })).toThrow(/PHP files cannot be moved automatically/);
    expect(readFileSync(join(target, 'src/plugin.php'), 'utf8')).toBe(before); expect(existsSync(join(target, 'feature/plugin.php'))).toBe(false);
  });
  it('supervises possible PHP references and never rewrites PHP', () => {
    const target = fixture(); writeFileSync(join(target, 'src/moved.ts'), 'export const value = 1;\\n'); writeFileSync(join(target, 'src/use.ts'), "import { value } from './moved';\\n"); writeFileSync(join(target, 'src/use.php'), '<?php // moved is loaded by integration glue');
    const php = readFileSync(join(target, 'src/use.php'), 'utf8');
    expect(() => applyRefactorOperation(target, { id: 'p2', kind: 'MOVE', description: 'move', source: 'src/moved.ts', destination: 'feature/moved.ts', updateImports: true })).toThrow(/SUPERVISED/);
    const applied = applyRefactorOperation(target, { id: 'p3', kind: 'MOVE', description: 'move', source: 'src/moved.ts', destination: 'feature/moved.ts', updateImports: true }, { allowSupervised: true });
    expect(readFileSync(join(target, 'src/use.php'), 'utf8')).toBe(php); expect(readFileSync(join(target, 'src/use.ts'), 'utf8')).toContain('../feature/moved'); applied.undo();
  });
  it('has no old regex writer or direct cockpit/CLI refactor writer', () => {
    const here = dirname(fileURLToPath(import.meta.url)); const core = readFileSync(resolve(here, 'refactor-operations.ts'), 'utf8'); const cli = readFileSync(resolve(here, '../../cli/src/index.ts'), 'utf8'); const cockpit = readFileSync(resolve(here, 'cockpit.ts'), 'utf8'); const reorg = readFileSync(resolve(here, 'reorganization.ts'), 'utf8');
    expect(core).not.toContain('importSpecifierPattern'); expect(cli).not.toContain('rewriteImportsForMove'); expect(cli).not.toContain('function relativeImport'); expect(cockpit).not.toContain('applyRefactorOperation('); expect(reorg).not.toContain('applyRefactorOperation('); expect(cockpit).not.toContain('applyReorganizationMove'); expect(reorg).not.toContain('applyReorganizationMove');
    expect(cli).toContain('executeRefactorPlan('); expect(reorg).toContain('executeRefactorPlan(');
  });
});
`);

write('packages/core/src/rollback-execution.test.ts', `import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { beginCheckpointJournal, updateBlockCheckpoint } from './refactor-checkpoints.js';
import { rollbackExecution } from './recover.js';
function init(target: string) { execFileSync('git', ['-C', target, 'init', '-q']); execFileSync('git', ['-C', target, 'config', 'user.email', 'test@example.com']); execFileSync('git', ['-C', target, 'config', 'user.name', 'Test']); execFileSync('git', ['-C', target, 'add', '-A']); execFileSync('git', ['-C', target, 'commit', '-q', '--allow-empty', '-m', 'init']); }

describe('rollbackExecution persistent archived runs', () => {
  it('restores an archived block by exact runId + blockId after a later run becomes current', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-rollback-')); mkdirSync(join(target, 'src')); writeFileSync(join(target, 'src/a.ts'), 'old\\n'); init(target);
    const first = beginCheckpointJournal(target, ['A']); if (!first) throw new Error('checkpoint expected'); updateBlockCheckpoint(first, 'A', 'RUNNING'); writeFileSync(join(target, 'src/a.ts'), 'new\\n'); updateBlockCheckpoint(first, 'A', 'VERIFIED', { changedFiles: ['src/a.ts'], operationIds: ['op'] });
    const runId = first.journal.runId; const second = beginCheckpointJournal(target, ['B']); if (!second) throw new Error('second checkpoint expected'); updateBlockCheckpoint(second, 'B', 'RUNNING');
    const result = rollbackExecution(target, runId, 'A'); expect(result.restored).toBe(true); expect(readFileSync(join(target, 'src/a.ts'), 'utf8')).toBe('old\\n');
  });
  it('never guesses when blockId exists in multiple archived runs', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-rollback-')); init(target);
    const r1 = beginCheckpointJournal(target, ['DUP']); if (!r1) throw new Error(); updateBlockCheckpoint(r1, 'DUP', 'RUNNING'); updateBlockCheckpoint(r1, 'DUP', 'VERIFIED');
    const r2 = beginCheckpointJournal(target, ['DUP']); if (!r2) throw new Error(); updateBlockCheckpoint(r2, 'DUP', 'RUNNING'); updateBlockCheckpoint(r2, 'DUP', 'VERIFIED');
    const r3 = beginCheckpointJournal(target, ['OTHER']); if (!r3) throw new Error(); updateBlockCheckpoint(r3, 'OTHER', 'RUNNING');
    const result = rollbackExecution(target, undefined, 'DUP'); expect(result.restored).toBe(false); if (result.restored) throw new Error(); expect(result.reason).toMatch(/Ambiguous/); expect(result.reason).toContain(r1.journal.runId); expect(result.reason).toContain(r2.journal.runId);
  });
});
`);

write('packages/core/src/reorganization.test.ts', `import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeReorganizationBlock } from './reorganization.js';
import { rollbackExecution } from './recover.js';
import type { RefactorBlock } from './refactor-types.js';
function init(target: string) { execFileSync('git', ['-C', target, 'init', '-q']); execFileSync('git', ['-C', target, 'config', 'user.email', 'test@example.com']); execFileSync('git', ['-C', target, 'config', 'user.name', 'Test']); execFileSync('git', ['-C', target, 'add', '-A']); execFileSync('git', ['-C', target, 'commit', '-q', '--allow-empty', '-m', 'init']); }
const block = (id: string): RefactorBlock => ({ id, type: 'MOVE', goal: 'reorganize', reason: 'approved', risk: 'MEDIUM', confidence: 90, evidence: [], confidenceTier: 'CONFIRMED', mode: 'SUPERVISED', files: ['legacy/a.ts'], dependencies: [], affectedModules: [], preconditions: [], operations: [{ id: id + '-op', kind: 'MOVE', description: 'move', source: 'legacy/a.ts', destination: 'features/a.ts', updateImports: true }], validation: [], rollback: [], status: 'PLANNED' });
describe('executeReorganizationBlock', () => {
  it('uses executeRefactorPlan, exposes runId, and persistent rollback restores it', () => { const target = mkdtempSync(join(tmpdir(), 'ycf-reorg-')); mkdirSync(join(target, 'legacy')); writeFileSync(join(target, 'legacy/a.ts'), 'export const a = 1;\\n'); init(target); const result = executeReorganizationBlock(target, block('R1')); expect(result.status).toBe('applied'); if (result.status !== 'applied' || !result.runId) throw new Error('runId expected'); expect(existsSync(join(target, 'features/a.ts'))).toBe(true); const restored = rollbackExecution(target, result.runId, 'R1'); expect(restored.restored).toBe(true); expect(existsSync(join(target, 'legacy/a.ts'))).toBe(true); expect(existsSync(join(target, 'features/a.ts'))).toBe(false); });
});
`);

// Patch cockpit fixture helper to initialize git once plans are written; make init idempotent.
let cockpitTest = read('packages/core/src/cockpit.test.ts');
cockpitTest = cockpitTest.replace("function initGitRepo(target: string) {\n  execFileSync('git', ['-C', target, 'init', '-q']);", "function initGitRepo(target: string) {\n  if (!existsSync(join(target, '.git'))) execFileSync('git', ['-C', target, 'init', '-q']);");
cockpitTest = cockpitTest.replace("execFileSync('git', ['-C', target, 'commit', '-q', '-m', 'init']);", "execFileSync('git', ['-C', target, 'commit', '-q', '--allow-empty', '-m', 'init']);");
// Automatically create checkpoint-capable fixture after writing the one-move plan.
const helperEnd = "  }));\n}\n\nfunction writeDeleteOnlyReorgPlan";
if (cockpitTest.includes(helperEnd) && !cockpitTest.includes("  initGitRepo(target);\n}\n\nfunction writeDeleteOnlyReorgPlan")) cockpitTest = cockpitTest.replace(helperEnd, "  }));\n  initGitRepo(target);\n}\n\nfunction writeDeleteOnlyReorgPlan");
// Old undo-failure expectation is no longer valid: durable rollback recreates missing parents.
cockpitTest = cockpitTest.replace("expect(undoResponse.status).toBe(500);", "expect(undoResponse.status).toBe(200);");
write('packages/core/src/cockpit.test.ts', cockpitTest);

// -----------------------------------------------------------------------------
// Documentation of real remaining limits
// -----------------------------------------------------------------------------
write('docs/P0B-IMPLEMENTATION.md', `# P0b — unified refactor engine\n\nImplemented write path: **Plan → Safety → Checkpoint → Executor → Verify → Keep/Rollback**.\n\n- One AST-based JS/TS reference rewriter.\n- MOVE/RENAME/CONSOLIDATE compute reference changes before disk writes and restore earlier writes on failure.\n- PHP move/consolidation is blocked; possible PHP references are supervised and are never rewritten by regex.\n- CLI move, Cockpit Reorganize, unfuck --apply-plan, and seniorize structural work converge on executeRefactorPlan.\n- Execution reports expose runId.\n- Persistent rollback uses the existing .ycf/refactor-checkpoints archives and exact runId + blockId; blockId-only lookup refuses ambiguity.\n\n## Remaining real limitations\n\n1. There is no PhpReferenceRewriter yet; PHP structural moves remain BLOCKED/SUPERVISED by design.\n2. Persistent block rollback restores only the block's recorded changed files when available. If an interrupted run never recorded changedFiles, YCF falls back to the existing Git checkpoint behavior, which requires a clean worktree.\n3. If later operations intentionally modify one of the exact same files an older block changed, rolling back the older block can overwrite those later edits in that file. The Cockpit keeps runId + blockId so this is explicit; future conflict-aware three-way rollback would improve this.\n4. A dedicated lint tool is not configured in this repository; typecheck and YCF verification are the current static gates.\n5. npm publishing and desktop executable repackaging are intentionally outside P0b.\n`);

// -----------------------------------------------------------------------------
// Final source invariants — fail the implementation step if old parallel paths remain.
// -----------------------------------------------------------------------------
const finalOps = read('packages/core/src/refactor-operations.ts');
const finalCli = read('packages/cli/src/index.ts');
const finalCockpit = read('packages/core/src/cockpit.ts');
const finalReorg = read('packages/core/src/reorganization.ts');
for (const [name, text, forbidden] of [
  ['operations', finalOps, ['importSpecifierPattern']],
  ['cli', finalCli, ['rewriteImportsForMove', 'function relativeImport']],
  ['cockpit', finalCockpit, ['applyReorganizationMove', 'applyRefactorOperation(']],
  ['reorganization', finalReorg, ['applyReorganizationMove', 'applyRefactorOperation(']],
]) for (const token of forbidden) if (text.includes(token)) throw new Error(`${name} still contains forbidden parallel path: ${token}`);
console.log('P0b implementation applied and source invariants passed.');
