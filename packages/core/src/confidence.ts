export interface EvidenceItem { file: string; lines?: number[]; detail: string; }

export type ConfidenceTier = 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'DIRECTIONAL' | 'SPECULATIVE';

export type UncertaintyState =
  | 'NEEDS_RUNTIME' | 'NEEDS_TEST' | 'NEEDS_HUMAN'
  | 'NEEDS_FRAMEWORK_CONTEXT' | 'NEEDS_EXTERNAL_CONTRACT';

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 90) return 'CONFIRMED';
  if (confidence >= 75) return 'HIGH_CONFIDENCE';
  if (confidence >= 50) return 'DIRECTIONAL';
  return 'SPECULATIVE';
}

export function computeConfidence(base: number, evidence: EvidenceItem[]): number {
  const distinctFiles = new Set(evidence.map((item) => item.file)).size;
  const bonus = Math.min(15, Math.max(0, evidence.length - 1) * 3 + Math.max(0, distinctFiles - 1) * 2);
  return Math.min(99, Math.round(base + bonus));
}
