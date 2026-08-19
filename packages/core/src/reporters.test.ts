import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeReorganizationReport } from './reporters.js';

describe('writeReorganizationReport', () => {
  it('writes a JSON and Markdown report summarizing the session', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-reorg-report-'));
    const paths = writeReorganizationReport(target, {
      appliedBlockIds: ['RF-MOVE-001'], keptBlockIds: ['RF-MOVE-001'],
      beforeScore: 62, afterScore: 41,
      architecture: { addedModules: ['features/greeting.ts'], removedModules: ['legacy/greeting.ts'], addedEdges: 0, removedEdges: 0, cyclesBefore: 0, cyclesAfter: 0 }
    });
    expect(existsSync(paths.jsonPath)).toBe(true);
    expect(existsSync(paths.markdownPath)).toBe(true);
    const markdown = readFileSync(paths.markdownPath, 'utf8');
    expect(markdown).toContain('62');
    expect(markdown).toContain('41');
    expect(markdown).toContain('RF-MOVE-001');
  });
});
