import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recover, restoreBlock } from './recover.js';
import { beginCheckpointJournal, updateBlockCheckpoint, readCheckpointJournal } from './refactor-checkpoints.js';

function initGit(root: string) {
  const runGit = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  runGit(['init', '-q']); runGit(['config', 'user.email', 'ycf-test@example.com']); runGit(['config', 'user.name', 'YCF Test']);
  // Real YCF repos gitignore .ycf (see the repo's own top-level .gitignore) so the
  // checkpoint journal is never part of what `git reset --hard` rewinds. Match that here --
  // otherwise a test's own `git add -A` would sweep the journal into a later commit and a
  // restore back past that commit would delete the journal file along with it.
  writeFileSync(join(root, '.gitignore'), '.ycf\n');
  runGit(['add', '.gitignore']); runGit(['commit', '-qm', 'gitignore']);
  return runGit;
}

describe('recover', () => {
  it('returns no journal when none exists on disk', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    expect(recover(target).journal).toBeUndefined();
  });

  it('returns the journal unmodified, without touching the working tree', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const context = beginCheckpointJournal(target, ['RF-001']);
    updateBlockCheckpoint(context, 'RF-001', 'RUNNING');
    const before = readFileSync(join(target, 'source.ts'), 'utf8');
    const report = recover(target);
    expect(report.journal?.blocks[0]).toMatchObject({ blockId: 'RF-001', status: 'RUNNING' });
    expect(readFileSync(join(target, 'source.ts'), 'utf8')).toBe(before);
  });
});

describe('restoreBlock', () => {
  it('refuses an unknown blockId without running Git', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    expect(restoreBlock(target, 'RF-UNKNOWN')).toEqual({ restored: false, reason: 'No block "RF-UNKNOWN" in the checkpoint journal.' });
  });

  it('refuses a block with no recorded ref', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    beginCheckpointJournal(target, ['RF-001']);
    expect(restoreBlock(target, 'RF-001')).toEqual({ restored: false, reason: 'Block "RF-001" has no recorded checkpoint ref to restore to.' });
  });

  it('resets the working tree to the block\'s recorded checkpoint commit', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    const file = join(target, 'source.ts');
    writeFileSync(file, 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const context = beginCheckpointJournal(target, ['RF-001']);
    updateBlockCheckpoint(context, 'RF-001', 'RUNNING');
    writeFileSync(file, 'export const value = 2;\n');
    runGit(['add', '-A']); runGit(['commit', '-qm', 'changed']);
    const result = restoreBlock(target, 'RF-001');
    expect(result.restored).toBe(true);
    // git reset --hard re-checks out the file, which on Windows may re-apply core.autocrlf
    // and turn LF into CRLF even though the committed blob is LF -- normalize before comparing.
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe('export const value = 1;\n');
    // The checkpoint journal must reflect the restore, otherwise `ycf next` would report
    // this block as unfinished forever after a successful restore.
    const journal = readCheckpointJournal(target);
    expect(journal?.blocks.find((entry) => entry.blockId === 'RF-001')?.status).toBe('ROLLED_BACK');
  });

  it('returns { restored: false, reason } instead of throwing when the working tree is dirty', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    const file = join(target, 'source.ts');
    writeFileSync(file, 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const context = beginCheckpointJournal(target, ['RF-001']);
    updateBlockCheckpoint(context, 'RF-001', 'RUNNING');
    writeFileSync(file, 'export const value = 2;\n');
    runGit(['add', '-A']); runGit(['commit', '-qm', 'changed']);
    // Leave an uncommitted change in the working tree so rollbackToCheckpoint refuses.
    writeFileSync(file, 'export const value = 3; // uncommitted\n');
    const result = restoreBlock(target, 'RF-001');
    expect(result.restored).toBe(false);
    if (!result.restored) expect(result.reason.length).toBeGreaterThan(0);
    // Nothing should have been reset -- the uncommitted content must be untouched.
    expect(readFileSync(file, 'utf8')).toBe('export const value = 3; // uncommitted\n');
  });
});
