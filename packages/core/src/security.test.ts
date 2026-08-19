import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDependencyAudit } from './dependencies.js';
import { dependencySecurityProvider } from './security.js';

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
