import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { audit, understand } from './index.js';
import type { ArchitecturalRefactorPlan, RefactorBlock } from './refactor-types.js';

/** Build an executable architectural plan from static evidence. Explicit blocks can be supplied by a UI/agent after review. */
export function buildArchitecturalRefactorPlan(target: string, explicitBlocks: RefactorBlock[] = []): ArchitecturalRefactorPlan {
  const root = resolve(target); const understanding = understand(root); const findings = audit(root).findings;
  const blocks = explicitBlocks.length ? explicitBlocks : understanding.duplicates.map((group, index): RefactorBlock => ({
    id: `RF-DUP-${String(index + 1).padStart(3, '0')}`, type: group.kind === 'exact' ? 'CONSOLIDATE_DUPLICATE' : 'SIMILAR_DUPLICATE_REVIEW',
    goal: group.kind === 'exact' ? 'Consolidate exact duplicate logic.' : 'Review structurally similar logic.', reason: 'Static duplicate evidence requires responsibility and API review before changing behavior.', risk: 'HIGH', confidence: group.kind === 'exact' ? 94 : 62, mode: 'SUPERVISED',
    files: group.occurrences.map((occurrence) => occurrence.file), dependencies: [], affectedModules: group.occurrences.map((occurrence) => occurrence.file), preconditions: ['Confirm canonical owner and public API.'],
    operations: [{ id: `op-${index + 1}`, kind: group.kind === 'exact' ? 'CONSOLIDATE' : 'EXTRACT', description: 'Review duplicate candidate before execution.', ...(group.kind === 'exact' ? { canonicalFile: group.occurrences[0]?.file ?? '', duplicateFile: group.occurrences[1]?.file ?? '', symbol: 'unknown' } : { sourceFile: group.occurrences[0]?.file ?? '', targetFile: '', range: { startLine: group.occurrences[0]?.startLine ?? 1, endLine: group.occurrences[0]?.endLine ?? 1 }, exportedNames: [] }) } as never],
    validation: [], rollback: [{ id: `undo-${index + 1}`, kind: 'undo-operation', description: 'Undo the block operation journal.' }], status: 'PLANNED'
  }));
  const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), blocks, summary: { auto: blocks.filter((block) => block.mode === 'SAFE').length, safeRefactor: blocks.filter((block) => block.mode === 'SAFE').length, supervised: blocks.filter((block) => block.mode === 'SUPERVISED').length, architectural: blocks.filter((block) => block.risk === 'HIGH').length, blocked: blocks.filter((block) => block.mode === 'BLOCKED').length }, sourceFindings: findings.map((finding) => finding.id) };
  mkdirSync(join(root, '.ycf'), { recursive: true }); writeFileSync(join(root, '.ycf', 'architectural-refactor-plan.json'), JSON.stringify(plan, null, 2), 'utf8');
  return plan;
}
