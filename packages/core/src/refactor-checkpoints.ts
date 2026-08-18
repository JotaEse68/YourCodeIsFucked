import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git } from './git.js';
import { atomicWrite } from './fs-atomic.js';

export type PersistentBlockStatus = 'PENDING' | 'RUNNING' | 'VERIFIED' | 'ROLLED_BACK' | 'BLOCKED';
export interface PersistentBlockCheckpoint { blockId: string; status: PersistentBlockStatus; ref?: string; commit?: string; startedAt?: string; updatedAt: string; changedFiles: string[]; operationIds: string[]; error?: string; }
export interface PersistentCheckpointJournal { version: 1; runId: string; target: string; createdAt: string; updatedAt: string; baseCommit?: string; blocks: PersistentBlockCheckpoint[]; }
export interface CheckpointContext { root: string; path: string; currentPath: string; journal: PersistentCheckpointJournal; }

function persist(context: CheckpointContext): void { context.journal.updatedAt = new Date().toISOString(); const serialized = `${JSON.stringify(context.journal, null, 2)}\n`; atomicWrite(context.path, serialized); atomicWrite(context.currentPath, serialized); }
function checkpointRef(runId: string, blockId: string): string { return `refs/ycf/blocks/${runId}/${blockId}/before`; }

export function beginCheckpointJournal(target: string, blockIds: string[]): CheckpointContext | undefined {
  const root = resolve(target); let baseCommit: string | undefined;
  try { baseCommit = git(root, ['rev-parse', 'HEAD']); } catch { return undefined; }
  const now = new Date().toISOString(); const runId = `run-${now.replace(/[^0-9]/g, '')}`; const output = join(root, '.ycf'); const archive = join(output, 'refactor-checkpoints'); const currentPath = join(output, 'refactor-checkpoints.json'); const path = join(archive, `${runId}.json`);
  mkdirSync(archive, { recursive: true });
  if (existsSync(currentPath)) {
    try {
      const previous = JSON.parse(readFileSync(currentPath, 'utf8')) as PersistentCheckpointJournal;
      const interrupted = previous.blocks.some((block) => block.status === 'RUNNING');
      if (interrupted) { const updatedAt = new Date().toISOString(); previous.updatedAt = updatedAt; previous.blocks = previous.blocks.map((block) => block.status === 'RUNNING' ? { ...block, status: 'PENDING' as const, updatedAt, error: 'Execution interrupted before the block reached a final state.' } : block); atomicWrite(join(archive, `${previous.runId}.json`), `${JSON.stringify(previous, null, 2)}\n`); atomicWrite(currentPath, `${JSON.stringify(previous, null, 2)}\n`); }
    } catch { /* A corrupt journal must not prevent a new safe run. */ }
  }
  const journal: PersistentCheckpointJournal = { version: 1, runId, target: root, createdAt: now, updatedAt: now, baseCommit, blocks: blockIds.map((blockId) => ({ blockId, status: 'PENDING', updatedAt: now, changedFiles: [], operationIds: [] })) };
  const context = { root, path, currentPath, journal }; persist(context); return context;
}

export function updateBlockCheckpoint(context: CheckpointContext | undefined, blockId: string, status: PersistentBlockStatus, details: { changedFiles?: string[]; operationIds?: string[]; error?: string } = {}): void {
  if (!context) return; const block = context.journal.blocks.find((item) => item.blockId === blockId); if (!block) return; const now = new Date().toISOString();
  if (status === 'RUNNING') block.startedAt = block.startedAt ?? now;
  block.status = status; block.updatedAt = now; if (details.changedFiles) block.changedFiles = details.changedFiles; if (details.operationIds) block.operationIds = details.operationIds; if (details.error) block.error = details.error;
  if (status === 'RUNNING' && !block.ref) {
    try {
      const commit = git(context.root, ['rev-parse', 'HEAD']); const ref = checkpointRef(context.journal.runId, blockId); git(context.root, ['update-ref', ref, commit]); block.ref = ref; block.commit = commit;
    } catch { /* The JSON journal still records the interrupted block when Git refs are unavailable. */ }
  }
  persist(context);
}

export function readCheckpointJournal(target: string): PersistentCheckpointJournal | undefined {
  const path = join(resolve(target), '.ycf', 'refactor-checkpoints.json'); if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')) as PersistentCheckpointJournal; } catch { return undefined; }
}
