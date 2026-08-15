import { basename } from 'node:path';
import type { RiskLevel, SafetyMode } from './refactor-types.js';

const supervisedPatterns: Array<[RegExp, string]> = [
  [/auth|login|session|token|password|permission|role/i, 'authentication or permissions'],
  [/billing|payment|stripe|checkout|invoice/i, 'payments or billing'],
  [/migration|schema|database|prisma|sequelize|typeorm/i, 'database or migrations'],
  [/webhook|rest|route|api/i, 'public API or webhooks'],
  [/wordpress|wp-|add_action|add_filter|shortcode|ajax|cron|woocommerce/i, 'dynamic framework callbacks'],
  [/reflect|container|inject|dependency\s*injection|dynamic\s*import/i, 'reflection, dependency injection, or dynamic imports']
];
const blockedPatterns: Array<[RegExp, string]> = [
  [/(?:import|require)\s*\(\s*[`"'][^`"']*[+$]/i, 'unresolvable dynamic module path'],
  [/eval\s*\(|new\s+Function\s*\(/i, 'runtime-generated code']
];

export interface SafetyAssessment { risk: RiskLevel; mode: SafetyMode; confidence: number; signals: string[]; reason: string; }
export function assessRefactorSafety(files: string[], contents: Map<string, string>): SafetyAssessment {
  const supervised = new Set<string>(); const blocked = new Set<string>();
  for (const file of files) { const text = `${basename(file)} ${file}\n${contents.get(file) ?? ''}`; for (const [pattern, label] of supervisedPatterns) if (pattern.test(text)) supervised.add(label); for (const [pattern, label] of blockedPatterns) if (pattern.test(text)) blocked.add(label); }
  if (blocked.size) return { risk: 'CRITICAL', mode: 'BLOCKED', confidence: 98, signals: [...blocked], reason: `Cannot resolve safely: ${[...blocked].join(', ')}.` };
  if (supervised.size) return { risk: 'HIGH', mode: 'SUPERVISED', confidence: 86, signals: [...supervised], reason: `Protected area detected: ${[...supervised].join(', ')}.` };
  return { risk: 'LOW', mode: 'SAFE', confidence: 96, signals: [], reason: 'No protected dynamic or high-impact area detected statically.' };
}
