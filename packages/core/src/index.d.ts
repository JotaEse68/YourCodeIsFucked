export type Stack = 'javascript' | 'typescript' | 'react' | 'php' | 'wordpress';
export interface GitState {
    detected: boolean;
    root?: string;
}
export interface AuditReport {
    version: 1;
    target: string;
    auditedAt: string;
    readOnly: true;
    stacks: Stack[];
    sourceFiles: number;
    git: GitState;
    findings: [];
    score: {
        fucked: number;
        health: number;
        method: 'deterministic-v1';
    };
}
export declare function detectStacks(target: string): Stack[];
export declare function findGitRoot(start: string): GitState;
export declare function audit(target: string): AuditReport;
