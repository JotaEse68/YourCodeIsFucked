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

describe('EXTRACT relatedTestFiles', () => {
  it('identifies test files that reference the extracted export', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-extract-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('src/math.ts', 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    write('src/math.test.ts', "import { add } from './math.js';\nimport { test } from 'node:test';\ntest('adds', () => add(1, 2));\n");
    const result = applyRefactorOperation(target, { id: 'op-1', kind: 'EXTRACT', description: 'test', sourceFile: 'src/math.ts', targetFile: 'src/add.ts', range: { startLine: 1, endLine: 3 }, exportedNames: ['add'] });
    expect(result.relatedTestFiles).toContain('src/math.test.ts');
  });
});

describe('public-contract protection beyond CONSOLIDATE', () => {
  it('blocks MOVE of a file that is package.json main', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-contract-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('package.json', JSON.stringify({ name: 'fixture', main: './src/index.js' }));
    write('src/index.js', 'module.exports = {};\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move', source: 'src/index.js', destination: 'src/lib/index.js', updateImports: true })).toThrow(/BLOCKED/);
  });

  it('blocks RENAME of a barrel-re-exported file', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-contract-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('src/util.ts', 'export const helper = () => 1;\n');
    write('src/index.ts', "export * from './util.js';\n");
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'RENAME', description: 'rename', source: 'src/util.ts', destination: 'src/helper.ts', updateImports: true })).toThrow(/BLOCKED/);
  });

  it('blocks EXTRACT from a file that is package.json module', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-contract-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('package.json', JSON.stringify({ name: 'fixture', module: './src/entry.mjs' }));
    write('src/entry.mjs', 'export function add(a, b) {\n  return a + b;\n}\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'EXTRACT', description: 'extract', sourceFile: 'src/entry.mjs', targetFile: 'src/add.mjs', range: { startLine: 1, endLine: 3 }, exportedNames: ['add'] })).toThrow(/BLOCKED/);
  });

  it('still allows MOVE of an ordinary, non-public, non-re-exported file', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-contract-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('package.json', JSON.stringify({ name: 'fixture', main: './src/index.js' }));
    write('src/index.js', 'module.exports = {};\n');
    write('src/util.js', 'module.exports.helper = () => 1;\n');
    const result = applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move', source: 'src/util.js', destination: 'src/lib/util.js', updateImports: true });
    expect(result.changedFiles).toContain('src/util.js');
  });
});
