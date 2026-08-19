export type Stack = 'javascript' | 'typescript' | 'react' | 'php' | 'wordpress';
export type FindingRisk = 'report-only' | 'auto' | 'safe-refactor' | 'architectural';
export type Language = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'ar' | 'zh';
export type Audience = 'guided' | 'technical' | 'professional';

export interface GitState { detected: boolean; root?: string; }
export interface Finding {
  id: string;
  ruleId: 'debug-statements' | 'debug-console' | 'unused-import' | 'ai-residue' | 'suspicious-filename' | 'dead-code' | 'god-component' | 'mystery-helper' | 'todo-from-hell' | 'dependency-nobody-uses' | 'sensitive-repository-file' | 'sensitive-repository-file-tracked' | 'sensitive-repository-file-protected' | 'large-source-file' | 'long-function' | 'large-react-component' | 'react-effect-without-dependencies' | 'react-async-effect-without-cleanup' | 'typescript-error-suppression' | 'typescript-public-any' | 'wordpress-dynamic-entrypoint' | 'wordpress-dynamic-callback-review' | 'wordpress-production-debug-config' | 'wordpress-hardcoded-config-secret' | 'wordpress-file-editor-config' | 'wordpress-rest-route-permission' | 'wordpress-rest-route-public' | 'wordpress-rest-route-protected' | 'wordpress-rest-route-permission-review' | 'wordpress-rest-route-callback-review' | 'wordpress-rest-persistence-review' | 'wordpress-wpdb-unprepared-query' | 'wordpress-destructive-operation-review' | 'wordpress-privilege-escalation-review' | 'wordpress-sensitive-data-exposure' | 'wordpress-ajax-nonce-review' | 'wordpress-ajax-capability-review' | 'wordpress-cross-file-data-flow-review' | 'wordpress-unsanitized-input' | 'wordpress-unescaped-output' | 'high-complexity' | 'duplicate-code' | 'similar-duplicate-code' | 'possible-semantic-duplicate' | 'redundant-comment' | 'unused-production-dependency';
  severity: 'low' | 'medium'; risk: FindingRisk; file: string; lines: number[]; evidence: string; scoreImpact: number;
}

export const SECURITY_RELEVANT_RULE_IDS: Finding['ruleId'][] = ['sensitive-repository-file', 'sensitive-repository-file-tracked', 'wordpress-hardcoded-config-secret', 'wordpress-wpdb-unprepared-query', 'wordpress-unsanitized-input', 'wordpress-unescaped-output', 'wordpress-rest-route-permission', 'wordpress-ajax-nonce-review', 'wordpress-ajax-capability-review', 'wordpress-sensitive-data-exposure', 'typescript-error-suppression'];
export interface AuditReport {
  version: 1; target: string; auditedAt: string; readOnly: true; stacks: Stack[]; sourceFiles: number; git: GitState; findings: Finding[];
  autoIgnored: AutoIgnoredDirectory[];
  score: { fucked: number; health: number; method: 'deterministic-v1'; dimensions: { architecture: number; maintainability: number; security: number; tests: number; documentation: number } };
}
export interface YcfConfig {
  version: 1; mode: 'conservative' | 'balanced' | 'aggressive'; language: Language; audience: Audience;
  refactor: { maxFileLines: number; maxFunctionLines: number; maxComplexity: number }; ignore: string[]; include: string[];
}
export interface AutoIgnoredDirectory { path: string; reason: 'vendored-sdk'; files: number; }
export interface DuplicateGroup {
  id: string; kind: 'exact' | 'similar' | 'semantic'; certainty: 'confirmed' | 'likely' | 'possible'; similarity: number; lines: number;
  occurrences: Array<{ file: string; startLine: number; endLine: number }>;
}
export interface UnderstandReport {
  version: 1; target: string; generatedAt: string; stacks: Stack[]; sourceFiles: number;
  modules: Array<{ path: string; extension: string; lines: number }>;
  dependencies: Array<{ from: string; to: string }>;
  hotspots: Array<{ path: string; lines: number; reason: string }>;
  duplicates: DuplicateGroup[];
  risks: Finding[];
  graph: {
    nodes: Array<{ id: string; file: string; kind: 'module' | 'entry-point'; entryPoint: boolean }>;
    edges: Array<{ from: string; to: string; kind: 'import' }>;
    cycles: string[][];
  };
}
export interface ImpactReport {
  version: 1; target: string; module: string; found: boolean; readOnly: true;
  directDependencies: string[]; dependencies: string[];
  directDependents: string[]; dependents: string[];
  cycles: string[][];
  limitation: string;
}
export interface VerificationCheck { name: 'lint' | 'typecheck' | 'test' | 'build'; command: string[]; status: 'passed' | 'failed' | 'skipped'; output?: string; }
export interface VerificationReport { target: string; verifiedAt: string; checks: VerificationCheck[]; passed: boolean; }
export interface DependencyVulnerability { name: string; severity: 'low' | 'moderate' | 'high' | 'critical' | 'unknown'; fixAvailable: boolean; }
export interface DependencyAuditReport { target: string; auditedAt: string; manager: 'npm' | 'pnpm' | 'unknown'; command: string[]; available: boolean; vulnerabilities: DependencyVulnerability[]; error?: string; }
export interface ReleaseCheck { name: 'git' | 'audit' | 'architecture' | 'verification' | 'documentation' | 'dependencies'; status: 'passed' | 'warning' | 'failed'; detail: string; }
export interface ReleaseReport {
  target: string; checkedAt: string; ready: boolean; checks: ReleaseCheck[];
  audit: AuditReport; verification: VerificationReport; cycles: string[][]; dependencyAudit?: DependencyAuditReport;
}
export interface GitCheckpoint { ref: string; commit: string; createdAt: string; }
export interface CleanupReport {
  target: string; changedFiles: Array<{ file: string; removedDebugStatements: number; removedDebugConsoleCalls: number; removedUnusedImports: number }>;
  skippedFiles: Array<{ file: string; reason: string }>; removedDebugStatements: number; removedDebugConsoleCalls: number; removedUnusedImports: number;
}
export interface AiResidueCleanupReport { target: string; changedFiles: Array<{ file: string; removedMarkers: number }>; removedMarkers: number; }
export interface UnfuckReport {
  target: string; startedAt: string; completedAt: string; status: 'no-changes' | 'verified' | 'rolled-back'; before: AuditReport; after: AuditReport;
  executionMode?: 'dry-run' | 'guided' | 'batch';
  steps?: Array<{ name: 'plan' | 'checkpoint' | 'cleanup' | 'verify' | 'report'; status: 'planned' | 'awaiting-approval' | 'completed' | 'skipped' | 'rolled-back'; detail?: string }>;
  checkpoint?: GitCheckpoint; cleanup?: CleanupReport; verification?: VerificationReport;
}
export interface RefactorRecommendation {
  id: string; title: string; risk: FindingRisk; file: string; lines: number[]; why: string; suggestedAction: string;
  affectedModules: string[]; requiresHumanReview: boolean;
  steps: Array<{ phase: 'inspect' | 'change' | 'verify'; instruction: string }>;
  stopIf: string[];
}
export interface RefactorPlan {
  target: string; generatedAt: string; language: Language; audience: Audience; recommendations: RefactorRecommendation[];
  summary: { safeRefactors: number; architecturalReviews: number; total: number };
}
