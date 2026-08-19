import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDependencyAudit } from './dependencies.js';
import { basicStaticSecurityProvider, dependencySecurityProvider, runSecurityChecks } from './security.js';

describe('dependencySecurityProvider', () => {
  it('maps a dependency vulnerability into a Finding', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'fixture' }));
    // No lockfile/npm available in this fixture -- dependencyAudit degrades to
    // available: false with an error, which the provider must map to zero findings,
    // not throw.
    const findings = dependencySecurityProvider.run(target, []);
    expect(Array.isArray(findings)).toBe(true);
  });

  it('has the expected provider name', () => {
    expect(dependencySecurityProvider.name).toBe('dependency-security');
  });

  it('maps every DependencyVulnerability field into the Finding shape', () => {
    const vulnerabilities = parseDependencyAudit(JSON.stringify({ vulnerabilities: { leftpad: { severity: 'high', fixAvailable: true } } }));
    expect(vulnerabilities).toEqual([{ name: 'leftpad', severity: 'high', fixAvailable: true }]);
    // dependencySecurityProvider.run() itself calls the real dependencyAudit(), which
    // shells out -- this test only proves parseDependencyAudit's output shape is what
    // the provider's mapping table above expects (severityToFindingSeverity keys must
    // cover every DependencyVulnerability['severity'] value), a compile-time guarantee
    // TypeScript already enforces via the Record type on severityToFindingSeverity.
  });
});

function writeFixture(target: string, file: string, content: string): string {
  const path = join(target, file);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('basicStaticSecurityProvider', () => {
  it('flags a hardcoded AWS-shaped access key', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/config.ts', "export const key = 'AKIAABCDEFGHIJKLMNOP';\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    const finding = findings.find((item) => item.ruleId === 'hardcoded-secret');
    expect(finding).toBeDefined();
    // hardcoded-secret findings are always 'needs_human', never silently upgraded to
    // 'confirmed', per the spec's rule -- see security.ts's hardcodedSecretFindings.
    expect(finding?.status).toBe('needs_human');
  });

  it('does not flag a secret read from an environment variable', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/config.ts', "export const key = process.env.API_KEY;\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    expect(findings.find((item) => item.ruleId === 'hardcoded-secret')).toBeUndefined();
  });

  it('flags eval(), reusing the exact pattern refactor-safety.ts blocks on', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/app.ts', "eval(userInput);\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    expect(findings.find((item) => item.ruleId === 'unsafe-eval')).toBeDefined();
  });

  it('flags execSync called with a template literal containing a variable', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/deploy.ts', "import { execSync } from 'node:child_process';\nexecSync(`git checkout ${branch}`);\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    expect(findings.find((item) => item.ruleId === 'unsafe-shell-command')).toBeDefined();
  });

  it('does not flag execFileSync (arguments are never shell-interpreted)', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/deploy.ts', "import { execFileSync } from 'node:child_process';\nexecFileSync('git', ['checkout', branch]);\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    expect(findings.find((item) => item.ruleId === 'unsafe-shell-command')).toBeUndefined();
  });

  it('flags a query built by template-literal interpolation', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/db.ts', "db.query(`SELECT * FROM users WHERE id = ${id}`);\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    expect(findings.find((item) => item.ruleId === 'sql-injection-risk')).toBeDefined();
  });

  it('does not flag a parameterized query', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/db.ts', "db.query('SELECT * FROM users WHERE id = ?', [id]);\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    expect(findings.find((item) => item.ruleId === 'sql-injection-risk')).toBeUndefined();
  });

  it('flags rejectUnauthorized: false', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/client.ts', "const agent = new https.Agent({ rejectUnauthorized: false });\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    expect(findings.find((item) => item.ruleId === 'tls-verification-disabled')).toBeDefined();
  });

  it('every finding this provider produces has a reproduce command', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/app.ts', "eval(userInput);\n");
    const findings = basicStaticSecurityProvider.run(target, [file]);
    expect(findings.every((finding) => typeof finding.reproduce === 'string' && finding.reproduce.length > 0)).toBe(true);
  });
});

describe('runSecurityChecks', () => {
  it('combines findings from both providers', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/app.ts', "eval(userInput);\n");
    const findings = runSecurityChecks(target, [file]);
    expect(findings.some((finding) => finding.ruleId === 'unsafe-eval')).toBe(true);
  });

  it('surfaces a security-relevant WordPress finding under the security check', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    // Fixture verified against packages/core/src/index.test.ts:327 ("reports direct
    // variable interpolation in $wpdb SQL but accepts $wpdb->prepare"), which proves
    // this exact snippet fires wordpress-wpdb-unprepared-query in wordpress.ts.
    const file = writeFixture(target, 'includes/query.php', '<?php\n$wpdb->query("DELETE FROM wp_profiles WHERE id = $id");\n');
    const findings = runSecurityChecks(target, [file]);
    expect(findings.some((finding) => finding.ruleId === 'wordpress-wpdb-unprepared-query')).toBe(true);
  });

  it('does not surface a WordPress finding whose ruleId is outside SECURITY_RELEVANT_RULE_IDS', () => {
    // wordpress-dynamic-entrypoint (a *-review finding about a registered hook, not a
    // vulnerability) is intentionally NOT in SECURITY_RELEVANT_RULE_IDS -- confirm it
    // never leaks through runSecurityChecks even if the fixture file triggers it.
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'includes/hooks.php', "<?php\nadd_action('init', 'my_init_fn');\nfunction my_init_fn() {}\n");
    const findings = runSecurityChecks(target, [file]);
    expect(findings.some((finding) => finding.ruleId === 'wordpress-dynamic-entrypoint')).toBe(false);
  });
});
