# P0a — Security Verification, Public-Contract Protection, Full Safety Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, extensible `security` verification check (dependency audit + a small new static-security scanner), and extend both public-contract protection and the safety engine from "CONSOLIDATE-only" to every operation kind that writes to disk.

**Architecture:** A new leaf module `packages/core/src/security.ts` (imports only from other leaf modules -- `dependencies.ts`, `wordpress.ts`, `typescript.ts`, `refactor-safety.ts`, `types.ts` -- never from `index.ts`, to avoid a cycle since `verify.ts` will import from `security.ts` and `index.ts` already re-exports from `verify.ts`) holds a small `SecurityCheckProvider` interface and two providers. `verify.ts` gains a `'security'` check that calls `runSecurityChecks` directly instead of spawning a package-manager script. `refactor-operations.ts` gets two small, mechanical extensions: public-contract checks and safety-engine checks wired into operation kinds that don't have them yet.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest, existing `assessRefactorSafety`/`dependencyAudit`/`wordpress.ts`/`typescript.ts` (all already implemented, this plan wires them together and adds new detectors alongside).

**Spec:** `docs/superpowers/specs/2026-08-19-p0a-security-and-safety-coverage-design.md`

## Global Constraints

- All new static-security findings default to `risk: 'report-only'` -- never auto-block a verify run by themselves. Only the dependency-security layer's configurable threshold can fail the `security` check.
- `verifyFast` (lint+typecheck only) must remain completely unaffected by this plan -- the `security` check only ever runs as part of FULL VERIFY (`verify()`), never `verifyFast()`.
- `security.ts` must not import from `index.ts`, directly or transitively, to avoid a circular import (`index.ts` already re-exports from `verify.ts`, which will import from `security.ts`).
- The three new `Finding` fields (`confidence`, `reproduce`, `status`) are optional and additive -- every existing finding-producing function in the codebase must continue to typecheck and behave identically without being touched.
- No feature flags, no backwards-compat shims -- this is pre-1.0, change things directly.
- Each task is validated with `corepack pnpm --filter @jotaese68/core typecheck` and `corepack pnpm --filter @jotaese68/core test` before commit.
- One commit per task, following the existing repo convention (`type(scope): summary`).
- No push, no npm publish, no release, per the user's explicit instruction for this whole backlog -- stop after the final task's commit.

---

## Task 1: Extract `SECURITY_RELEVANT_RULE_IDS` as a shared constant

**Context:** `packages/core/src/index.ts:464`, inside `scoreDimensions`, already has a hand-picked set of security-relevant `ruleId`s used to compute the audit score's `security` dimension:

```typescript
const security = Math.max(0, 100 - dimensionPenalty(findings, new Set(['sensitive-repository-file', 'sensitive-repository-file-tracked', 'wordpress-hardcoded-config-secret', 'wordpress-wpdb-unprepared-query', 'wordpress-unsanitized-input', 'wordpress-unescaped-output', 'wordpress-rest-route-permission', 'wordpress-ajax-nonce-review', 'wordpress-ajax-capability-review', 'wordpress-sensitive-data-exposure', 'typescript-error-suppression'])));
```

This is exactly the curated list the spec wants the new `security` verification check to reuse -- extracting it once avoids re-deriving or duplicating it in Task 4. This task only moves the literal array to `types.ts` (a true leaf module) and points `scoreDimensions` at it -- zero behavior change, provable because the existing test suite's score-related assertions must still pass unchanged.

**Files:**
- Modify: `packages/core/src/types.ts` (add the new exported constant, near `Finding`)
- Modify: `packages/core/src/index.ts:464` (use the constant instead of the inline array)
- Test: `packages/core/src/index.test.ts`

**Interfaces:**
- Produces: `export const SECURITY_RELEVANT_RULE_IDS: Finding['ruleId'][]` in `types.ts`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/index.test.ts` (follow the file's existing `mkdtempSync` + `temporaryDirectories.push(...)` convention):

```typescript
it('exposes the same security-relevant ruleId list the audit score dimension uses', () => {
  expect(SECURITY_RELEVANT_RULE_IDS).toContain('wordpress-wpdb-unprepared-query');
  expect(SECURITY_RELEVANT_RULE_IDS).toContain('sensitive-repository-file');
  expect(SECURITY_RELEVANT_RULE_IDS).toContain('typescript-error-suppression');
  expect(SECURITY_RELEVANT_RULE_IDS.length).toBe(11);
});
```

Add `SECURITY_RELEVANT_RULE_IDS` to the existing multi-name import from `'./index.js'` at the top of `index.test.ts` -- it will be re-exported from `index.ts` once Step 3 below adds it to the export list, so import it from `'./index.js'` there, not `'./types.js'`, to match how the rest of the test file imports things.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- index.test`
Expected: FAIL -- `SECURITY_RELEVANT_RULE_IDS` is not exported from `./index.js`.

- [ ] **Step 3: Add the constant and use it**

In `packages/core/src/types.ts`, add near the `Finding` interface:

```typescript
export const SECURITY_RELEVANT_RULE_IDS: Finding['ruleId'][] = ['sensitive-repository-file', 'sensitive-repository-file-tracked', 'wordpress-hardcoded-config-secret', 'wordpress-wpdb-unprepared-query', 'wordpress-unsanitized-input', 'wordpress-unescaped-output', 'wordpress-rest-route-permission', 'wordpress-ajax-nonce-review', 'wordpress-ajax-capability-review', 'wordpress-sensitive-data-exposure', 'typescript-error-suppression'];
```

