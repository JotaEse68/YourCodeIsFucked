import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { releaseCheckLabel, releaseCheckedLabel, releaseHeading } from './i18n.js';
import type { AuditReport, DependencyAuditReport, Language, RefactorPlan, ReleaseReport, UnfuckReport } from './types.js';
import type { ModuleImportEdge, RefactorExecutionReport } from './refactor-types.js';

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

function architectureDiffMarkdown(before: ModuleImportEdge[] = [], after: ModuleImportEdge[] = []): string {
  const beforeMap = new Map(before.map((edge) => [edge.file, edge.imports]));
  const afterMap = new Map(after.map((edge) => [edge.file, edge.imports]));
  const added = [...afterMap.keys()].filter((file) => !beforeMap.has(file)).sort();
  const removed = [...beforeMap.keys()].filter((file) => !afterMap.has(file)).sort();
  const changed = [...afterMap.keys()].filter((file) => beforeMap.has(file) && (beforeMap.get(file) ?? []).join('|') !== (afterMap.get(file) ?? []).join('|')).sort();
  const sections: string[] = [];
  if (added.length) sections.push(`**New modules:**\n${added.map((file) => `- \`${file}\``).join('\n')}`);
  if (removed.length) sections.push(`**Removed modules:**\n${removed.map((file) => `- \`${file}\``).join('\n')}`);
  if (changed.length) sections.push(`**Changed import edges:**\n${changed.map((file) => `- \`${file}\`: ${(beforeMap.get(file) ?? []).join(', ') || '(none)'} → ${(afterMap.get(file) ?? []).join(', ') || '(none)'}`).join('\n')}`);
  return sections.length ? sections.join('\n\n') : 'No architectural changes detected.';
}

export function writeRefactorExecutionReport(target: string, report: RefactorExecutionReport): { jsonPath: string; markdownPath: string } {
  const output = join(resolve(target), '.ycf');
  mkdirSync(output, { recursive: true });
  const jsonPath = join(output, 'refactor-execution.json');
  const markdownPath = join(output, 'refactor-execution.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const blocks = report.blocks.length ? report.blocks.map((block) => `- \`${block.id}\`: **${block.status}**${block.result?.error ? ` — ${block.result.error}` : ''}`).join('\n') : '- No blocks.';
  writeFileSync(markdownPath, `# YCF refactor execution\n\nStatus: **${report.status.toUpperCase()}**\n\n- Verified: ${report.keptBlocks.join(', ') || 'none'}\n- Rolled back: ${report.rolledBackBlocks.join(', ') || 'none'}\n- Blocked/supervised: ${report.blockedBlocks.join(', ') || 'none'}\n\n## Blocks\n\n${blocks}\n\n## Architecture (before → after)\n\n${architectureDiffMarkdown(report.before?.architecture, report.after?.architecture)}\n`, 'utf8');
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
