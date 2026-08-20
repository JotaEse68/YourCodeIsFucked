import { readCheckpointJournal, markBlockRolledBack, type PersistentCheckpointJournal } from './refactor-checkpoints.js';
import { rollbackToCheckpoint } from './git.js';

export interface RecoverReport { target: string; journal?: PersistentCheckpointJournal; }
export function recover(target: string): RecoverReport {
  return { target, journal: readCheckpointJournal(target) };
}

export type RestoreResult = { restored: true; blockId: string; commit: string } | { restored: false; reason: string };
export function restoreBlock(target: string, blockId: string): RestoreResult {
  const journal = readCheckpointJournal(target);
  const block = journal?.blocks.find((entry) => entry.blockId === blockId);
  if (!block) return { restored: false, reason: `No block "${blockId}" in the checkpoint journal.` };
  if (!block.ref || !block.commit) return { restored: false, reason: `Block "${blockId}" has no recorded checkpoint ref to restore to.` };
  try {
    rollbackToCheckpoint(target, { ref: block.ref, commit: block.commit, createdAt: block.startedAt ?? block.updatedAt });
  } catch (error) {
    return { restored: false, reason: error instanceof Error ? error.message : String(error) };
  }
  markBlockRolledBack(target, blockId);
  return { restored: true, blockId, commit: block.commit };
}
