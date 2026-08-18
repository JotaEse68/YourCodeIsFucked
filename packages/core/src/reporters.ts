import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { releaseCheckLabel, releaseCheckedLabel, releaseHeading } from './i18n.js';
import type { AuditReport, DependencyAuditReport, Language, RefactorPlan, ReleaseReport, UnderstandReport, UnfuckReport } from './types.js';
import type { RefactorExecutionReport } from './refactor-types.js';

export function writeAuditReport(target: string, report: AuditReport): { jsonPath: string; markdownPath: string } {
  const output = join(resolve(target), '.ycf');
  mkdirSync(output, { recursive: true });
  const jsonPath = join(output, 'audit.json');
  const markdownPath = join(output, 'audit.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const findings = report.findings.length ? report.findings.map((finding) => `- **${finding.severity}** \`${finding.file}:${finding.lines.join(',')}\` — ${finding.evidence}`).join('\n') : '- No findings.';
  const dimensions = report.score.dimensions;
  writeFileSync(markdownPath, `# YCF audit report\n\nGenerated: ${report.auditedAt}\n\n- FUCKED SCORE: ${report.score.fucked}%\n- HEALTH SCORE: ${report.score.health}/100\n- Architecture: ${dimensions.architecture}/100\n- Maintainability: ${dimensions.maintainability}/100\n- Security: ${dimensions.security}/100\n- Tests: ${dimensions.tests}/100\n- Documentation: ${dimensions.documentation}/100\n- Source files: ${report.sourceFiles}\n\n## Findings\n\n${findings}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

export function writeUnfuckReport(target: string, report: UnfuckReport): { jsonPath: string; markdownPath: string } {
  const output = join(resolve(target), '.ycf');
  mkdirSync(output, { recursive: true });
  const jsonPath = join(output, 'unfuck.json');
  const markdownPath = join(output, 'unfuck.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const verification = report.verification ? (report.verification.passed ? 'PASS' : 'FAIL') : 'NOT RUN';
  const steps = report.steps?.length ? report.steps.map((step) => `- ${step.name}: **${step.status}**${step.detail ? ` — ${step.detail}` : ''}`).join('\n') : '- No step log recorded.';
  writeFileSync(markdownPath, `# YCF unfuck report\n\nStatus: **${report.status.toUpperCase()}**\n\n- Execution mode: **${report.executionMode ?? 'batch'}**\n- Before FUCKED SCORE: ${report.before.score.fucked}%\n- After FUCKED SCORE: ${report.after.score.fucked}%\n- Before HEALTH SCORE: ${report.before.score.health}/100\n- After HEALTH SCORE: ${report.after.score.health}/100\n- Debugger statements removed: ${report.cleanup?.removedDebugStatements ?? 0}\n- Literal debug console calls removed: ${report.cleanup?.removedDebugConsoleCalls ?? 0}\n- Unused named imports removed: ${report.cleanup?.removedUnusedImports ?? 0}\n- Verification: ${verification}\n- Checkpoint: ${report.checkpoint?.commit ?? 'not created'}\n\n## Steps\n\n${steps}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

export function writeRefactorPlan(target: string, plan: RefactorPlan): { jsonPath: string; markdownPath: string } {
  const output = join(resolve(target), '.ycf');
  mkdirSync(output, { recursive: true });
  const jsonPath = join(output, 'refactor-plan.json');
  const markdownPath = join(output, 'refactor-plan.md');
  writeFileSync(jsonPath, JSON.stringify(plan, null, 2), 'utf8');
  const recommendations = plan.recommendations.length ? plan.recommendations.map((recommendation) => `## ${recommendation.title}\n\n- Risk: ${recommendation.risk}\n- Location: \`${recommendation.file}:${recommendation.lines.join(',')}\`\n- Why: ${recommendation.why}\n- Suggested next step: ${recommendation.suggestedAction}\n- Affected modules: ${recommendation.affectedModules.map((module) => `\`${module}\``).join(', ') || 'none detected'}\n\n### Safe sequence\n\n${recommendation.steps.map((step, index) => `${index + 1}. **${step.phase}** — ${step.instruction}`).join('\n')}\n\n### Stop and ask for review if\n\n${recommendation.stopIf.map((condition) => `- ${condition}`).join('\n')}\n`).join('\n') : 'No supervised refactor recommendations found.';
  writeFileSync(markdownPath, `# YCF refactor plan\n\nThis is a plan only. YCF has not modified source code.\n\n- Safe refactors to review: ${plan.summary.safeRefactors}\n- Architectural reviews: ${plan.summary.architecturalReviews}\n\n${recommendations}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

export function writeReleaseReport(target: string, report: ReleaseReport, language: Language = 'en'): { jsonPath: string; markdownPath: string } {
  const output = join(resolve(target), '.ycf');
  mkdirSync(output, { recursive: true });
  const jsonPath = join(output, 'release-readiness.json');
  const markdownPath = join(output, 'release-readiness.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const checks = report.checks.map((check) => `- ${releaseCheckLabel(language, check)}`).join('\n');
  writeFileSync(markdownPath, `# YCF — ${releaseHeading(language, report.ready)}\n\n${releaseCheckedLabel(language)}: ${report.checkedAt}\n\n${checks}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

export function architectureDiff(before: UnderstandReport['graph'] | undefined, after: UnderstandReport['graph'] | undefined): { addedModules: string[]; removedModules: string[]; addedEdges: number; removedEdges: number; cyclesBefore: number; cyclesAfter: number } {
  const beforeFiles = new Set((before?.nodes ?? []).map((node) => node.file));
  const afterFiles = new Set((after?.nodes ?? []).map((node) => node.file));
  const edgeKey = (edge: { from: string; to: string }) => `${edge.from}->${edge.to}`;
  const beforeEdges = new Set((before?.edges ?? []).map(edgeKey));
  const afterEdges = new Set((after?.edges ?? []).map(edgeKey));
  return {
    addedModules: [...afterFiles].filter((file) => !beforeFiles.has(file)).sort(),
    removedModules: [...beforeFiles].filter((file) => !afterFiles.has(file)).sort(),
    addedEdges: [...afterEdges].filter((edge) => !beforeEdges.has(edge)).length,
    removedEdges: [...beforeEdges].filter((edge) => !afterEdges.has(edge)).length,
    cyclesBefore: before?.cycles.length ?? 0,
    cyclesAfter: after?.cycles.length ?? 0
  };
}

export function writeRefactorExecutionReport(target: string, report: RefactorExecutionReport): { jsonPath: string; markdownPath: string } {
  const output = join(resolve(target), '.ycf');
  mkdirSync(output, { recursive: true });
  const jsonPath = join(output, 'refactor-execution.json');
  const markdownPath = join(output, 'refactor-execution.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const diff = architectureDiff(report.before?.architecture, report.after?.architecture);
  const blocks = report.blocks.length ? report.blocks.map((block) => `- \`${block.id}\` **${block.status}** -- ${block.goal}`).join('\n') : '- No blocks.';
  writeFileSync(markdownPath, `# YCF refactor execution report\n\nStatus: **${report.status.toUpperCase()}**\n\nStarted: ${report.startedAt}\nCompleted: ${report.completedAt}\n\n## Architecture\n\n- Modules added: ${diff.addedModules.map((file) => `\`${file}\``).join(', ') || 'none'}\n- Modules removed: ${diff.removedModules.map((file) => `\`${file}\``).join(', ') || 'none'}\n- Import edges added: ${diff.addedEdges}\n- Import edges removed: ${diff.removedEdges}\n- Dependency cycles before: ${diff.cyclesBefore}\n- Dependency cycles after: ${diff.cyclesAfter}\n\n## Blocks\n\n${blocks}\n\n## Rollback events\n\n${report.rollbackEvents.length ? report.rollbackEvents.map((event) => `- \`${event.blockId}\`: ${event.reason} (undone: ${event.operationsUndone.join(', ') || 'none'})`).join('\n') : '- None.'}\n`, 'utf8');
  return { jsonPath, markdownPath };
}

export function writeDependencyAuditReport(target: string, report: DependencyAuditReport): { jsonPath: string; markdownPath: string } {
  const output = join(resolve(target), '.ycf');
  mkdirSync(output, { recursive: true });
  const jsonPath = join(output, 'dependencies.json');
  const markdownPath = join(output, 'dependencies.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const vulnerabilities = report.vulnerabilities.length ? report.vulnerabilities.map((item) => `- **${item.severity.toUpperCase()}** ${item.name}${item.fixAvailable ? ' — update available' : ''}`).join('\n') : '- No reported production dependency vulnerabilities.';
  writeFileSync(markdownPath, `# YCF dependency audit\n\n- Manager: ${report.manager}\n- Available: ${report.available ? 'yes' : 'no'}\n- Command: \`${report.command.join(' ')}\`\n- Error: ${report.error ?? 'none'}\n\n## Vulnerabilities\n\n${vulnerabilities}\n`, 'utf8');
  return { jsonPath, markdownPath };
}
