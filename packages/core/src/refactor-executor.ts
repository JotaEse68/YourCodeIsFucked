import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { beginCheckpointJournal, updateBlockCheckpoint } from './refactor-checkpoints.js';
import { verificationPlan, verify } from './verify.js';
import type { ArchitecturalRefactorPlan, RefactorBlock, RefactorExecutionReport, OperationRecord, RollbackEvent } from './refactor-types.js';
import { applyRefactorOperation, type AppliedOperation } from './refactor-operations.js';
import { understand } from './index.js';

function diffSummary(target: string): string { try { return execFileSync('git', ['-C', resolve(target), 'diff', '--stat'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } }
function sourceSnapshot(root: string): string[] { const ignored = new Set(['node_modules', 'dist', 'build', '.git', '.ycf']); const walk = (directory: string): string[] => readdirSync(directory).flatMap((entry) => { if (ignored.has(entry)) return []; const file = resolve(directory, entry); return statSync(file).isDirectory() ? walk(file) : /\.(?:[cm]?js|jsx|tsx?|php)$/i.test(file) ? [file.slice(root.length + 1).replaceAll('\\', '/')] : []; }); return walk(root).sort(); }
function architectureSnapshot(root: string): ReturnType<typeof understand>['graph'] { const slash = (value: string) => value.replaceAll('\\', '/'); const graph = understand(root).graph; return { nodes: graph.nodes.map((node) => ({ ...node, id: slash(node.id), file: slash(node.file) })), edges: graph.edges.map((edge) => ({ ...edge, from: slash(edge.from), to: slash(edge.to) })), cycles: graph.cycles.map((cycle) => cycle.map(slash)) }; }
function dependencyReady(block: RefactorBlock, blocks: RefactorBlock[]): boolean { return block.dependencies.every((dependency) => blocks.find((candidate) => candidate.id === dependency)?.status === 'VERIFIED'); }
function runVerification(target: string, block: RefactorBlock, full: boolean): ReturnType<typeof verify> {
  if (full || !block.validation.length) return verify(target);
  const relevant = new Set(block.validation.filter((step) => !step.mode || step.mode === 'FAST').map((step) => step.name));
  const checks = verificationPlan(target).filter((check) => relevant.has(check.name)).map((check) => { if (check.output) return check; const [command, ...args] = check.command; const result = spawnSync(command, args, { cwd: target, encoding: 'utf8', shell: process.platform === 'win32' }); return { ...check, status: result.status === 0 ? 'passed' as const : 'failed' as const, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() }; });
  return { target: resolve(target), verifiedAt: new Date().toISOString(), checks, passed: checks.every((check) => check.status !== 'failed') };
}

export function executeRefactorPlan(target: string, plan: ArchitecturalRefactorPlan, options: { allowSupervised?: boolean; fullVerify?: boolean; createGitCheckpoint?: boolean } = {}): RefactorExecutionReport {
  const startedAt = new Date().toISOString(); const root = resolve(target); const beforeFiles = sourceSnapshot(root); const beforeArchitecture = architectureSnapshot(root); const keptBlocks: string[] = []; const rolledBackBlocks: string[] = []; const blockedBlocks: string[] = []; const operationLog: OperationRecord[] = []; const rollbackEvents: RollbackEvent[] = [];
  const checkpoints = options.createGitCheckpoint === false ? undefined : beginCheckpointJournal(target, plan.blocks.map((block) => block.id));
  for (const block of plan.blocks) {
    if (!dependencyReady(block, plan.blocks)) { block.status = 'BLOCKED'; block.result = { changedFiles: [], diffSummary: '', verificationPassed: false, error: `Dependencies not verified: ${block.dependencies.join(', ')}` }; blockedBlocks.push(block.id); updateBlockCheckpoint(checkpoints, block.id, 'BLOCKED', { error: block.result.error }); continue; }
    if (block.mode === 'BLOCKED' || (block.mode === 'SUPERVISED' && !options.allowSupervised)) { block.status = block.mode === 'BLOCKED' ? 'BLOCKED' : 'SUPERVISED'; block.result = { changedFiles: [], diffSummary: '', verificationPassed: false, error: block.mode === 'BLOCKED' ? 'Static safety analysis blocked this operation.' : 'Requires explicit supervised approval.' }; blockedBlocks.push(block.id); updateBlockCheckpoint(checkpoints, block.id, 'BLOCKED', { error: block.result.error }); continue; }
    block.status = 'RUNNING'; const applied: AppliedOperation[] = []; const changed = new Set<string>();
    updateBlockCheckpoint(checkpoints, block.id, 'RUNNING');
    try {
      for (const operation of block.operations) { const result = applyRefactorOperation(target, operation, { allowSupervised: options.allowSupervised }); applied.push(result); result.changedFiles.forEach((file) => changed.add(file)); operationLog.push({ operationId: result.operationId, kind: operation.kind, changedFiles: result.changedFiles, description: result.description, relatedTestFiles: result.relatedTestFiles, undone: false }); }
      const verification = runVerification(target, block, options.fullVerify === true); block.result = { changedFiles: [...changed], diffSummary: diffSummary(target), verificationPassed: verification.passed, verification };
      if (!verification.passed) throw new Error('Verification failed.');
      block.status = 'VERIFIED'; keptBlocks.push(block.id); updateBlockCheckpoint(checkpoints, block.id, 'VERIFIED', { changedFiles: [...changed], operationIds: applied.map((operation) => operation.operationId) });
    } catch (error) {
      const undone: string[] = []; for (const operation of [...applied].reverse()) { try { operation.undo(); undone.push(operation.operationId); const record = operationLog.find((item) => item.operationId === operation.operationId); if (record) record.undone = true; } catch { /* preserve the original failure and report the limitation */ } }
      block.status = 'ROLLED_BACK'; block.result = { changedFiles: [...changed], diffSummary: '', verificationPassed: false, error: error instanceof Error ? error.message : String(error) }; rolledBackBlocks.push(block.id); updateBlockCheckpoint(checkpoints, block.id, 'ROLLED_BACK', { changedFiles: [...changed], operationIds: applied.map((operation) => operation.operationId), error: block.result.error }); rollbackEvents.push({ blockId: block.id, reason: block.result.error ?? 'unknown', operationsUndone: undone, isolated: true });
    }
  }
  const status = rolledBackBlocks.length || blockedBlocks.length ? (keptBlocks.length ? 'partial' : 'failed') : 'completed';
  return { version: 2, target: root, startedAt, completedAt: new Date().toISOString(), status, blocks: plan.blocks, keptBlocks, rolledBackBlocks, blockedBlocks, operationLog, rollbackEvents, before: { files: beforeFiles, architecture: beforeArchitecture }, after: { files: sourceSnapshot(root), architecture: architectureSnapshot(root) } };
}
