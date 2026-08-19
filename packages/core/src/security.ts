import { dependencyAudit } from './dependencies.js';
import type { DependencyVulnerability, Finding } from './types.js';

export interface SecurityCheckProvider { name: string; run(target: string, files: string[]): Finding[]; }

const severityToFindingSeverity: Record<DependencyVulnerability['severity'], Finding['severity']> = { critical: 'medium', high: 'medium', moderate: 'low', low: 'low', unknown: 'low' };
const severityScoreImpact: Record<DependencyVulnerability['severity'], number> = { critical: 8, high: 6, moderate: 3, low: 1, unknown: 1 };

export const dependencySecurityProvider: SecurityCheckProvider = {
  name: 'dependency-security',
  run(target) {
    const report = dependencyAudit(target);
    if (!report.available) return [];
    return report.vulnerabilities.map((vulnerability) => ({
      id: `dependency-vulnerability:${vulnerability.name}`,
      ruleId: 'dependency-vulnerability' as const,
      severity: severityToFindingSeverity[vulnerability.severity],
      risk: 'report-only' as const,
      file: 'package.json',
      lines: [],
      evidence: `${vulnerability.name}: ${vulnerability.severity} severity vulnerability${vulnerability.fixAvailable ? ' (a fix is available -- run your package manager\'s audit fix)' : ' (no automated fix available yet)'}.`,
      scoreImpact: severityScoreImpact[vulnerability.severity],
      sourceSeverity: vulnerability.severity
    }));
  }
};
