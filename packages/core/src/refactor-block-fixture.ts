import type { RefactorBlock } from './refactor-types.js';

/** Builds a minimal, valid RefactorBlock for tests and reproducible demos -- not meant
 * for a real generated plan (see refactor-planner.ts for that). */
export function demoRefactorBlock(id: string, operations: RefactorBlock['operations'], options: { type?: string; reason?: string; rollbackDescription?: string; dependencies?: string[] } = {}): RefactorBlock {
  return {
    id, type: options.type ?? 'DEMO', goal: id, reason: options.reason ?? 'reproducible fixture',
    risk: 'LOW', confidence: 99, evidence: [], confidenceTier: 'CONFIRMED', mode: 'SAFE', files: [], dependencies: options.dependencies ?? [],
    affectedModules: [], preconditions: [], operations, validation: [],
    rollback: [{ kind: 'undo-operation', description: options.rollbackDescription ?? 'Undo this block operation journal.' }],
    status: 'PLANNED'
  };
}
