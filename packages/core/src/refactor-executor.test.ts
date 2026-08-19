import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeRefactorPlan } from './refactor-executor.js';
import { beginCheckpointJournal, readCheckpointJournal, updateBlockCheckpoint } from './refactor-checkpoints.js';
import { writeRefactorExecutionReport } from './reporters.js';
import { demoRefactorBlock } from './refactor-block-fixture.js';
import type { ArchitecturalRefactorPlan, RefactorBlock } from './refactor-types.js';

const block = (id: string, operations: RefactorBlock['operations'], dependencies: string[] = []): RefactorBlock => demoRefactorBlock(id, operations, { type: 'DEMO', reason: 'reproducible executor test', rollbackDescription: 'inverse operation journal', dependencies });

describe('architectural refactor executor', () => {
  it('moves, recalculates internal imports, extracts, consolidates and isolates rollback', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-refactor-')); const write = (file: string, content: string) => { const path = join(root, file); const parent = path.slice(0, path.lastIndexOf('\\')); mkdirSync(parent, { recursive: true }); writeFileSync(path, content); };
    write('src/legacy/old.ts', "import { add } from '../utils/math';\nexport function formatName(name: string) {\n  return name.trim();\n}\nexport const total = add(1, 2);\n"); write('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;\n'); write('src/app.ts', "import { total } from './legacy/old';\nconsole.log(total);\n"); write('src/greet.ts', 'export const greeting = () => "hi";\n'); write('src/greet-copy.ts', 'export const greeting = () => "hi";\n'); write('src/use-copy.ts', "import { greeting } from './greet-copy';\ngreeting();\n");
    const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 5, safeRefactor: 5, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
      block('RF-001', [{ id: 'op-move', kind: 'MOVE', description: 'move old module', source: 'src/legacy/old.ts', destination: 'src/features/old.ts', updateImports: true }]),
      block('RF-002', [{ id: 'op-extract', kind: 'EXTRACT', description: 'extract formatName', sourceFile: 'src/features/old.ts', targetFile: 'src/features/format-name.ts', range: { startLine: 2, endLine: 4 }, exportedNames: ['formatName'] }], ['RF-001']),
      block('RF-003', [{ id: 'op-consolidate', kind: 'CONSOLIDATE', description: 'remove exact duplicate', canonicalFile: 'src/greet.ts', duplicateFile: 'src/greet-copy.ts', symbol: 'greeting' }]),
      block('RF-004', [{ id: 'op-fail', kind: 'RENAME', description: 'forced failure', source: 'src/missing.ts', destination: 'src/nope.ts', updateImports: true }]),
      block('RF-005', [{ id: 'op-independent', kind: 'CREATE', description: 'continue after rollback', file: 'src/after-rollback.ts', content: 'export const healthy = true;\n' }])
    ] };
    const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
    expect(result.keptBlocks).toEqual(['RF-001', 'RF-002', 'RF-003', 'RF-005']); expect(result.rolledBackBlocks).toEqual(['RF-004']); expect(result.rollbackEvents[0]?.isolated).toBe(true);
    expect(result.before?.files).toContain('src/legacy/old.ts'); expect(result.after?.files).toContain('src/features/old.ts'); expect(result.after?.files).not.toContain('src/legacy/old.ts');
    expect(existsSync(join(root, 'src/features/old.ts'))).toBe(true); expect(existsSync(join(root, 'src/features/format-name.ts'))).toBe(true); expect(existsSync(join(root, 'src/greet-copy.ts'))).toBe(false); expect(existsSync(join(root, 'src/after-rollback.ts'))).toBe(true);
    expect(readFileSync(join(root, 'src/features/old.ts'), 'utf8')).toContain("from '../utils/math'"); expect(readFileSync(join(root, 'src/use-copy.ts'), 'utf8')).toContain("from './greet'");
  });


  it('blocks partial or non-exported extraction ranges', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-extract-')); const source = join(root, 'source.ts');
    writeFileSync(source, 'export function keep(value: string) {\n  return value.trim();\n}\n');
    const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 0, safeRefactor: 0, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
      block('RF-PARTIAL', [{ id: 'op-partial', kind: 'EXTRACT', description: 'partial declaration', sourceFile: 'source.ts', targetFile: 'extracted.ts', range: { startLine: 1, endLine: 2 }, exportedNames: ['keep'] }])
    ] };
    const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
    expect(result.rolledBackBlocks).toEqual(['RF-PARTIAL']); expect(readFileSync(source, 'utf8')).toContain('export function keep'); expect(existsSync(join(root, 'extracted.ts'))).toBe(false);
  });

  it('preserves leading comments and imports used by the extracted declaration', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-extract-context-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
    write('helper.ts', 'export const suffix = "!";\n'); write('source.ts', 'import { suffix } from "./helper";\n\n// Keep this explanation with the extracted function.\nexport function greet(name: string) {\n  return name + suffix;\n}\n');
    const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 0, safeRefactor: 0, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
      block('RF-CONTEXT', [{ id: 'op-context', kind: 'EXTRACT', description: 'extract greet with context', sourceFile: 'source.ts', targetFile: 'greet.ts', range: { startLine: 4, endLine: 6 }, exportedNames: ['greet'] }])
    ] };
    const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
    expect(result.keptBlocks).toEqual(['RF-CONTEXT']); const extracted = readFileSync(join(root, 'greet.ts'), 'utf8');
    expect(extracted).toContain('import { suffix } from "./helper";'); expect(extracted).toContain('Keep this explanation'); expect(extracted).toContain('export function greet');
  });

  it('persists one Git checkpoint record per block', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-checkpoints-')); const source = join(root, 'source.ts'); writeFileSync(source, 'export const value = 1;\n');
    const runGit = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    runGit(['init', '-q']); runGit(['config', 'user.email', 'ycf-test@example.com']); runGit(['config', 'user.name', 'YCF Test']); runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 0, safeRefactor: 0, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
      block('RF-GIT-OK', [{ id: 'op-create', kind: 'CREATE', description: 'create verified file', file: 'verified.ts', content: 'export const verified = true;\n' }]),
      block('RF-GIT-FAIL', [{ id: 'op-missing', kind: 'RENAME', description: 'forced failure', source: 'missing.ts', destination: 'never.ts', updateImports: true }])
    ] };
    const result = executeRefactorPlan(root, plan, { fullVerify: true }); const journal = readCheckpointJournal(root);
    expect(result.keptBlocks).toEqual(['RF-GIT-OK']); expect(result.rolledBackBlocks).toEqual(['RF-GIT-FAIL']); expect(journal?.blocks.map((item) => item.status)).toEqual(['VERIFIED', 'ROLLED_BACK']); expect(journal?.blocks.every((item) => item.ref && item.commit)).toBe(true);
  });

  it('keeps the file extension when extracting into a JS-family module, so the import resolves under native Node ESM', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-extract-esm-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
    write('package.json', JSON.stringify({ type: 'module' })); write('source.mjs', 'export function greet(name) {\n  return `hi ${name}`;\n}\nexport const marker = true;\n');
    const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 0, safeRefactor: 0, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
      block('RF-EXTRACT-ESM', [{ id: 'op-extract-esm', kind: 'EXTRACT', description: 'extract greet into a Node ESM module', sourceFile: 'source.mjs', targetFile: 'greet.mjs', range: { startLine: 1, endLine: 3 }, exportedNames: ['greet'] }])
    ] };
    const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
    expect(result.keptBlocks).toEqual(['RF-EXTRACT-ESM']);
    expect(readFileSync(join(root, 'source.mjs'), 'utf8')).toContain("from './greet.mjs'");
    expect(readFileSync(join(root, 'greet.mjs'), 'utf8')).toContain('export function greet');
  });

  it('keeps stripping the extension when extracting into a TypeScript module', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-extract-ts-')); writeFileSync(join(root, 'source.ts'), 'export function greet(name: string) {\n  return `hi ${name}`;\n}\nexport const marker = true;\n');
    const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 0, safeRefactor: 0, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
      block('RF-EXTRACT-TS', [{ id: 'op-extract-ts', kind: 'EXTRACT', description: 'extract greet into a TypeScript module', sourceFile: 'source.ts', targetFile: 'greet.ts', range: { startLine: 1, endLine: 3 }, exportedNames: ['greet'] }])
    ] };
    const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
    expect(result.keptBlocks).toEqual(['RF-EXTRACT-TS']);
    expect(readFileSync(join(root, 'source.ts'), 'utf8')).toContain("from './greet'");
    expect(readFileSync(join(root, 'source.ts'), 'utf8')).not.toContain("from './greet.ts'");
  });

  it('marks an interrupted RUNNING block as pending in the durable journal', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-interrupted-')); writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n'); const runGit = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    runGit(['init', '-q']); runGit(['config', 'user.email', 'ycf-test@example.com']); runGit(['config', 'user.name', 'YCF Test']); runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const first = beginCheckpointJournal(root, ['RF-INTERRUPTED']); expect(first).toBeDefined(); updateBlockCheckpoint(first, 'RF-INTERRUPTED', 'RUNNING');
    const second = beginCheckpointJournal(root, ['RF-NEW']); expect(second).toBeDefined(); const archived = JSON.parse(readFileSync(join(root, '.ycf', 'refactor-checkpoints', `${first?.journal.runId}.json`), 'utf8')) as { blocks: Array<{ status: string; error?: string }> };
    expect(archived.blocks[0]).toMatchObject({ status: 'PENDING', error: 'Execution interrupted before the block reached a final state.' });
  });

  describe('import resolution during MOVE', () => {
    it('resolves a .js specifier that actually points to a .ts source file (Node16/NodeNext convention), preserving the .js specifier after the move', () => {
      const root = mkdtempSync(join(tmpdir(), 'ycf-node-next-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
      write('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;\n'); write('src/app.ts', "import { add } from './utils/math.js';\nconsole.log(add(1, 2));\n");
      const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 1, safeRefactor: 1, supervised: 0, architectural: 0, blocked: 0 }, blocks: [block('RF-NODE-NEXT', [{ id: 'op-move', kind: 'MOVE', description: 'move a .ts module referenced with a .js specifier', source: 'src/utils/math.ts', destination: 'src/lib/math.ts', updateImports: true }])] };
      const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
      expect(result.keptBlocks).toEqual(['RF-NODE-NEXT']); expect(readFileSync(join(root, 'src/app.ts'), 'utf8')).toContain("from './lib/math.js'");
    });

    it('rewrites a tsconfig path alias to a relative specifier', () => {
      const root = mkdtempSync(join(tmpdir(), 'ycf-alias-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
      write('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@utils/*': ['src/utils/*'] } } })); write('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;\n'); write('src/app.ts', "import { add } from '@utils/math';\nconsole.log(add(1, 2));\n");
      const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 1, safeRefactor: 1, supervised: 0, architectural: 0, blocked: 0 }, blocks: [block('RF-ALIAS', [{ id: 'op-move', kind: 'MOVE', description: 'move aliased module', source: 'src/utils/math.ts', destination: 'src/lib/math.ts', updateImports: true }])] };
      const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
      expect(result.keptBlocks).toEqual(['RF-ALIAS']); expect(readFileSync(join(root, 'src/app.ts'), 'utf8')).toContain("from './lib/math'");
    });

    it('blocks moving a module that is barrel re-exported via export-from/export-star, protecting the public contract', () => {
      const root = mkdtempSync(join(tmpdir(), 'ycf-export-from-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
      write('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;\n'); write('src/index.ts', "export { add } from './utils/math';\nexport * from './utils/math';\n");
      const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 1, safeRefactor: 1, supervised: 0, architectural: 0, blocked: 0 }, blocks: [block('RF-EXPORT-FROM', [{ id: 'op-move', kind: 'MOVE', description: 'move re-exported module', source: 'src/utils/math.ts', destination: 'src/lib/math.ts', updateImports: true }])] };
      const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
      expect(result.rolledBackBlocks).toEqual(['RF-EXPORT-FROM']); expect(result.blocks[0].result?.error).toMatch(/^BLOCKED:/); const index = readFileSync(join(root, 'src/index.ts'), 'utf8'); expect(index).toContain("export { add } from './utils/math'"); expect(index).toContain("export * from './utils/math'");
    });

    it('rewrites require() and static import() specifiers', () => {
      const root = mkdtempSync(join(tmpdir(), 'ycf-require-import-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
      write('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;\n'); write('src/legacy.js', "const { add } = require('./utils/math');\nmodule.exports = { add };\n"); write('src/lazy.ts', "export async function load() {\n  const { add } = await import('./utils/math');\n  return add;\n}\n");
      const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 1, safeRefactor: 1, supervised: 0, architectural: 0, blocked: 0 }, blocks: [block('RF-REQUIRE-IMPORT', [{ id: 'op-move', kind: 'MOVE', description: 'move required and dynamically imported module', source: 'src/utils/math.ts', destination: 'src/lib/math.ts', updateImports: true }])] };
      const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
      expect(result.keptBlocks).toEqual(['RF-REQUIRE-IMPORT']); expect(readFileSync(join(root, 'src/legacy.js'), 'utf8')).toContain("require('./lib/math')"); expect(readFileSync(join(root, 'src/lazy.ts'), 'utf8')).toContain("import('./lib/math')");
    });

    it('leaves a require() with a dynamic (non-literal) specifier untouched', () => {
      const root = mkdtempSync(join(tmpdir(), 'ycf-dynamic-require-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
      write('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;\n'); const dynamic = "export function load(name) {\n  return require(name);\n}\n"; write('src/dynamic.js', dynamic);
      const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 1, safeRefactor: 1, supervised: 0, architectural: 0, blocked: 0 }, blocks: [block('RF-DYNAMIC-REQUIRE', [{ id: 'op-move', kind: 'MOVE', description: 'move module unrelated to the dynamic require', source: 'src/utils/math.ts', destination: 'src/lib/math.ts', updateImports: true }])] };
      const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
      expect(result.keptBlocks).toEqual(['RF-DYNAMIC-REQUIRE']); expect(readFileSync(join(root, 'src/dynamic.js'), 'utf8')).toBe(dynamic);
    });

    it('blocks moving a file whose own content requires an unresolvable dynamic callback path', () => {
      const root = mkdtempSync(join(tmpdir(), 'ycf-dynamic-callback-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
      write('src/risky.ts', 'export function load(name: string) {\n  return require(`./${name}`);\n}\n');
      const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 0, safeRefactor: 0, supervised: 0, architectural: 0, blocked: 0 }, blocks: [block('RF-DYNAMIC-CALLBACK', [{ id: 'op-move', kind: 'MOVE', description: 'must not move a file with an unresolvable dynamic require', source: 'src/risky.ts', destination: 'src/moved/risky.ts', updateImports: true }])] };
      const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
      expect(result.rolledBackBlocks).toEqual(['RF-DYNAMIC-CALLBACK']); expect(result.blocks[0].result?.error).toMatch(/^BLOCK:/); expect(existsSync(join(root, 'src/risky.ts'))).toBe(true);
    });
  });

  describe('allowSupervised threading into applyRefactorOperation', () => {
    const supervisedPlan = (root: string): ArchitecturalRefactorPlan => ({
      version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 0, safeRefactor: 0, supervised: 1, architectural: 0, blocked: 0 },
      blocks: [{ ...block('RF-SUPERVISED', [{ id: 'op-create-sensitive', kind: 'CREATE', description: 'create in a sensitive zone', file: 'src/auth/session.ts', content: 'export const x = 1;\n' }]), mode: 'SUPERVISED' }]
    });

    it('--yes (allowSupervised: true) lets a SUPERVISED block with a CREATE into a sensitive-zone path succeed', () => {
      const root = mkdtempSync(join(tmpdir(), 'ycf-supervised-allow-'));
      const plan = supervisedPlan(root);
      const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false, allowSupervised: true });
      expect(result.keptBlocks).toEqual(['RF-SUPERVISED']);
      expect(result.blocks[0].status).toBe('VERIFIED');
      expect(existsSync(join(root, 'src/auth/session.ts'))).toBe(true);
    });

    it('without allowSupervised, the same SUPERVISED block is still skipped/blocked, not silently executed', () => {
      const root = mkdtempSync(join(tmpdir(), 'ycf-supervised-deny-'));
      const plan = supervisedPlan(root);
      const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
      expect(result.blockedBlocks).toEqual(['RF-SUPERVISED']);
      expect(result.blocks[0].status).toBe('SUPERVISED');
      expect(existsSync(join(root, 'src/auth/session.ts'))).toBe(false);
    });
  });

  it('captures architecture before and after the run, and reports it as a diff', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-architecture-')); const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
    write('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;\n'); write('src/app.ts', "import { add } from './utils/math';\nconsole.log(add(1, 2));\n");
    const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 1, safeRefactor: 1, supervised: 0, architectural: 0, blocked: 0 }, blocks: [block('RF-ARCHITECTURE', [{ id: 'op-move', kind: 'MOVE', description: 'move module tracked by the architecture graph', source: 'src/utils/math.ts', destination: 'src/lib/math.ts', updateImports: true }])] };
    const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
    expect(result.keptBlocks).toEqual(['RF-ARCHITECTURE']);
    expect(result.before?.architecture?.nodes.some((node) => node.file === 'src/utils/math.ts')).toBe(true);
    expect(result.after?.architecture?.nodes.some((node) => node.file === 'src/lib/math.ts')).toBe(true);
    expect(result.after?.architecture?.nodes.some((node) => node.file === 'src/utils/math.ts')).toBe(false);
    expect(result.after?.architecture?.edges).toContainEqual({ from: 'src/app.ts', to: 'src/lib/math.ts', kind: 'import' });
    const { markdownPath } = writeRefactorExecutionReport(root, result);
    const markdown = readFileSync(markdownPath, 'utf8');
    expect(markdown).toContain('## Architecture'); expect(markdown).toContain('Modules added:'); expect(markdown).toContain('src/lib/math.ts'); expect(markdown).toContain('Modules removed:'); expect(markdown).toContain('src/utils/math.ts');
  });
});
