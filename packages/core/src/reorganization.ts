import { verifyFast } from './verify.js';
import { applyRefactorOperation, type AppliedOperation } from './refactor-operations.js';
import type { RefactorBlock } from './refactor-types.js';

export type ReorganizationMoveResult =
  | { status: 'applied'; applied: AppliedOperation[]; changedFiles: string[] }
  | { status: 'rolled_back'; error: string };

/**
 * Applies every operation in one reorganization block, verifies fast (lint + typecheck),
 * and rolls back immediately on failure. Deliberately does not call executeRefactorPlan:
 * that function discards each AppliedOperation's undo() closure once a block verifies, and
 * the interactive Undo button needs that closure kept alive after this call returns.
 */
export function applyReorganizationMove(target: string, block: RefactorBlock): ReorganizationMoveResult {
  const applied: AppliedOperation[] = [];
  const changed = new Set<string>();
  try {
    for (const operation of block.operations) {
      const result = applyRefactorOperation(target, operation);
      applied.push(result);
      result.changedFiles.forEach((file) => changed.add(file));
    }
    const verification = verifyFast(target);
    if (!verification.passed) throw new Error(verification.checks.filter((check) => check.status === 'failed').map((check) => `${check.name}: ${check.output ?? 'failed'}`).join('; ') || 'Fast verification failed.');
    return { status: 'applied', applied, changedFiles: [...changed] };
  } catch (error) {
    for (const operation of [...applied].reverse()) { try { operation.undo(); } catch { /* preserve the original failure; the working tree state is reported to the caller either way */ } }
    return { status: 'rolled_back', error: error instanceof Error ? error.message : String(error) };
  }
}