In `packages/core/src/index.ts`, add `SECURITY_RELEVANT_RULE_IDS` to the existing `import type { ... } from './types.js';` line (change it to a regular value import for this one name, e.g. split into `import { SECURITY_RELEVANT_RULE_IDS } from './types.js'; import type { AiResidueCleanupReport, AuditReport, ... } from './types.js';` -- check the file's current import line 25 before editing, since it is a single combined `import type` statement and this constant needs a value import, not a type-only one).

Replace line 464's inline array:

```typescript
const security = Math.max(0, 100 - dimensionPenalty(findings, new Set(['sensitive-repository-file', 'sensitive-repository-file-tracked', 'wordpress-hardcoded-config-secret', 'wordpress-wpdb-unprepared-query', 'wordpress-unsanitized-input', 'wordpress-unescaped-output', 'wordpress-rest-route-permission', 'wordpress-ajax-nonce-review', 'wordpress-ajax-capability-review', 'wordpress-sensitive-data-exposure', 'typescript-error-suppression'])));
```

with:

```typescript
const security = Math.max(0, 100 - dimensionPenalty(findings, new Set(SECURITY_RELEVANT_RULE_IDS)));
```

Add `SECURITY_RELEVANT_RULE_IDS` to `index.ts`'s export surface (find the re-export list near the top-level `export {` statements and add a line re-exporting it from `./types.js`, e.g. `export { SECURITY_RELEVANT_RULE_IDS } from './types.js';`).

- [ ] **Step 4: Run test to verify it passes, then the full suite**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS, all tests including the new one and every existing score-related test unchanged.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/index.ts packages/core/src/index.test.ts
git commit -m "refactor(core): extract SECURITY_RELEVANT_RULE_IDS as a shared constant"
```

---

## Task 2: `security.ts` skeleton, `SecurityCheckProvider`, and `dependencySecurityProvider`

**Context:** `packages/core/src/dependencies.ts` already has a real, working `dependencyAudit(target): DependencyAuditReport` (runs `npm audit --json` / `pnpm audit --json`, parses the result -- confirmed real, not a stub). This task wraps it as the first `SecurityCheckProvider`, and establishes the module's leaf-only import discipline other tasks build on.

**Files:**
- Create: `packages/core/src/security.ts`
- Test: `packages/core/src/security.test.ts`

**Interfaces:**
- Consumes: `dependencyAudit(target: string): DependencyAuditReport` and `DependencyVulnerability { name: string; severity: 'low'|'moderate'|'high'|'critical'|'unknown'; fixAvailable: boolean }` (both already exported from `./dependencies.js`, check the exact export line before importing).
- Produces: `export interface SecurityCheckProvider { name: string; run(target: string, files: string[]): Finding[]; }`, `export const dependencySecurityProvider: SecurityCheckProvider`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/security.test.ts`:

```typescript
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
});
```

This first test intentionally does not try to fabricate a real `npm audit` JSON response (that would require mocking `spawnSync`, which the codebase's existing tests for `dependencyAudit` itself don't do either -- check `dependencies.test.ts` if it exists first, and if it already has a fixture pattern for `parseDependencyAudit`, reuse that pattern here instead of inventing a new one). The goal of this test is only to prove the provider doesn't throw and returns an array; Task 2's Step 6 below adds a second, more precise test using `parseDependencyAudit` directly (already tested, reused here) to prove the mapping shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- security.test`
Expected: FAIL -- `./security.js` does not exist.

- [ ] **Step 3: Implement the skeleton and the dependency provider**

Create `packages/core/src/security.ts`:

```typescript
import { dependencyAudit } from './dependencies.js';
import type { DependencyVulnerability, Finding } from './types.js';

export interface SecurityCheckProvider { name: string; run(target: string, files: string[]): Finding[]; }

const severityToFindingSeverity: Record<DependencyVulnerability['severity'], Finding['severity']> = { critical: 'medium', high: 'medium', moderate: 'low', low: 'low', unknown: 'low' };
const severityScoreImpact: Record<DependencyVulnerability['severity'], number> = { critical: 8, high: 6, moderate: 3, low: 1, unknown: 1 };

export const dependencySecurityProvider: SecurityCheckProvider = {
  name: 'dependency-security',
  run(target) {
    const report = dependencyAudit(target);
    if (!report.available) return [];
    return report.vulnerabilities.map((vulnerability) => ({
      id: `dependency-vulnerability:${vulnerability.name}`,
      ruleId: 'dependency-vulnerability' as const,
      severity: severityToFindingSeverity[vulnerability.severity],
      risk: 'report-only' as const,
      file: 'package.json',
      lines: [],
      evidence: `${vulnerability.name}: ${vulnerability.severity} severity vulnerability${vulnerability.fixAvailable ? ' (a fix is available -- run your package manager\'s audit fix)' : ' (no automated fix available yet)'}.`,
      scoreImpact: severityScoreImpact[vulnerability.severity],
      sourceSeverity: vulnerability.severity
    }));
  }
};
```

`sourceSeverity` is one of four new optional `Finding` fields added in Step 4 below, before this code can typecheck -- do Step 4 first if reading these steps out of order. (`Finding.severity` is a closed `'low' | 'medium'` union and cannot represent `DependencyVulnerability`'s 4-way `'low' | 'moderate' | 'high' | 'critical'` scale -- `dependency_fail_on`, added in Task 5, needs the original 4-way value to threshold against, so this provider carries it through unmodified alongside the already-collapsed `severity`.) Only `dependencySecurityProvider` ever sets `sourceSeverity`; every other finding-producing function in the codebase leaves it `undefined`, which is valid since it's optional.

`Finding['severity']` is a closed `'low' | 'medium'` union (check `types.ts` before writing this -- there is no `'high'`/`'critical'` at the `Finding` level, only at the `DependencyVulnerability` level, hence the mapping table above rather than a direct pass-through).

- [ ] **Step 4: Add the new `ruleId` and the four new `Finding` fields**

In `packages/core/src/types.ts`, add `'dependency-vulnerability'` to the long `Finding['ruleId']` union (any position is fine, TypeScript unions are unordered).

Also add, in this same step, all four new optional fields this whole plan's remaining tasks need on `Finding` (Task 2 needs `sourceSeverity` immediately for the code in Step 3 above to typecheck; Task 3 needs the other three; adding all four together now avoids a broken intermediate commit):

```typescript
export interface Finding {
  id: string;
  ruleId: /* ...existing union, plus 'dependency-vulnerability' from this step, plus 'hardcoded-secret' | 'unsafe-eval' | 'unsafe-shell-command' | 'sql-injection-risk' | 'tls-verification-disabled' which Task 3 adds... */;
  severity: 'low' | 'medium'; risk: FindingRisk; file: string; lines: number[]; evidence: string; scoreImpact: number;
  confidence?: number; reproduce?: string; status?: 'confirmed' | 'needs_human' | 'needs_framework_context';
  sourceSeverity?: 'low' | 'moderate' | 'high' | 'critical';
}
```

Only edit the `ruleId` union to add `'dependency-vulnerability'` in this task -- the five Task-3 `ruleId`s aren't referenced by any code yet at this point in the plan, so adding them now vs. in Task 3 is a style choice; adding them in Task 3 (where they're first used) keeps this task's diff minimal. Add all four new fields (`confidence`, `reproduce`, `status`, `sourceSeverity`) now regardless, since `sourceSeverity` must exist for Step 3's code to compile and the other three cost nothing to add alongside it.

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test -- security.test`
Expected: PASS.

- [ ] **Step 6: Add a precise mapping test using a real audit-shaped fixture**

Check `packages/core/src/dependencies.test.ts` (if it exists) for how it already feeds a fixture npm-audit JSON string into `parseDependencyAudit` without spawning a real process, and reuse that exact fixture shape here. Add to `security.test.ts`:

```typescript
import { parseDependencyAudit } from './dependencies.js';

it('maps every DependencyVulnerability field into the Finding shape', () => {
  const vulnerabilities = parseDependencyAudit(JSON.stringify({ vulnerabilities: { leftpad: { severity: 'high', fixAvailable: true } } }));
  expect(vulnerabilities).toEqual([{ name: 'leftpad', severity: 'high', fixAvailable: true }]);
  // dependencySecurityProvider.run() itself calls the real dependencyAudit(), which
  // shells out -- this test only proves parseDependencyAudit's output shape is what
  // the provider's mapping table above expects (severityToFindingSeverity keys must
  // cover every DependencyVulnerability['severity'] value), a compile-time guarantee
  // TypeScript already enforces via the Record type on severityToFindingSeverity.
});
```

- [ ] **Step 7: Run the full core suite and typecheck**

Run: `corepack pnpm --filter @jotaese68/core test && corepack pnpm --filter @jotaese68/core typecheck`
Expected: PASS, 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/security.ts packages/core/src/security.test.ts packages/core/src/types.ts
git commit -m "feat(core): add dependencySecurityProvider, wrapping the existing dependencyAudit"
```

---

## Task 3: `Finding`'s three new optional fields + the five new static-security detectors

**Context:** This is the bulk of the "basic static security" layer -- five genuinely new, deterministic pattern detectors, each producing findings that carry the new `confidence`/`reproduce`/`status` fields per the spec's requirement that every new security finding can defend itself. `unsafe-eval` deliberately imports its pattern from `refactor-safety.ts`'s existing `blockedPatterns` rather than redefining it, so the audit-time finding and the refactor-time block can never drift apart.

**Files:**
- Modify: `packages/core/src/types.ts` (`Finding` gains three optional fields; `ruleId` union gains 5 more members)
- Modify: `packages/core/src/refactor-safety.ts` (export the eval/`new Function` pattern so `security.ts` can reuse it, instead of only using it internally)
- Modify: `packages/core/src/security.ts` (add `basicStaticSecurityProvider`'s five new detectors)
- Test: `packages/core/src/security.test.ts`

**Interfaces:**
- Consumes: none new beyond what Task 2 already established.
- Produces: `basicStaticSecurityProvider`'s five detector functions are private to `security.ts`; only the provider object itself (extended in Task 4) is exported.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/security.test.ts`. Each rule gets a true-positive test and a false-positive (must NOT fire) test:

```typescript
import { mkdirSync } from 'node:fs';
import { basicStaticSecurityProvider } from './security.js';

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
    expect(finding?.status ?? 'confirmed').toBe('confirmed');
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- security.test`
Expected: FAIL -- `basicStaticSecurityProvider` is not exported yet.

- [ ] **Step 3: Add the five new `ruleId`s**

`Finding`'s four new optional fields (`confidence`, `reproduce`, `status`, `sourceSeverity`) already exist as of Task 2, Step 4 -- this step only adds the five new `ruleId` union members these new detectors use. In `packages/core/src/types.ts`, add `'hardcoded-secret' | 'unsafe-eval' | 'unsafe-shell-command' | 'sql-injection-risk' | 'tls-verification-disabled'` to the `Finding['ruleId']` union.

- [ ] **Step 4: Export the eval pattern from `refactor-safety.ts`**

In `packages/core/src/refactor-safety.ts`, change:

```typescript
const blockedPatterns: Array<[RegExp, string]> = [
  [/(?:import|require)\s*\(\s*[`"'][^`"']*[+$]/i, 'unresolvable dynamic module path'],
  [/eval\s*\(|new\s+Function\s*\(/i, 'runtime-generated code']
];
```

to:

```typescript
export const unsafeRuntimeCodePattern = /eval\s*\(|new\s+Function\s*\(/i;
const blockedPatterns: Array<[RegExp, string]> = [
  [/(?:import|require)\s*\(\s*[`"'][^`"']*[+$]/i, 'unresolvable dynamic module path'],
  [unsafeRuntimeCodePattern, 'runtime-generated code']
];
```

This is a pure extraction -- `blockedPatterns`' behavior is byte-identical, only the pattern is now also independently importable.

- [ ] **Step 5: Implement the five detectors**

In `packages/core/src/security.ts`, add:

```typescript
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { unsafeRuntimeCodePattern } from './refactor-safety.js';

function lineNumbersMatching(content: string, pattern: RegExp): number[] {
  return content.split(/\r?\n/).flatMap((line, index) => (pattern.test(line) ? [index + 1] : []));
}

const secretPattern = /\b(?:AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,})\b|\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"\s]{6,}['"]/i;
const envReadPattern = /process\.env\.|\.env\[/;
function hardcodedSecretFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, secretPattern).filter((lineNumber) => !envReadPattern.test(content.split(/\r?\n/)[lineNumber - 1]));
  if (!lines.length) return [];
  return [{ id: `hardcoded-secret:${display}`, ruleId: 'hardcoded-secret', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} line(s) look like a hardcoded secret, API key, or password. Move it to an environment variable or a secrets manager.`, scoreImpact: 6, confidence: 70, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="hardcoded-secret")'`, status: 'needs_human' }];
}

function unsafeEvalFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, unsafeRuntimeCodePattern);
  if (!lines.length) return [];
  return [{ id: `unsafe-eval:${display}`, ruleId: 'unsafe-eval', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} use(s) of eval() or new Function() -- runs arbitrary strings as code. Refactor to avoid it if at all possible.`, scoreImpact: 6, confidence: 95, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="unsafe-eval")'`, status: 'confirmed' }];
}

