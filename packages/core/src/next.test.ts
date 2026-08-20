import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { next } from './next.js';
import { beginCheckpointJournal, updateBlockCheckpoint } from './refactor-checkpoints.js';

// beginCheckpointJournal() requires `git rev-parse HEAD` to succeed (it records the base
// commit); on a bare mkdtempSync() directory that is not a Git repository, it silently
// returns undefined and never writes a journal to disk, which would make every "blocked"
// assertion below fail for an unrelated reason. Same helper as recover.test.ts.
function initGit(root: string) {
  const runGit = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  runGit(['init', '-q']); runGit(['config', 'user.email', 'ycf-test@example.com']); runGit(['config', 'user.name', 'YCF Test']);
  return runGit;
}

describe('next', () => {
  it('short-circuits to a blocked report when a block is PENDING, without ranking findings', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-next-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    beginCheckpointJournal(target, ['RF-PENDING']);
    const report = next(target);
    expect(report.blocked).toEqual({ reason: 'unfinished-run', pendingBlockIds: ['RF-PENDING'] });
    expect(report.suggestions).toEqual([]);
  });

  it('short-circuits when a block is RUNNING', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-next-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const context = beginCheckpointJournal(target, ['RF-RUNNING']);
    updateBlockCheckpoint(context, 'RF-RUNNING', 'RUNNING');
    const report = next(target);
    expect(report.blocked?.pendingBlockIds).toEqual(['RF-RUNNING']);
  });

  // This fixture includes a package.json, but next() now uses basicStaticSecurityProvider
  // directly (not runSecurityChecks()), so it no longer spawns a real `npm audit` child
  // process via dependencySecurityProvider -- that network I/O is deliberately excluded
  // from this read-only command (see the comment in next.ts). No extended timeout needed.
  it('ranks a CONFIRMED-tier finding above a DIRECTIONAL-tier one, tier beating raw score', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-next-'));
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'fixture' }));
    // unsafe-eval has base confidence 95 (CONFIRMED); sql-injection-risk has base
    // confidence 70 (DIRECTIONAL) but a higher scoreImpact (7 vs 6) -- proving tier
    // ordering wins over raw scoreImpact is the entire point of this test.
    writeFileSync(join(target, 'src.ts'), "eval(userInput);\ndb.query(`SELECT * FROM users WHERE id = ${id}`);\n");
    const report = next(target);
    expect(report.blocked).toBeUndefined();
    const evalIndex = report.suggestions.findIndex((finding) => finding.ruleId === 'unsafe-eval');
    const sqlIndex = report.suggestions.findIndex((finding) => finding.ruleId === 'sql-injection-risk');
    expect(evalIndex).toBeGreaterThanOrEqual(0);
    expect(sqlIndex).toBeGreaterThanOrEqual(0);
    expect(evalIndex).toBeLessThan(sqlIndex);
  });

  it('does not duplicate a finding that both audit() and basicStaticSecurityProvider can produce', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-next-'));
    mkdirSync(join(target, 'includes'));
    writeFileSync(join(target, 'includes/query.php'), '<?php\n$wpdb->query("DELETE FROM wp_profiles WHERE id = $id");\n');
    const report = next(target);
    const matches = report.suggestions.filter((finding) => finding.ruleId === 'wordpress-wpdb-unprepared-query');
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});
