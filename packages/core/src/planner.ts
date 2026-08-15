import type { AuditReport, RefactorPlan, RefactorRecommendation, UnderstandReport } from './types.js';

const refactorableRules = new Set(['long-function', 'large-source-file', 'large-react-component', 'high-complexity', 'duplicate-code']);

function recommendationFor(finding: AuditReport['findings'][number], affectedModules: string[]): RefactorRecommendation | undefined {
  if (!refactorableRules.has(finding.ruleId) && finding.risk !== 'architectural') return undefined;
  const shared = { id: `refactor:${finding.id}`, risk: finding.risk, file: finding.file, lines: finding.lines, affectedModules, requiresHumanReview: true };
  switch (finding.ruleId) {
    case 'long-function': return { ...shared, title: 'Split an oversized function', why: finding.evidence, suggestedAction: 'Identify separate responsibilities, extract one small helper at a time, then run tests and build.' };
    case 'large-source-file': return { ...shared, title: 'Plan a module split', why: finding.evidence, suggestedAction: 'Group related responsibilities first; move one cohesive group only after checking imports and consumers.' };
    case 'large-react-component': return { ...shared, title: 'Reduce a large React component', why: finding.evidence, suggestedAction: 'Extract a presentational component or custom hook with stable inputs, then verify UI behavior.' };
    case 'high-complexity': return { ...shared, title: 'Simplify branching logic', why: finding.evidence, suggestedAction: 'Name intermediate decisions or extract one branch; preserve tests for every behavior path.' };
    case 'duplicate-code': return { ...shared, title: 'Review duplicate code before consolidation', why: finding.evidence, suggestedAction: 'Compare all copies and their consumers. Extract shared code only if behavior, error handling and contracts match.' };
    case 'wordpress-rest-route-permission': return { ...shared, title: 'Review WordPress REST authorization', why: finding.evidence, suggestedAction: 'Add or verify a permission_callback with the appropriate capability. Do not change access behavior without product approval.' };
    case 'wordpress-dynamic-entrypoint': return { ...shared, title: 'Protect a dynamic WordPress entry point', why: finding.evidence, suggestedAction: 'Document the hook or callback path. Do not delete or rename it based on static analysis.' };
    default: return undefined;
  }
}

export function buildRefactorPlan(audit: AuditReport, understanding: UnderstandReport): RefactorPlan {
  const dependents = new Map<string, string[]>();
  for (const edge of understanding.graph.edges) dependents.set(edge.to, [...(dependents.get(edge.to) ?? []), edge.from]);
  const recommendations = audit.findings.flatMap((finding) => {
    const affectedModules = [...new Set([finding.file, ...(dependents.get(finding.file) ?? [])])];
    const recommendation = recommendationFor(finding, affectedModules);
    return recommendation ? [recommendation] : [];
  });
  return {
    target: audit.target,
    generatedAt: new Date().toISOString(),
    recommendations,
    summary: {
      safeRefactors: recommendations.filter((recommendation) => recommendation.risk === 'safe-refactor').length,
      architecturalReviews: recommendations.filter((recommendation) => recommendation.risk === 'architectural').length,
      total: recommendations.length
    }
  };
}