const shellExecPattern = /\b(?:exec|execSync)\s*\(\s*(?:`[^`]*\$\{|[^)]*\+)/;
function unsafeShellCommandFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, shellExecPattern);
  if (!lines.length) return [];
  return [{ id: `unsafe-shell-command:${display}`, ruleId: 'unsafe-shell-command', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} shell command(s) built with string interpolation/concatenation passed to exec()/execSync(), which shell-interprets its argument. Prefer execFile()/execFileSync() with an argument array.`, scoreImpact: 6, confidence: 75, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="unsafe-shell-command")'`, status: 'needs_human' }];
}

const sqlConcatPattern = /\.(?:query|execute|raw)\s*\(\s*`[^`]*\$\{/;
function sqlInjectionRiskFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, sqlConcatPattern);
  if (!lines.length) return [];
  return [{ id: `sql-injection-risk:${display}`, ruleId: 'sql-injection-risk', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} query/execute/raw call(s) built by interpolating a template literal directly. Use parameterized queries instead.`, scoreImpact: 7, confidence: 70, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="sql-injection-risk")'`, status: 'needs_human' }];
}

const tlsDisabledPattern = /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/;
function tlsVerificationDisabledFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, tlsDisabledPattern);
  if (!lines.length) return [];
  return [{ id: `tls-verification-disabled:${display}`, ruleId: 'tls-verification-disabled', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} location(s) disable TLS/SSL certificate verification. This accepts any certificate, including a forged one.`, scoreImpact: 8, confidence: 95, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="tls-verification-disabled")'`, status: 'confirmed' }];
}
```

Note: `secretPattern`'s alternation for the generic `api_key|secret|password|token = '...'` shape does not attempt to distinguish a real secret from a test fixture value -- that's exactly why it's marked `status: 'needs_human'` rather than `'confirmed'`, per the spec's "never silently upgrade to confirmed" rule. Only the eval and TLS rules (unambiguous once matched) are `'confirmed'`.

- [ ] **Step 6: Wire the five detectors into a provider (temporary, extended in Task 4)**

At the bottom of `security.ts`, add a provisional export so this task's tests can pass (Task 4 replaces this with the full version that also reuses WordPress/TypeScript findings -- this step exists so Task 3 is independently testable, per the plan's task-boundary rule):

```typescript
export const basicStaticSecurityProvider: SecurityCheckProvider = {
  name: 'basic-static-security',
  run(target, files) {
    return files.flatMap((file) => [
      ...hardcodedSecretFindings(target, file),
      ...unsafeEvalFindings(target, file),
      ...unsafeShellCommandFindings(target, file),
      ...sqlInjectionRiskFindings(target, file),
      ...tlsVerificationDisabledFindings(target, file)
    ]);
  }
};
```

- [ ] **Step 7: Run tests to verify they pass, then the full suite**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS.

- [ ] **Step 8: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/refactor-safety.ts packages/core/src/security.ts packages/core/src/security.test.ts
git commit -m "feat(core): add five deterministic static-security detectors"
```

