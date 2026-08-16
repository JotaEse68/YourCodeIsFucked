import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeRefactorPlan } from './refactor-executor.js';
import { beginCheckpointJournal, readCheckpointJournal, updateBlockCheckpoint } from './refactor-checkpoints.js';
import type { ArchitecturalRefactorPlan, RefactorBlock } from './refactor-types.js';

const block = (id: string, operations: RefactorBlock['operations'], dependencies: string[] = []): RefactorBlock => ({ id, type: 'DEMO', goal: id, reason: 'reproducible executor test', risk: 'LOW', confidence: 99, mode: 'SAFE', files: [], dependencies, affectedModules: [], preconditions: [], operations, validation: [], rollback: [{ kind: 'undo-operation', description: 'inverse operation journal' }], status: 'PLANNED' });

describe('architectural refactor executor', () => {
  it('moves, recalculates internal imports, extracts, consolidates and isolates rollback', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-refactor-')); const write = (file: string, content: string) => { const path = join(root, file); const parent = path.slice(0, path.lastIndexOf('\\')); mkdirSync(parent, { recursive: true }); writeFileSync(path, content); };
    write('src/legacy/old.ts', "import { add } from '../utils/math';\nexport function formatName(name: string) {\n  return name.trim();\n}\nexport const total = add(1, 2);\n"); write('src/utils/math.ts', 'export const add = (a: number, b: number) => a + b;\n'); write('src/app.ts', "import { total } from './legacy/old';\nconsole.log(total);\n"); write('src/api.ts', 'export const request = () => true;\n'); write('src/api-copy.ts', 'export const request = () => true;\n'); write('src/use-copy.ts', "import { request } from './api-copy';\nrequest();\n");
    const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 5, safeRefactor: 5, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
      block('RF-001', [{ id: 'op-move', kind: 'MOVE', description: 'move old module', source: 'src/legacy/old.ts', destination: 'src/features/old.ts', updateImports: true }]),
      block('RF-002', [{ id: 'op-extract', kind: 'EXTRACT', description: 'extract formatName', sourceFile: 'src/features/old.ts', targetFile: 'src/features/format-name.ts', range: { startLine: 2, endLine: 4 }, exportedNames: ['formatName'] }], ['RF-001']),
      block('RF-003', [{ id: 'op-consolidate', kind: 'CONSOLIDATE', description: 'remove exact duplicate', canonicalFile: 'src/api.ts', duplicateFile: 'src/api-copy.ts', symbol: 'request' }]),
      block('RF-004', [{ id: 'op-fail', kind: 'RENAME', description: 'forced failure', source: 'src/missing.ts', destination: 'src/nope.ts', updateImports: true }]),
      block('RF-005', [{ id: 'op-independent', kind: 'CREATE', description: 'continue after rollback', file: 'src/after-rollback.ts', content: 'export const healthy = true;\n' }])
    ] };
    const result = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
    expect(result.keptBlocks).toEqual(['RF-001', 'RF-002', 'RF-003', 'RF-005']); expect(result.rolledBackBlocks).toEqual(['RF-004']); expect(result.rollbackEvents[0]?.isolated).toBe(true);
    expect(result.before?.files).toContain('src/legacy/old.ts'); expect(result.after?.files).toContain('src/features/old.ts'); expect(result.after?.files).not.toContain('src/legacy/old.ts');
    expect(existsSync(join(root, 'src/features/old.ts'))).toBe(true); expect(existsSync(join(root, 'src/features/format-name.ts'))).toBe(true); expect(existsSync(join(root, 'src/api-copy.ts'))).toBe(false); expect(existsSync(join(root, 'src/after-rollback.ts'))).toBe(true);
    expect(readFileSync(join(root, 'src/features/old.ts'), 'utf8')).toContain("from '../utils/math'"); expect(readFileSync(join(root, 'src/use-copy.ts'), 'utf8')).toContain("from './api'");
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

  it('marks an interrupted RUNNING block as pending in the durable journal', () => {
    const root = mkdtempSync(join(tmpdir(), 'ycf-interrupted-')); writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n'); const runGit = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    runGit(['init', '-q']); runGit(['config', 'user.email', 'ycf-test@example.com']); runGit(['config', 'user.name', 'YCF Test']); runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const first = beginCheckpointJournal(root, ['RF-INTERRUPTED']); expect(first).toBeDefined(); updateBlockCheckpoint(first, 'RF-INTERRUPTED', 'RUNNING');
    const second = beginCheckpointJournal(root, ['RF-NEW']); expect(second).toBeDefined(); const archived = JSON.parse(readFileSync(join(root, '.ycf', 'refactor-checkpoints', `${first?.journal.runId}.json`), 'utf8')) as { blocks: Array<{ status: string; error?: string }> };
    expect(archived.blocks[0]).toMatchObject({ status: 'PENDING', error: 'Execution interrupted before the block reached a final state.' });
  });
});
