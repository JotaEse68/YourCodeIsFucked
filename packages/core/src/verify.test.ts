import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verify, verifyFast } from './verify.js';

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

describe('security check', () => {
  it('verify() includes a security check in FULL VERIFY', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-verify-security-'));
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'fixture' }));
    const report = verify(target);
    expect(report.checks.some((check) => check.name === 'security')).toBe(true);
  });

  it('verifyFast() never includes a security check', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-verify-security-'));
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'fixture' }));
    const report = verifyFast(target);
    expect(report.checks.some((check) => check.name === 'security')).toBe(false);
  });

  it('the security check output includes a finding from a fixture source file', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-verify-security-'));
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'fixture' }));
    mkdirSync(join(target, 'src'), { recursive: true });
    writeFileSync(join(target, 'src/app.ts'), 'eval(userInput);\n');
    const report = verify(target);
    const security = report.checks.find((check) => check.name === 'security');
    expect(security?.output).toContain('unsafe-eval');
  });

  it('does not scan a directory listed in ycf.config.yml ignore:, matching audit()', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-verify-security-ignore-'));
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'fixture' }));
    writeFileSync(join(target, 'ycf.config.yml'), 'version: 1\n\nignore:\n  - vendored-legacy\n');
    mkdirSync(join(target, 'vendored-legacy'), { recursive: true });
    writeFileSync(join(target, 'vendored-legacy/app.ts'), 'eval(userInput);\n');
    const report = verify(target);
    const security = report.checks.find((check) => check.name === 'security');
    expect(security?.output).not.toContain('unsafe-eval');
    expect(security?.output).not.toContain('vendored-legacy');
  });
});