---

## Task 4: Reuse WordPress and TypeScript findings under the `security` umbrella, finish `runSecurityChecks`

**Context:** `packages/core/src/index.ts:487` already builds a `wordpressSources` array and calls seven WordPress-specific finding functions plus one per-file one, all imported from the leaf module `./wordpress.js`:

```typescript
const wordpressSources = files.filter((file) => extname(file) === '.php').map((file) => ({ path: relative(resolvedTarget, file) || file, content: readFileSync(file, 'utf8') }));
// ...
...wordpressAjaxFindings(wordpressSources), ...wordpressDataFlowFindings(wordpressSources), ...wordpressRestFindings(wordpressSources), ...wordpressRestPersistenceFindings(wordpressSources), ...wordpressDestructiveOperationFindings(wordpressSources), ...wordpressPrivilegeEscalationFindings(wordpressSources), ...wordpressSensitiveExposureFindings(wordpressSources)
```

`packages/core/src/index.ts:9` imports all of these from `./wordpress.js`, and `typescriptFindings` from `./typescript.js:11` -- both are leaf modules `security.ts` can safely import too. `basicStaticSecurityProvider` computes the same `wordpressSources` shape itself from the `files` list it's given, calls the same functions, adds `typescriptFindings(...)` (check its exact signature in `typescript.ts` before calling it -- likely per-file like `wordpressFindings`, confirm), and filters the combined result down to `SECURITY_RELEVANT_RULE_IDS` (Task 1) before merging with the five new detectors from Task 3. This scope deliberately excludes `sensitive-repository-file`/`sensitive-repository-file-tracked` (those come from a function defined inside `index.ts` itself, not a leaf import -- reusing them here would require importing from `index.ts`, which would create the exact cycle this plan's Global Constraints forbid) -- they remain fully present in `ycf audit`'s security score dimension, just not summed into this new `verify()` check. State this plainly in the commit message; it is a deliberate, documented scope trim, not an oversight.

