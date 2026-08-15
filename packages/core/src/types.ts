export type Stack = 'javascript' | 'typescript' | 'react' | 'php' | 'wordpress';
export type FindingRisk = 'report-only' | 'auto' | 'safe-refactor' | 'architectural';
export type Language = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'it' | 'ar' | 'zh';
export type Audience = 'guided' | 'technical' | 'professional';

export interface GitState { detected: boolean; root?: string; }
export interface Finding {
  id: string;
  ruleId: 'debug-statements' | 'debug-console' | 'unused-import' | 'ai-residue' | 'suspicious-filename' | 'large-source-file' | 'long-function' | 'large-react-component' | 'react-effect-without-dependencies' | 'wordpress-dynamic-entrypoint' | 'wordpress-dynamic-callback-review' | 'wordpress-rest-route-permission' | 'wordpress-rest-route-public' | 'wordpress-rest-route-protected' | 'wordpress-rest-route-permission-review' | 'wordpress-rest-route-callback-review' | 'wordpress-rest-persistence-review' | 'wordpress-wpdb-unprepared-query' | 'wordpress-ajax-nonce-review' | 'wordpress-ajax-capability-review' | 'wordpress-cross-file-data-flow-review' | 'wordpress-unsanitized-input' | 'wordpress-unescaped-output' | 'high-complexity' | 'duplicate-code' | 'unused-production-dependency';
  severity: 'low' | 'medium'; risk: FindingRisk; file: string; lines: number[]; evidence: string; scoreImpact: number;
}
export interface AuditReport {
  version: 1; target: string; auditedAt: string; readOnly: true; stacks: Stack[]; sourceFiles: number; git: GitState; findings: Finding[];
  score: { fucked: number; health: number; method: 'deterministic-v1' };
}
export interface YcfConfig {
  version: 1; mode: 'conservative' | 'balanced' | 'aggressive'; language: Language; audience: Audience;
  refactor: { maxFileLines: number; maxFunctionLines: number; maxComplexity: number }; ignore: string[];
}
export interface UnderstandReport {
  version: 1; target: string; generatedAt: string; stacks: Stack[]; sourceFiles: number;
  modules: Array<{ path: string; extension: string; lines: number }>;
  dependencies: Array<{ from: string; to: string }>;
  hotspots: Array<{ path: string; lines: number; reason: string }>;
  duplicates: Array<{ id: string; lines: number; occurrences: Array<{ file: string; startLine: number; endLine: number }> }>;
  risks: Finding[];
  graph: {
    nodes: Array<{ id: string; file: string; kind: 'module' | 'entry-point'; entryPoint: boolean }>;
    edges: Array<{ from: string; to: string; kind: 'import' }>;
    cycles: string[][];
  };
}
export interface VerificationCheck { name: 'lint' | 'typecheck' | 'test' | 'build'; command: string[]; status: 'passed' | 'failed' | 'skipped'; output?: string; }
export interface VerificationReport { target: string; verifiedAt: string; checks: VerificationCheck[]; passed: boolean; }
export interface ReleaseCheck { name: 'git' | 'audit' | 'architecture' | 'verification' | 'documentation'; status: 'passed' | 'warning' | 'failed'; detail: string; }
export interface ReleaseReport {
  target: string; checkedAt: string; ready: boolean; checks: ReleaseCheck[];
  audit: AuditReport; verification: VerificationReport; cycles: string[][];
}
export interface GitCheckpoint { ref: string; commit: string; createdAt: string; }
export interface CleanupReport {
  target: string; changedFiles: Array<{ file: string; removedDebugStatements: number; removedDebugConsoleCalls: number; removedUnusedImports: number }>;
  skippedFiles: Array<{ file: string; reason: string }>; removedDebugStatements: number; removedDebugConsoleCalls: number; removedUnusedImports: number;
}
export interface UnfuckReport {
  target: string; startedAt: string; completedAt: string; status: 'no-changes' | 'verified' | 'rolled-back'; before: AuditReport; after: AuditReport;
  checkpoint?: GitCheckpoint; cleanup?: CleanupReport; verification?: VerificationReport;
}
export interface RefactorRecommendation {
  id: string; title: string; risk: FindingRisk; file: string; lines: number[]; why: string; suggestedAction: string;
  affectedModules: string[]; requiresHumanReview: boolean;
}
export interface RefactorPlan {
  target: string; generatedAt: string; recommendations: RefactorRecommendation[];
  summary: { safeRefactors: number; architecturalReviews: number; total: number };
}
