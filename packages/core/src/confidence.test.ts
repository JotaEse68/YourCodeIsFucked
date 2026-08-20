import { describe, expect, it } from 'vitest';
import { confidenceTier, computeConfidence } from './confidence.js';

describe('confidenceTier', () => {
  it('classifies boundary values into the correct tier', () => {
    expect(confidenceTier(89)).toBe('HIGH_CONFIDENCE');
    expect(confidenceTier(90)).toBe('CONFIRMED');
    expect(confidenceTier(74)).toBe('DIRECTIONAL');
    expect(confidenceTier(75)).toBe('HIGH_CONFIDENCE');
    expect(confidenceTier(49)).toBe('SPECULATIVE');
    expect(confidenceTier(50)).toBe('DIRECTIONAL');
  });
});

describe('computeConfidence', () => {
  it('adds no bonus for a single piece of evidence', () => {
    expect(computeConfidence(70, [{ file: 'a.ts', detail: 'match' }])).toBe(70);
  });

  it('adds a small bonus for multiple occurrences in the same file', () => {
    const evidence = [{ file: 'a.ts', detail: 'match' }, { file: 'a.ts', detail: 'match' }];
    expect(computeConfidence(70, evidence)).toBe(73);
  });

  it('adds a larger bonus for occurrences spanning multiple distinct files', () => {
    const evidence = [{ file: 'a.ts', detail: 'match' }, { file: 'b.ts', detail: 'match' }, { file: 'c.ts', detail: 'match' }];
    expect(computeConfidence(70, evidence)).toBe(80);
  });

  it('caps the bonus at 15 no matter how much evidence is supplied', () => {
    const evidence = Array.from({ length: 20 }, (_, index) => ({ file: `f${index}.ts`, detail: 'match' }));
    expect(computeConfidence(70, evidence)).toBe(85);
  });

  it('never exceeds 99 even with a high base and bonus', () => {
    const evidence = [{ file: 'a.ts', detail: 'x' }, { file: 'b.ts', detail: 'x' }, { file: 'c.ts', detail: 'x' }];
    expect(computeConfidence(95, evidence)).toBe(99);
  });

  it('returns exactly the base with no evidence at all', () => {
    expect(computeConfidence(96, [])).toBe(96);
  });
});