**Files:**
- Modify: `packages/core/src/security.ts` (replace Task 3's provisional `basicStaticSecurityProvider` with the full version; add `runSecurityChecks`)
- Test: `packages/core/src/security.test.ts`

**Interfaces:**
- Consumes: `SECURITY_RELEVANT_RULE_IDS` (Task 1, from `./types.js`), the eight WordPress finding functions and `typescriptFindings` (from `./wordpress.js` and `./typescript.js` respectively -- read both files' exact exports before importing, function signatures are asserted above from `index.ts`'s own usage but must be confirmed against the actual export statements).
- Produces: `export function runSecurityChecks(target: string, files: string[]): Finding[]`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/security.test.ts`:

```typescript
import { runSecurityChecks } from './security.js';

describe('runSecurityChecks', () => {
  it('combines findings from both providers', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/app.ts', "eval(userInput);\n");
    const findings = runSecurityChecks(target, [file]);
    expect(findings.some((finding) => finding.ruleId === 'unsafe-eval')).toBe(true);
  });

  it('surfaces a security-relevant WordPress finding under the security check', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    // Use a fixture proven to trigger wordpress-wpdb-unprepared-query already -- check
    // packages/core/src/wordpress.test.ts (or index.test.ts's WordPress fixtures) for
    // the exact PHP snippet that rule fires on, and copy it verbatim here rather than
    // inventing a new one, so this test can't silently drift from what the real rule
    // actually detects.
    const file = writeFixture(target, 'includes/query.php', "<?php\nglobal $wpdb;\n$wpdb->query(\"SELECT * FROM {$wpdb->prefix}table WHERE id = \" . $_GET['id']);\n");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- security.test`
Expected: The first test passes already (Task 3's provisional provider), the second and third fail -- `runSecurityChecks` is not exported and WordPress findings aren't reused yet.

- [ ] **Step 3: Implement the reuse layer**

In `packages/core/src/security.ts`, add imports:

```typescript
import { extname } from 'node:path';
import { wordpressAjaxFindings, wordpressDataFlowFindings, wordpressDestructiveOperationFindings, wordpressFindings, wordpressPrivilegeEscalationFindings, wordpressRestFindings, wordpressRestPersistenceFindings, wordpressSensitiveExposureFindings } from './wordpress.js';
import { typescriptFindings } from './typescript.js';
import { SECURITY_RELEVANT_RULE_IDS } from './types.js';
```

Replace Task 3's provisional `basicStaticSecurityProvider` with:

```typescript
function reusedSecurityFindings(target: string, files: string[]): Finding[] {
  const relevant = new Set(SECURITY_RELEVANT_RULE_IDS);
  const wordpressSources = files.filter((file) => extname(file) === '.php').map((file) => ({ path: relative(target, file) || file, content: readFileSync(file, 'utf8') }));
  const wordpressPerFile = wordpressSources.flatMap((source) => wordpressFindings(source.path, source.content));
  const wordpressBulk = [...wordpressAjaxFindings(wordpressSources), ...wordpressDataFlowFindings(wordpressSources), ...wordpressRestFindings(wordpressSources), ...wordpressRestPersistenceFindings(wordpressSources), ...wordpressDestructiveOperationFindings(wordpressSources), ...wordpressPrivilegeEscalationFindings(wordpressSources), ...wordpressSensitiveExposureFindings(wordpressSources)];
  const typescript = files.flatMap((file) => typescriptFindings(relative(target, file) || file, readFileSync(file, 'utf8')));
  return [...wordpressPerFile, ...wordpressBulk, ...typescript].filter((finding) => relevant.has(finding.ruleId));
}

export const basicStaticSecurityProvider: SecurityCheckProvider = {
  name: 'basic-static-security',
  run(target, files) {
    return [
      ...files.flatMap((file) => [
        ...hardcodedSecretFindings(target, file),
        ...unsafeEvalFindings(target, file),
        ...unsafeShellCommandFindings(target, file),
        ...sqlInjectionRiskFindings(target, file),
        ...tlsVerificationDisabledFindings(target, file)
      ]),
      ...reusedSecurityFindings(target, files)
    ];
  }
};

export function runSecurityChecks(target: string, files: string[]): Finding[] {
  return [dependencySecurityProvider, basicStaticSecurityProvider].flatMap((provider) => provider.run(target, files));
}
```

Before writing `typescriptFindings(...)`'s call, open `packages/core/src/typescript.ts` and confirm its real parameter order and name -- the call above assumes `(displayPath, content)` matching `wordpressFindings`'s shape, but confirm against the actual signature rather than assuming.

- [ ] **Step 4: Run tests to verify they pass, then the full suite**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS. If the WordPress fixture test doesn't trigger `wordpress-wpdb-unprepared-query`, check `wordpress.ts`'s actual detection pattern (via its own test file if one exists) and adjust the fixture PHP to match what really fires it -- do not weaken the test's assertion to make it pass.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/security.ts packages/core/src/security.test.ts
git commit -m "feat(core): reuse existing WordPress/TypeScript findings under the security check; add runSecurityChecks"
```

---

## Task 5: Wire `security` into `verify()`, `ycf.config.yml`'s `dependency_fail_on`

**Context:** `VerificationCheck['name']` (`packages/core/src/types.ts`) is currently a closed union `'lint' | 'typecheck' | 'test' | 'build'`. `verificationPlan(target)` (`packages/core/src/verify.ts`) builds one entry per name based on whether a matching `package.json` script exists; `verify(target)` runs all of them via `spawnSync`. The `security` check has no package.json script to spawn -- it calls `runSecurityChecks` directly -- so both functions need a small special case. `verify.ts` currently imports nothing from `index.ts`/`config.ts` (a deliberate leaf module, per this plan's Global Constraints) -- this task adds a small local file-walking helper rather than importing `index.ts`'s private `sourceFilesIn`, following the same pattern already used independently in `refactor-operations.ts` (`walk`) and `refactor-executor.ts` (`sourceSnapshot`) -- this codebase does not share one central file-walker, each module that needs one has its own small local version.

**Files:**
- Modify: `packages/core/src/types.ts` (`VerificationCheck['name']` gains `'security'`)
- Modify: `packages/core/src/config.ts` (parse `security.dependency_fail_on`)
- Modify: `packages/core/src/verify.ts` (add the `security` check to `verificationPlan`/`verify`, local file walker)
- Test: `packages/core/src/verify.test.ts`

**Interfaces:**
- Consumes: `runSecurityChecks` (Task 4, from `./security.js`).
- Produces: `verificationPlan(target)` now always includes one entry with `name: 'security'`; `YcfConfig` gains `security: { dependencyFailOn: 'low' | 'moderate' | 'high' | 'critical' | 'none' }`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/verify.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- verify.test`
Expected: FAIL -- no `security` check exists yet.

- [ ] **Step 3: Add the `security` name and config parsing**

In `packages/core/src/types.ts`, change `VerificationCheck['name']`:

```typescript
export interface VerificationCheck { name: 'lint' | 'typecheck' | 'test' | 'build' | 'security'; command: string[]; required: boolean; mode?: VerificationMode; status: 'skipped' | 'passed' | 'failed'; output?: string; }
```

(confirm the exact current field list before editing -- copy it precisely, only add `'security'` to the `name` union, do not otherwise restructure the interface). Also add to `YcfConfig`:

```typescript
export interface YcfConfig {
  version: 1; mode: 'conservative' | 'balanced' | 'aggressive'; language: Language; audience: Audience;
  refactor: { maxFileLines: number; maxFunctionLines: number; maxComplexity: number };
  security: { dependencyFailOn: 'low' | 'moderate' | 'high' | 'critical' | 'none' };
  ignore: string[]; include: string[];
}
```

In `packages/core/src/config.ts`, add `security: { dependencyFailOn: 'high' }` to `defaultConfig` (line 9), spread it the same way `refactor` is spread in both early-return branches (lines 9, 17-18), and add a `section === 'security'` branch mirroring the existing `section === 'refactor'` branch:

```typescript
if (section === 'security' && key === 'dependency_fail_on' && /^(low|moderate|high|critical|none)$/.test(value.trim())) config.security.dependencyFailOn = value.trim() as YcfConfig['security']['dependencyFailOn'];
```

- [ ] **Step 4: Add the local file walker and wire the check into `verify.ts`**

In `packages/core/src/verify.ts`, add:

```typescript
import { readdirSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { runSecurityChecks } from './security.js';
import { loadConfig } from './config.js';

const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.php']);
const ignoredDirs = new Set(['node_modules', 'vendor', 'dist', 'build', '.git', '.ycf']);
function walkSourceFiles(target: string): string[] {
  const out: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirs.has(entry)) continue;
      const file = join(directory, entry);
      const info = statSync(file);
      if (info.isDirectory()) visit(file); else if (sourceExtensions.has(extname(file))) out.push(file);
    }
  };
  visit(target);
  return out;
}

const severityRank: Record<string, number> = { low: 1, moderate: 2, high: 3, critical: 4 };
function securityCheckStatus(target: string, findings: ReturnType<typeof runSecurityChecks>): { status: 'passed' | 'failed'; output: string } {
  const threshold = loadConfig(target).security.dependencyFailOn;
  const output = findings.length ? findings.map((finding) => `[${finding.ruleId}] ${finding.file} -- ${finding.evidence}`).join('\n') : 'No security findings.';
  if (threshold === 'none') return { status: 'passed', output };
  const dependencyFindings = findings.filter((finding) => finding.ruleId === 'dependency-vulnerability');
  const worstDependencySeverity = dependencyFindings.reduce<number>((worst, finding) => Math.max(worst, severityRank[finding.severity === 'medium' ? 'high' : 'low'] ?? 0), 0);
  // Finding.severity is only 'low'|'medium' -- the real DependencyVulnerability severity
  // was already collapsed in security.ts's mapping table. Re-deriving the exact
  // critical/high/moderate/low distinction here would require reading dependencyAudit's
  // raw report again; instead, treat any 'medium'-severity dependency-vulnerability
  // finding as at-or-above the configured threshold whenever that threshold is
  // 'low'/'moderate'/'high' (i.e. anything but 'critical'), and require 'critical'
  // explicitly only when the threshold itself is 'critical' -- check this logic against
  // Task 2's severityToFindingSeverity table (critical/high both map to 'medium') before
  // implementing literally as described; if it under- or over-fires relative to the
  // configured threshold in your own reasoning, prefer carrying the original
  // DependencyVulnerability['severity'] string through to the Finding via a new
  // non-optional-breaking approach (e.g. stash it in `evidence` and parse it back out,
  // or reconsider whether severityToFindingSeverity should be reworked) rather than
  // shipping a threshold check that can't actually distinguish 'high' from 'critical'.
  return { status: dependencyFindings.length && worstDependencySeverity >= (severityRank[threshold] ?? 0) ? 'failed' : 'passed', output };
}
```

**Stop and reconsider before implementing the paragraph-long comment above literally in code.** It is flagging a real design gap this plan did not fully resolve: `Finding.severity` (`'low' | 'medium'`) cannot represent the 4-way `DependencyVulnerability.severity` (`'low' | 'moderate' | 'high' | 'critical'`) that `dependency_fail_on` needs to threshold against. The clean fix is to **not** collapse severity when creating `dependency-vulnerability` findings: add a fourth optional `Finding` field in this task, `sourceSeverity?: 'low' | 'moderate' | 'high' | 'critical'` (only ever set by `dependencySecurityProvider`), have Task 2's `dependencySecurityProvider` set it to the *original* `DependencyVulnerability['severity']` alongside the already-collapsed `severity`, and have `securityCheckStatus` above compare `finding.sourceSeverity` against the configured threshold directly via `severityRank`. Implement it this way — the inline comment above exists only to explain *why* this field is needed, not as a design to hesitate over. Adjust Task 2's `dependencySecurityProvider` (already committed by the time you reach this task) with a small follow-up change in *this* task's commit, adding one field to its returned objects; do not reopen or amend Task 2's commit.

Then, inside `verificationPlan`:

```typescript
export function verificationPlan(target: string): VerificationCheck[] {
  const packagePath = join(resolve(target), 'package.json');
  const securityCheck: VerificationCheck = { name: 'security', command: [], status: 'skipped' };
  if (!existsSync(packagePath)) return [securityCheck];
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, string>; packageManager?: string };
  const runner = pkg.packageManager?.startsWith('pnpm@') ? ['corepack', 'pnpm'] : ['npm'];
  return [...(['lint', 'typecheck', 'test', 'build'] as const).map((name) => ({ name, command: [...runner, 'run', name], status: 'skipped' as const, output: pkg.scripts?.[name] ? undefined : 'No matching package script.' })), securityCheck];
}
```

And inside `verify` (the FULL-VERIFY function -- not `verifyFast`), special-case the `security` entry before the generic `spawnSync` branch:

```typescript
export function verify(target: string): VerificationReport {
  const resolvedTarget = resolve(target);
  const checks = verificationPlan(resolvedTarget).map((check) => {
    if (check.name === 'security') { const result = securityCheckStatus(resolvedTarget, runSecurityChecks(resolvedTarget, walkSourceFiles(resolvedTarget))); return { ...check, status: result.status, output: result.output }; }
    if (check.output) return check;
    const [command, ...args] = check.command;
    const result = spawnSync(command, args, { cwd: resolvedTarget, encoding: 'utf8', shell: process.platform === 'win32' });
    return { ...check, status: result.status === 0 ? 'passed' as const : 'failed' as const, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
  });
  return { target: resolvedTarget, verifiedAt: new Date().toISOString(), checks, passed: checks.every((check) => check.status !== 'failed') };
}
```

`verifyFast` (Task 5 of the prior plan) already filters to `new Set(['lint', 'typecheck'])` -- confirm it does NOT need any change, since `'security'` is not in that set and will simply be filtered out by the existing `.filter((check) => fast.has(check.name))` line.

- [ ] **Step 5: Run tests to verify they pass, then the full suite**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/config.ts packages/core/src/verify.ts packages/core/src/verify.test.ts packages/core/src/security.ts
git commit -m "feat(core): wire the security check into FULL VERIFY; configurable dependency severity threshold"
```

---

## Task 6: Public-contract protection in MOVE, RENAME, and EXTRACT

**Context:** `publicEntryPoints`/`isReExported` (`packages/core/src/refactor-operations.ts`) exist and work, but are only called from the `CONSOLIDATE` branch of `applyRefactorOperation`. `publicEntryPoints` also does not parse the `module` field. This task makes MOVE, RENAME, and EXTRACT check the same two things before writing.

**Files:**
- Modify: `packages/core/src/refactor-operations.ts`
- Test: `packages/core/src/refactor-operations.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/refactor-operations.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations`
Expected: FAIL -- MOVE/RENAME/EXTRACT currently succeed unblocked in the first three tests.

- [ ] **Step 3: Add the `module` field to `publicEntryPoints`**

In `packages/core/src/refactor-operations.ts`, find `publicEntryPoints` (reads `{ main?, types?, typings?, bin?, exports? }`). Add `module?: string` to the parsed type and `if (json.module) raw.push(json.module);` alongside the existing `if (json.main) raw.push(json.main);` line.

- [ ] **Step 4: Wire the checks into MOVE/RENAME**

Find the MOVE/RENAME branch of `applyRefactorOperation`:

```typescript
if (operation.kind === 'MOVE' || operation.kind === 'RENAME') { const source = resolve(root, operation.source); const destination = resolve(root, operation.destination); if (!existsSync(source)) throw new Error(`Source does not exist: ${operation.source}`); if (existsSync(destination)) throw new Error(`Destination already exists: ${operation.destination}`); const contents = new Map(walk(root).map((file) => [file, readFileSync(file, 'utf8')])); const safety = assessRefactorSafety([source], contents); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); const ref = operation.updateImports ? rewriteReferences(root, operation.source, operation.destination) : { changed: [], before: new Map<string, string>() }; ...
```

Insert the public-contract check right after the existing safety check, before `rewriteReferences` runs:

```typescript
if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`);
if (publicEntryPoints(root).has(source)) throw new Error('BLOCKED: this file is a public package entry point (main/module/exports/bin/types); moving it would change a public contract.');
if (isReExported(root, operation.source)) throw new Error('BLOCKED: this file is re-exported (export * / export { X } from) elsewhere; moving it would change a public contract.');
```

- [ ] **Step 5: Wire the checks into EXTRACT**

Find the EXTRACT branch. It resolves `source`/`destination` near its top (`const source = resolve(root, operation.sourceFile); const destination = resolve(root, operation.targetFile);`). Insert right after that, before any AST parsing:

```typescript
if (publicEntryPoints(root).has(source)) throw new Error('BLOCKED: this file is a public package entry point (main/module/exports/bin/types); extracting from it would change a public contract.');
if (isReExported(root, operation.sourceFile)) throw new Error('BLOCKED: this file is re-exported (export * / export { X } from) elsewhere; extracting from it would change a public contract.');
```

- [ ] **Step 6: Run tests to verify they pass, then the full suite**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS. If the fourth test ("still allows...") fails, check whether `publicEntryPoints`/`isReExported` are being called with the right path shape (absolute for `publicEntryPoints().has()`, root-relative for `isReExported()`) -- this mirrors exactly how CONSOLIDATE already calls both, so mismatched path shape is the most likely cause of a false block.

- [ ] **Step 7: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/refactor-operations.ts packages/core/src/refactor-operations.test.ts
git commit -m "fix(core): protect public entry points and re-exports in MOVE, RENAME, and EXTRACT"
```

---

## Task 7: Safety engine on CREATE, DELETE, EDIT_IMPORT, EDIT_EXPORT, and EXTRACT

**Context:** `assessRefactorSafety` is called today only by MOVE/RENAME (BLOCKED-only: `if (safety.mode === 'BLOCKED') throw ...`) and CONSOLIDATE (stricter -- throws on both BLOCKED and SUPERVISED: `if (safety.mode === 'BLOCKED') throw ...; if (safety.mode === 'SUPERVISED') throw ...`). CREATE, DELETE, EDIT_IMPORT, EDIT_EXPORT, and EXTRACT call it nowhere. **This task follows CONSOLIDATE's stricter pattern (block on BOTH BLOCKED and SUPERVISED)** for these five kinds, not MOVE/RENAME's looser one -- these are exactly the operation kinds most likely to touch a sensitive file directly and silently (a CREATE inside `auth/`, a DELETE of a billing file), so the more conservative existing precedent is the right one to extend, and this decision should not be left for whoever implements the task to guess between two already-inconsistent existing patterns.

**Files:**
- Modify: `packages/core/src/refactor-operations.ts`
- Test: `packages/core/src/refactor-operations.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/refactor-operations.test.ts`:

```typescript
describe('safety engine on every operation kind', () => {
  it('blocks CREATE inside a sensitive-zone path', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-safety-'));
    mkdirSync(join(target, 'src'), { recursive: true });
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'CREATE', description: 'create', file: 'src/auth/session.ts', content: 'export const x = 1;\n' })).toThrow(/BLOCK|SUPERVISED/);
  });

  it('blocks DELETE of a sensitive-zone file', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-safety-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('src/billing/stripe.ts', 'export const charge = () => {};\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'DELETE', description: 'delete', file: 'src/billing/stripe.ts' })).toThrow(/BLOCK|SUPERVISED/);
  });

  it('blocks EDIT_IMPORT on a sensitive-zone file', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-safety-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('src/auth/session.ts', "import { hash } from './old-hash.js';\n");
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'EDIT_IMPORT', description: 'edit', file: 'src/auth/session.ts', replacements: [{ from: './old-hash.js', to: './new-hash.js' }] })).toThrow(/BLOCK|SUPERVISED/);
  });

  it('still allows CREATE/DELETE/EDIT_IMPORT on an ordinary file', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-safety-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('src/format.ts', "import { round } from './math.js';\nexport const x = round(1);\n");
    const result = applyRefactorOperation(target, { id: 'op-1', kind: 'EDIT_IMPORT', description: 'edit', file: 'src/format.ts', replacements: [{ from: './math.js', to: './lib/math.js' }] });
    expect(result.changedFiles).toContain('src/format.ts');
  });

  it('blocks EXTRACT from a sensitive-zone file', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-safety-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('src/auth/permissions.ts', 'export function checkRole(role) {\n  return role === "admin";\n}\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'EXTRACT', description: 'extract', sourceFile: 'src/auth/permissions.ts', targetFile: 'src/auth/role-check.ts', range: { startLine: 1, endLine: 3 }, exportedNames: ['checkRole'] })).toThrow(/BLOCK|SUPERVISED/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations`
Expected: FAIL -- all five operations currently succeed unblocked.

- [ ] **Step 3: Add the checks**

For CREATE, find:

```typescript
if (operation.kind === 'CREATE') { const file = resolve(root, operation.file); if (existsSync(file)) throw new Error(`Destination already exists: ${operation.file}`); mkdirSync(dirname(file), { recursive: true }); atomicWrite(file, operation.content); ...
```

Insert right after the `existsSync` check, before any write:

```typescript
if (existsSync(file)) throw new Error(`Destination already exists: ${operation.file}`);
{ const safety = assessRefactorSafety([file], new Map([[file, operation.content]])); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`); }
mkdirSync(dirname(file), { recursive: true }); atomicWrite(file, operation.content);
```

For DELETE, find:

```typescript
if (operation.kind === 'DELETE') { const file = resolve(root, operation.file); const content = readFileSync(file, 'utf8'); unlinkSync(file); ...
```

Insert after reading `content`, before `unlinkSync`:

```typescript
const content = readFileSync(file, 'utf8');
{ const safety = assessRefactorSafety([file], new Map([[file, content]])); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`); }
unlinkSync(file);
```

For EDIT_IMPORT/EDIT_EXPORT, find:

```typescript
if (operation.kind === 'EDIT_IMPORT' || operation.kind === 'EDIT_EXPORT') { const file = resolve(root, operation.file); const before = readFileSync(file, 'utf8'); let after = before; for (const replacement of operation.replacements) after = after.split(replacement.from).join(replacement.to); if (after !== before) atomicWrite(file, after); ...
```

Insert after reading `before`, before computing `after`:

```typescript
const before = readFileSync(file, 'utf8');
{ const safety = assessRefactorSafety([file], new Map([[file, before]])); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`); }
let after = before;
```

For EXTRACT, find where `source`/`destination` are resolved near the top of the branch (same spot Task 6 already added the public-contract checks to). Add, alongside those:

```typescript
{ const safety = assessRefactorSafety([source], new Map([[source, before]])); if (safety.mode === 'BLOCKED') throw new Error(`BLOCK: ${safety.reason}`); if (safety.mode === 'SUPERVISED') throw new Error(`SUPERVISED: ${safety.reason}`); }
```

placed after `before` (the source file's content, already read earlier in the EXTRACT branch for AST parsing) is available -- check the exact existing variable name for the source file's content in the EXTRACT branch before inserting (it may already be named `before` per the pattern of other branches; confirm rather than assume, since EXTRACT was written independently).

- [ ] **Step 4: Run tests to verify they pass, then the full suite**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS. Pay particular attention to whether any *existing* test in `refactor-operations.test.ts` or `refactor-executor.test.ts` uses a CREATE/DELETE/EDIT_IMPORT/EDIT_EXPORT/EXTRACT fixture whose file path or content now accidentally matches a sensitive-zone pattern (`auth|login|session|token|password|permission|role|billing|payment|stripe|checkout|invoice|migration|schema|database|prisma|sequelize|typeorm|webhook|rest|route|api` from `refactor-safety.ts`) -- if an existing, previously-passing test now fails because its fixture happens to contain one of these words, that is a real regression this task introduced; fix it by renaming the fixture's file/variable names in that test to something non-sensitive-sounding, not by weakening the new safety check.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/refactor-operations.ts packages/core/src/refactor-operations.test.ts
git commit -m "fix(core): run the safety engine on CREATE, DELETE, EDIT_IMPORT, EDIT_EXPORT, and EXTRACT"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (security check, both layers, provider interface) is Tasks 1-5. Part 2 (public-contract protection) is Task 6. Part 3 (safety engine everywhere) is Task 7. Part 4 (the three new `Finding` fields) is folded into Task 3, where its first consumers are added, per the task-boundary rule (don't add a field with no task-visible consumer).
- **Cycle safety re-checked:** `security.ts` imports only from `dependencies.ts`, `refactor-safety.ts`, `wordpress.ts`, `typescript.ts`, and `types.ts` -- all leaf modules confirmed by reading their own import lines during this plan's research. `verify.ts` imports from `security.ts` and `config.ts` (both leaf), still importing nothing from `index.ts`. No cycle introduced.
- **Type consistency:** `SecurityCheckProvider.run` returns `Finding[]` throughout (Tasks 2-4); `runSecurityChecks` (Task 4) is what Task 5's `verify.ts` consumes, matching signature. The `Finding.sourceSeverity` field flagged mid-plan in Task 5 is a genuine addition this plan discovered mid-research, not present in the original spec -- it is called out explicitly in Task 5 rather than silently added, since `dependency_fail_on`'s whole purpose depends on it existing.
- **Known deliberate scope trim:** `sensitive-repository-file`/`sensitive-repository-file-tracked` (from `SECURITY_RELEVANT_RULE_IDS`) are not reused by `runSecurityChecks` (Task 4), because their source function lives inside `index.ts` and importing it would violate this plan's cycle-safety constraint. Documented in Task 4's context and commit message, not a silent gap.
