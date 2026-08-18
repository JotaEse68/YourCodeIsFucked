import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GitCheckpoint, GitState } from './types.js';

export function findGitRoot(start: string): GitState {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, '.git'))) return { detected: true, root: current };
    const parent = resolve(current, '..');
    if (parent === current) return { detected: false };
    current = parent;
  }
}

export function git(target: string, args: string[]): string { return execFileSync('git', ['-C', target, ...args], { encoding: 'utf8' }).trim(); }
function gitRootOrThrow(target: string): string {
  const state = findGitRoot(target);
  if (!state.detected || !state.root) throw new Error('This operation requires a Git repository.');
  return state.root;
}

export function createCheckpoint(target: string): GitCheckpoint {
  const root = gitRootOrThrow(resolve(target));
  if (git(root, ['status', '--porcelain'])) throw new Error('Refusing to create a checkpoint with uncommitted changes. Commit or stash them first.');
  const commit = git(root, ['rev-parse', 'HEAD']);
  const createdAt = new Date().toISOString();
  const ref = `refs/ycf/checkpoints/${createdAt.replace(/[:.]/g, '-')}`;
  git(root, ['update-ref', ref, commit]);
  return { ref, commit, createdAt };
}

export function latestCheckpoint(target: string): GitCheckpoint | undefined {
  const root = gitRootOrThrow(resolve(target));
  const ref = git(root, ['for-each-ref', '--sort=-creatordate', '--format=%(refname)', 'refs/ycf/checkpoints']).split(/\r?\n/)[0];
  if (!ref) return undefined;
  return { ref, commit: git(root, ['rev-parse', ref]), createdAt: ref.split('/').at(-1)?.replace(/-(\d{3})$/, '.$1').replace(/(\d{2})-(\d{2})-(\d{2})-(\d{3})$/, '$1:$2:$3.$4') ?? '' };
}

export function rollbackToCheckpoint(target: string, checkpoint: GitCheckpoint): void {
  const root = gitRootOrThrow(resolve(target));
  if (git(root, ['status', '--porcelain'])) throw new Error('Refusing rollback with uncommitted changes. Commit or stash them first.');
  git(root, ['reset', '--hard', checkpoint.commit]);
}
