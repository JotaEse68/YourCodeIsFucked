import type { AuditReport, RefactorPlan, RefactorRecommendation, UnderstandReport } from './types.js';

const refactorableRules = new Set(['long-function', 'large-source-file', 'large-react-component', 'high-complexity', 'duplicate-code', 'similar-duplicate-code']);

function guidedSteps(finding: AuditReport['findings'][number], suggestedAction: string): Pick<RefactorRecommendation, 'steps' | 'stopIf'> {
  const location = `${finding.file}:${finding.lines.join(',') || 'relevant location'}`;
  return {
    steps: [
      { phase: 'inspect', instruction: `Read ${location}, its callers, and the affected modules before editing. Write down the observable inputs, outputs, errors, and side effects.` },
      { phase: 'change', instruction: `${suggestedAction} Make one small change in a dedicated commit; keep the old public contract and behavior unless a human explicitly approves a change.` },
      { phase: 'verify', instruction: 'Run `ycf verify`, exercise the behavior that uses this code, then run `ycf release` before publishing.' }
    ],
    stopIf: [
      'Stop if the change would alter a public API, authentication, payments, database schema, stored data, permissions, or externally consumed output.',
      'Stop if you cannot explain why every caller will keep the same behavior, including errors and edge cases.',
      'Stop if verification fails; restore the last known-good commit and investigate the first failure before continuing.'
    ]
  };
}

function recommendationFor(finding: AuditReport['findings'][number], affectedModules: string[]): RefactorRecommendation | undefined {
  if (!refactorableRules.has(finding.ruleId) && finding.risk !== 'architectural') return undefined;
  const shared = (suggestedAction: string) => ({ id: `refactor:${finding.id}`, risk: finding.risk, file: finding.file, lines: finding.lines, affectedModules, requiresHumanReview: true, ...guidedSteps(finding, suggestedAction) });
  switch (finding.ruleId) {
    case 'long-function': { const suggestedAction = 'Identify separate responsibilities, extract one small helper at a time, then run tests and build.'; return { ...shared(suggestedAction), title: 'Split an oversized function', why: finding.evidence, suggestedAction }; }
    case 'large-source-file': { const suggestedAction = 'Group related responsibilities first; move one cohesive group only after checking imports and consumers.'; return { ...shared(suggestedAction), title: 'Plan a module split', why: finding.evidence, suggestedAction }; }
    case 'large-react-component': { const suggestedAction = 'Extract a presentational component or custom hook with stable inputs, then verify UI behavior.'; return { ...shared(suggestedAction), title: 'Reduce a large React component', why: finding.evidence, suggestedAction }; }
    case 'high-complexity': { const suggestedAction = 'Name intermediate decisions or extract one branch; preserve tests for every behavior path.'; return { ...shared(suggestedAction), title: 'Simplify branching logic', why: finding.evidence, suggestedAction }; }
    case 'duplicate-code': { const suggestedAction = 'Compare all copies and their consumers. Extract shared code only if behavior, error handling and contracts match.'; return { ...shared(suggestedAction), title: 'Review duplicate code before consolidation', why: finding.evidence, suggestedAction }; }
    case 'similar-duplicate-code': { const suggestedAction = 'The structure matches but names or values differ. Compare inputs, errors and side effects; extract shared code only after tests prove equivalent behavior.'; return { ...shared(suggestedAction), title: 'Compare likely duplicate code before consolidation', why: finding.evidence, suggestedAction }; }
    case 'wordpress-rest-route-permission': { const suggestedAction = 'Add or verify a permission_callback with the appropriate capability. Do not change access behavior without product approval.'; return { ...shared(suggestedAction), title: 'Review WordPress REST authorization', why: finding.evidence, suggestedAction }; }
    case 'wordpress-dynamic-entrypoint': { const suggestedAction = 'Document the hook or callback path. Do not delete or rename it based on static analysis.'; return { ...shared(suggestedAction), title: 'Protect a dynamic WordPress entry point', why: finding.evidence, suggestedAction }; }
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
