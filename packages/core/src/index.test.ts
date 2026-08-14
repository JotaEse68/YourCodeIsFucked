import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { audit, detectStacks } from './index.js';

const temporaryDirectories: string[] = [];
afterEach(() => temporaryDirectories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('stack detection', () => {
  it('detects TypeScript and React from a Node package', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'package.json'), '{"dependencies":{"react":"19.0.0","typescript":"5.0.0"}}');
    writeFileSync(join(directory, 'tsconfig.json'), '{}');
    expect(detectStacks(directory)).toEqual(['javascript', 'typescript', 'react']);
  });

  it('keeps audit read-only and returns deterministic findings and a score', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'index.js'), 'debugger;');
    const report = audit(directory);
    expect(report.readOnly).toBe(true);
    expect(report.sourceFiles).toBe(1);
    expect(report.findings).toMatchObject([{ ruleId: 'debug-statements', risk: 'auto', lines: [1], scoreImpact: 2 }]);
    expect(report.score).toMatchObject({ fucked: 2, health: 98, method: 'deterministic-v1' });
  });

  it('reports residue instead of automatically deleting it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'service.ts'), '// temporary fix: remove after migration');
    const [finding] = audit(directory).findings;
    expect(finding).toMatchObject({ ruleId: 'ai-residue', risk: 'report-only', lines: [1] });
  });

  it('recognizes WordPress hooks only inside PHP files', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'plugin.php'), '<?php add_action("init", "ycf_boot");');
    expect(detectStacks(directory)).toEqual(['php', 'wordpress']);
  });
});
