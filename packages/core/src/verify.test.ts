import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyFast } from './verify.js';

describe('verifyFast', () => {
  it('runs only lint and typecheck, skipping test and build', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-verifyfast-'));
    const sentinel = join(target, 'test-ran.txt');
    writeFileSync(join(target, 'package.json'), JSON.stringify({
      name: 'fixture',
      scripts: {
        lint: 'node -e "process.exit(0)"',
        typecheck: 'node -e "process.exit(0)"',
        test: `node -e "require('fs').writeFileSync('${sentinel.replaceAll('\\', '\\\\')}', 'ran')"`,
        build: `node -e "require('fs').writeFileSync('${sentinel.replaceAll('\\', '\\\\')}', 'ran')"`
      }
    }));
    const report = verifyFast(target);
    expect(report.passed).toBe(true);
    expect(report.checks.map((check) => check.name).sort()).toEqual(['lint', 'typecheck']);
    expect(existsSync(sentinel)).toBe(false);
  });

  it('fails when lint fails, without needing test/build to run', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-verifyfast-'));
    writeFileSync(join(target, 'package.json'), JSON.stringify({
      name: 'fixture',
      scripts: { lint: 'node -e "process.exit(1)"', typecheck: 'node -e "process.exit(0)"' }
    }));
    const report = verifyFast(target);
    expect(report.passed).toBe(false);
  });
});
