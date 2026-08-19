import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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
});
