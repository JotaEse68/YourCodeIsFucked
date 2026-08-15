import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findGitRoot } from './git.js';
import { verify } from './verify.js';
import type { AuditReport, ReleaseCheck, ReleaseReport, UnderstandReport } from './types.js';

function gitCheck(target: string): ReleaseCheck {
  const git = findGitRoot(target);
  if (!git.detected || !git.root) return { name: 'git', status: 'warning', detail: 'Git was not detected. Create a repository before publishing so changes can be traced and recovered.' };
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: git.root, encoding: 'utf8' });
  if (result.status !== 0) return { name: 'git', status: 'warning', detail: 'Git status could not be checked. Review the repository manually before publishing.' };
  return result.stdout.trim()
    ? { name: 'git', status: 'failed', detail: 'The worktree has uncommitted changes. Commit, stash, or discard them before publishing.' }
    : { name: 'git', status: 'passed', detail: 'Git worktree is clean.' };
}

export function createReleaseReadiness(audit: (target: string) => AuditReport, understand: (target: string) => UnderstandReport): (target: string) => ReleaseReport {
  return (target: string) => {
    const directory = resolve(target);
    const auditReport = audit(directory);
    const architecture = understand(directory);
    const verification = verify(directory);
    const mediumFindings = auditReport.findings.filter((finding) => finding.severity === 'medium');
    const lowFindings = auditReport.findings.filter((finding) => finding.severity === 'low');
    const ranChecks = verification.checks.filter((check) => check.status !== 'skipped');
    const checks: ReleaseCheck[] = [
      gitCheck(directory),
      mediumFindings.length
        ? { name: 'audit', status: 'failed', detail: `${mediumFindings.length} medium-risk finding(s) need human review before publishing.` }
        : lowFindings.length
          ? { name: 'audit', status: 'warning', detail: `${lowFindings.length} low-risk finding(s) remain. Review them before publishing.` }
          : { name: 'audit', status: 'passed', detail: 'No audit findings were detected.' },
      architecture.graph.cycles.length
        ? { name: 'architecture', status: 'warning', detail: `${architecture.graph.cycles.length} dependency cycle(s) were found. Review the map before publishing.` }
        : { name: 'architecture', status: 'passed', detail: 'No local dependency cycles were detected.' },
      !verification.passed
        ? { name: 'verification', status: 'failed', detail: 'At least one declared verification script failed.' }
        : ranChecks.length === 0
          ? { name: 'verification', status: 'warning', detail: 'No lint, typecheck, test, or build scripts are declared. Verify the project manually.' }
          : { name: 'verification', status: 'passed', detail: `${ranChecks.length} declared verification check(s) passed.` },
      existsSync(join(directory, 'README.md'))
        ? { name: 'documentation', status: 'passed', detail: 'README.md is present.' }
        : { name: 'documentation', status: 'warning', detail: 'README.md was not found. Add basic usage and safety documentation before publishing.' }
    ];
    return { target: directory, checkedAt: new Date().toISOString(), ready: !checks.some((check) => check.status === 'failed'), checks, audit: auditReport, verification, cycles: architecture.graph.cycles };
  };
}
