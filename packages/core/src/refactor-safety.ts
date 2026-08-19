import { basename } from 'node:path';
import type { RiskLevel, SafetyMode } from './refactor-types.js';

// Patterns whose match means the file connects to something outside this repo's
// control (a payment/auth provider, a webhook caller, a database) -- see
// skills/ycf-quality-gate/references/reviewing-external-code.md. Kept separate from
// frameworkDynamicPatterns below: those are about static analysis blind spots
// (WordPress hooks, DI/reflection), not external connections, and still block
// auto-refactor but do not exclude a finding from the audit score.
export const externalConnectionPatterns: Array<[RegExp, string]> = [
  [/auth|login|session|token|password|permission|role/i, 'authentication or permissions'],
  [/billing|payment|stripe|checkout|invoice/i, 'payments or billing'],
  [/migration|schema|database|prisma|sequelize|typeorm/i, 'database or migrations'],
  [/webhook|rest|route|api/i, 'public API or webhooks']
];
const frameworkDynamicPatterns: Array<[RegExp, string]> = [
  [/wordpress|wp-|add_action|add_filter|shortcode|ajax|cron|woocommerce/i, 'dynamic framework callbacks'],
  [/reflect|container|inject|dependency\s*injection|dynamic\s*import/i, 'reflection, dependency injection, or dynamic imports']
];
const supervisedPatterns: Array<[RegExp, string]> = [...externalConnectionPatterns, ...frameworkDynamicPatterns];
export function isExternalConnectionFile(file: string, content: string): boolean {
  const text = `${basename(file)} ${file}\n${content}`;
  return externalConnectionPatterns.some(([pattern]) => pattern.test(text));
}
// Left word-boundary before "eval" so this doesn't match inside a larger identifier
// like dataRetrieval(, approval(, or removal( -- used with .test() only (never
// .exec()/match-extraction) in both this file and security.ts's unsafe-eval detector,
// where an unbounded match would produce a false status: 'confirmed' finding.
export const unsafeRuntimeCodePattern = /(?:^|[^\w$])eval\s*\(|new\s+Function\s*\(/i;
const blockedPatterns: Array<[RegExp, string]> = [
  [/(?:import|require)\s*\(\s*[`"'][^`"']*[+$]/i, 'unresolvable dynamic module path'],
  [unsafeRuntimeCodePattern, 'runtime-generated code']
];

export interface SafetyAssessment { risk: RiskLevel; mode: SafetyMode; confidence: number; signals: string[]; reason: string; }
export function assessRefactorSafety(files: string[], contents: Map<string, string>): SafetyAssessment {
  const supervised = new Set<string>(); const blocked = new Set<string>();
  for (const file of files) { const text = `${basename(file)} ${file}\n${contents.get(file) ?? ''}`; for (const [pattern, label] of supervisedPatterns) if (pattern.test(text)) supervised.add(label); for (const [pattern, label] of blockedPatterns) if (pattern.test(text)) blocked.add(label); }
  if (blocked.size) return { risk: 'CRITICAL', mode: 'BLOCKED', confidence: 98, signals: [...blocked], reason: `Cannot resolve safely: ${[...blocked].join(', ')}.` };
  if (supervised.size) return { risk: 'HIGH', mode: 'SUPERVISED', confidence: 86, signals: [...supervised], reason: `Protected area detected: ${[...supervised].join(', ')}.` };
  return { risk: 'LOW', mode: 'SAFE', confidence: 96, signals: [], reason: 'No protected dynamic or high-impact area detected statically.' };
}
