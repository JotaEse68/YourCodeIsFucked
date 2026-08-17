import type { Finding, RefactorPlan as LegacyRefactorPlan } from './types.js';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SafetyMode = 'SAFE' | 'SUPERVISED' | 'BLOCKED';
export type RefactorBlockStatus = 'PLANNED' | 'READY' | 'RUNNING' | 'VERIFIED' | 'FAILED' | 'ROLLED_BACK' | 'SUPERVISED' | 'BLOCKED';
export type RefactorOperationKind = 'MOVE' | 'RENAME' | 'CREATE' | 'DELETE' | 'EDIT_IMPORT' | 'EDIT_EXPORT' | 'EXTRACT' | 'CONSOLIDATE';
export type VerificationMode = 'FAST' | 'FULL';

export interface RefactorOperationBase { id: string; kind: RefactorOperationKind; description: string; }
export type RefactorOperation =
  | (RefactorOperationBase & { kind: 'MOVE' | 'RENAME'; source: string; destination: string; updateImports: boolean })
  | (RefactorOperationBase & { kind: 'CREATE'; file: string; content: string })
  | (RefactorOperationBase & { kind: 'DELETE'; file: string; })
  | (RefactorOperationBase & { kind: 'EDIT_IMPORT' | 'EDIT_EXPORT'; file: string; replacements: Array<{ from: string; to: string }> })
  | (RefactorOperationBase & { kind: 'EXTRACT'; sourceFile: string; targetFile: string; range: { startLine: number; endLine: number }; exportedNames: string[] })
  | (RefactorOperationBase & { kind: 'CONSOLIDATE'; canonicalFile: string; duplicateFile: string; symbol: string });

export interface VerificationStep { id: string; name: 'lint' | 'typecheck' | 'test' | 'build' | 'security' | 'custom'; command: string[]; required: boolean; mode?: VerificationMode; }
export interface RollbackStep { id?: string; kind: 'git-checkpoint' | 'restore-file' | 'reverse-imports' | 'undo-operation'; description: string; }

export interface RefactorBlock {
  id: string; type: string; goal: string; reason: string; risk: RiskLevel; confidence: number; mode: SafetyMode;
  files: string[]; dependencies: string[]; affectedModules: string[]; preconditions: string[];
  operations: RefactorOperation[]; validation: VerificationStep[]; validations?: VerificationStep[]; rollback: RollbackStep[]; status: RefactorBlockStatus;
  result?: { changedFiles: string[]; diffSummary: string; verificationPassed: boolean; error?: string; verification?: unknown };
}

export interface OperationRecord { operationId: string; kind: RefactorOperationKind; changedFiles: string[]; description: string; undone: boolean; }
export interface RollbackEvent { blockId: string; reason: string; operationsUndone: string[]; isolated: true; }
export interface ModuleImportEdge { file: string; imports: string[]; }
export interface RefactorExecutionReport {
  version: 2; target: string; startedAt: string; completedAt: string; status: 'planned' | 'completed' | 'partial' | 'failed';
  blocks: RefactorBlock[]; keptBlocks: string[]; rolledBackBlocks: string[]; blockedBlocks: string[]; operationLog: OperationRecord[]; rollbackEvents: RollbackEvent[];
  before?: { files: string[]; architecture: ModuleImportEdge[] }; after?: { files: string[]; architecture: ModuleImportEdge[] };
}

export interface ArchitecturalRefactorPlan {
  version: 2; target: string; generatedAt: string; blocks: RefactorBlock[];
  summary: { auto: number; safeRefactor: number; supervised: number; architectural: number; blocked: number };
  sourceFindings: Finding['id'][]; legacyPlan?: LegacyRefactorPlan;
}
