import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyReorganizationMove } from './reorganization.js';
import type { RefactorBlock } from './refactor-types.js';

const block = (id: string, source: string, destination: string): RefactorBlock => ({
  id, type: 'MOVE', goal: 'reorganize', reason: 'test', risk: 'MEDIUM', confidence: 70, mode: 'SUPERVISED',
  files: [source], dependencies: [], affectedModules: [], preconditions: [],
  operations: [{ id: `${id}-op`, kind: 'MOVE', description: 'move', source, destination, updateImports: true }],
  validation: [], rollback: [], status: 'PLANNED'
});

describe('applyReorganizationMove', () => {
  it('applies the move, keeps an undo closure, and undo restores the original path', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-reorg-'));
    mkdirSync(join(target, 'legacy'), { recursive: true });
    writeFileSync(join(target, 'legacy/greeting.ts'), 'export const greet = () => "hi";\n');
    const result = applyReorganizationMove(target, block('RF-MOVE-001', 'legacy/greeting.ts', 'features/greeting.ts'));
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('expected applied');
    expect(existsSync(join(target, 'features/greeting.ts'))).toBe(true);
    expect(existsSync(join(target, 'legacy/greeting.ts'))).toBe(false);
    result.applied[0].undo();
    expect(existsSync(join(target, 'legacy/greeting.ts'))).toBe(true);
    expect(existsSync(join(target, 'features/greeting.ts'))).toBe(false);
  });

  it('rolls back automatically when the source file does not exist', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-reorg-'));
    const result = applyReorganizationMove(target, block('RF-MOVE-002', 'legacy/missing.ts', 'features/missing.ts'));
    expect(result.status).toBe('rolled_back');
    if (result.status !== 'rolled_back') throw new Error('expected rolled_back');
    expect(result.error).toMatch(/Source does not exist/);
  });

  it('rolls back every already-applied operation, in reverse order, when a later operation in the same block fails', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-reorg-'));
    mkdirSync(join(target, 'legacy'), { recursive: true });
    writeFileSync(join(target, 'legacy/a.ts'), 'export const a = 1;\n');
    writeFileSync(join(target, 'legacy/b.ts'), 'export const b = 2;\n');
    const multiOpBlock: RefactorBlock = {
      id: 'RF-MOVE-003', type: 'MOVE', goal: 'reorganize', reason: 'test', risk: 'MEDIUM', confidence: 70, mode: 'SUPERVISED',
      files: ['legacy/a.ts', 'legacy/b.ts', 'legacy/missing.ts'], dependencies: [], affectedModules: [], preconditions: [],
      operations: [
        { id: 'RF-MOVE-003-op1', kind: 'MOVE', description: 'move a', source: 'legacy/a.ts', destination: 'features/a.ts', updateImports: true },
        { id: 'RF-MOVE-003-op2', kind: 'MOVE', description: 'move b', source: 'legacy/b.ts', destination: 'features/b.ts', updateImports: true },
        { id: 'RF-MOVE-003-op3', kind: 'MOVE', description: 'move missing', source: 'legacy/missing.ts', destination: 'features/missing.ts', updateImports: true },
      ],
      validation: [], rollback: [], status: 'PLANNED',
    };
    // op1 and op2 succeed for real (real renames on disk); op3 fails immediately because its
    // source does not exist. This exercises the rollback loop against a real, partially-applied,
    // multi-operation block instead of the zero-iteration case the earlier tests cover.
    const result = applyReorganizationMove(target, multiOpBlock);
    expect(result.status).toBe('rolled_back');
    if (result.status !== 'rolled_back') throw new Error('expected rolled_back');
    expect(result.error).toMatch(/Source does not exist/);
    // Both already-applied operations must be undone, proving the reverse-order loop actually ran
    // more than zero times against real filesystem state.
    expect(existsSync(join(target, 'legacy/a.ts'))).toBe(true);
    expect(existsSync(join(target, 'features/a.ts'))).toBe(false);
    expect(existsSync(join(target, 'legacy/b.ts'))).toBe(true);
    expect(existsSync(join(target, 'features/b.ts'))).toBe(false);
  });
});
