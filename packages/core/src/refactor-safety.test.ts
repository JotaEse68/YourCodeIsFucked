import { describe, expect, it } from 'vitest';
import { assessRefactorSafety } from './refactor-safety.js';

describe('assessRefactorSafety', () => {
  it('returns no evidence and confidence 96 for the SAFE mode when nothing matches', () => {
    const result = assessRefactorSafety(['src/util.ts'], new Map([['src/util.ts', 'export const util = () => 1;\n']]));
    expect(result.mode).toBe('SAFE');
    expect(result.evidence).toEqual([]);
    expect(result.confidence).toBe(96);
  });

  it('returns non-empty evidence, one item per matched label and file, when a protected area is detected', () => {
    const result = assessRefactorSafety(['src/auth.ts'], new Map([['src/auth.ts', 'export function login() {}\n']]));
    expect(result.mode).toBe('SUPERVISED');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.every((item) => item.file === 'src/auth.ts')).toBe(true);
    expect(result.confidence).toBe(86);
  });

  it('returns higher confidence when multiple files corroborate the same protected-area signal', () => {
    const single = assessRefactorSafety(['src/auth.ts'], new Map([['src/auth.ts', 'export function login() {}\n']]));
    const multi = assessRefactorSafety(['src/auth.ts', 'src/session.ts'], new Map([['src/auth.ts', 'export function login() {}\n'], ['src/session.ts', 'export function session() {}\n']]));
    expect(multi.confidence).toBeGreaterThan(single.confidence);
  });

  it('returns non-empty evidence and confidence 98 for a single blocked signal', () => {
    const result = assessRefactorSafety(['src/dyn.ts'], new Map([['src/dyn.ts', 'const mod = require(`./${name}`);\n']]));
    expect(result.mode).toBe('BLOCKED');
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.confidence).toBe(98);
  });
});
