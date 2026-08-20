import { audit } from './index.js';
import { runSecurityChecks } from './security.js';
import { walkSourceFiles } from './verify.js';
import { readCheckpointJournal } from './refactor-checkpoints.js';
import { confidenceTier } from './confidence.js';
import type { Finding } from './types.js';

export interface NextReport {
  target: string;
  blocked?: { reason: 'unfinished-run'; pendingBlockIds: string[] };
  suggestions: Finding[];
}

export function next(target: string, limit = 5): NextReport {
  const journal = readCheckpointJournal(target);
  const pending = journal?.blocks.filter((block) => block.status === 'PENDING' || block.status === 'RUNNING') ?? [];
  if (pending.length) {
    return { target, blocked: { reason: 'unfinished-run', pendingBlockIds: pending.map((block) => block.blockId) }, suggestions: [] };
  }
  // Merge audit()'s structural findings with runSecurityChecks()'s output. Only the
  // latter (security.ts's 5 static detectors + dependencySecurityProvider) ever sets
  // Finding.confidence -- audit() alone would leave every finding undefined-confidence
  // and this command's entire tier-based ranking would never fire on real data. The two
  // sources overlap on WordPress-derived findings (audit() and runSecurityChecks() both
  // call the same wordpress*Findings functions), so dedupe by id, keeping whichever
  // occurrence is encountered -- they are identical when both exist.
  const merged = new Map<string, Finding>();
  for (const finding of audit(target).findings) merged.set(finding.id, finding);
  for (const finding of runSecurityChecks(target, walkSourceFiles(target))) merged.set(finding.id, finding);
  const tierRank: Record<string, number> = { CONFIRMED: 0, HIGH_CONFIDENCE: 1, DIRECTIONAL: 2, SPECULATIVE: 3 };
  const ranked = [...merged.values()].sort((a, b) => {
    const tierA = tierRank[confidenceTier(a.confidence ?? 0)] ?? 4;
    const tierB = tierRank[confidenceTier(b.confidence ?? 0)] ?? 4;
    if (tierA !== tierB) return tierA - tierB;
    return b.scoreImpact - a.scoreImpact;
  });
  return { target, blocked: undefined, suggestions: ranked.slice(0, limit) };
}
