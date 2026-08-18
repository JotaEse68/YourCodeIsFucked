import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyRefactorOperation } from './refactor-operations.js';

describe('CONSOLIDATE safety', () => {
  it('blocks consolidating a file that is re-exported from package.json exports', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-consolidate-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('package.json', JSON.stringify({ name: 'fixture', exports: { './extra': './src/duplicate.js' } }));
    write('src/canonical.js', 'export const value = 1;\n');
    write('src/duplicate.js', 'export const value = 1;\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'CONSOLIDATE', description: 'test', canonicalFile: 'src/canonical.js', duplicateFile: 'src/duplicate.js', symbol: 'value' })).toThrow(/BLOCKED/);
  });

  it('blocks (not SUPERVISED) consolidating a non-identical file that is referenced from package.json exports', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-consolidate-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('package.json', JSON.stringify({ name: 'fixture', exports: { './extra': './src/duplicate.js' } }));
    write('src/canonical.js', 'export const value = 1;\n');
    write('src/duplicate.js', 'export const value = 2;\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'CONSOLIDATE', description: 'test', canonicalFile: 'src/canonical.js', duplicateFile: 'src/duplicate.js', symbol: 'value' })).toThrow(/BLOCKED/);
  });

  it('blocks consolidating a file that is re-exported from another module', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-consolidate-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('src/canonical.js', 'export const value = 1;\n');
    write('src/duplicate.js', 'export const value = 1;\n');
    write('src/index.js', "export { value } from './duplicate.js';\n");
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'CONSOLIDATE', description: 'test', canonicalFile: 'src/canonical.js', duplicateFile: 'src/duplicate.js', symbol: 'value' })).toThrow(/BLOCKED/);
  });

  it('refuses to consolidate a duplicate that sits in a protected area (auth/billing/webhooks/etc)', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-consolidate-protected-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('src/webhook-handler.ts', 'export const handle = () => true;\n');
    write('src/webhook-handler-copy.ts', 'export const handle = () => true;\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'CONSOLIDATE', description: 'must not auto-merge a webhook handler', canonicalFile: 'src/webhook-handler.ts', duplicateFile: 'src/webhook-handler-copy.ts', symbol: 'handle' })).toThrow(/^SUPERVISED:/);
    expect(existsSync(join(target, 'src/webhook-handler-copy.ts'))).toBe(true);
  });

  it('refuses to consolidate a duplicate that is a public package.json entry point (main/exports/bin/types)', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-consolidate-entrypoint-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('package.json', JSON.stringify({ name: 'fixture', main: './lib/entry.ts', exports: { '.': './lib/entry.ts' } }));
    write('lib/entry.ts', 'export const value = 1;\n');
    write('lib/entry-copy.ts', 'export const value = 1;\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'CONSOLIDATE', description: 'must not auto-merge a public entry point', canonicalFile: 'lib/entry-copy.ts', duplicateFile: 'lib/entry.ts', symbol: 'value' })).toThrow(/BLOCKED/);
    expect(existsSync(join(target, 'lib/entry.ts'))).toBe(true);
  });
});
