# P1 — evidence, computed confidence, confidence tiers, uncertainty states, `ycf next`, `ycf recover` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded confidence numbers with a shared, evidence-driven `computeConfidence` function across every producer that already has one; add a semantic confidence tier and an explicit uncertainty-state vocabulary; and surface two previously-invisible capabilities as new CLI commands — `ycf recover` (the persistent per-block checkpoint journal) and `ycf next` (a prioritized "what to do now" view).

**Architecture:** A new pure-function module (`confidence.ts`) is consumed by every existing confidence-bearing producer (`security.ts`'s 5 static detectors, `refactor-planner.ts`'s two block builders, `refactor-safety.ts`'s `assessRefactorSafety`). Two new leaf modules (`recover.ts`, `next.ts`) wrap already-existing read paths (`readCheckpointJournal`, `audit`, `runSecurityChecks`) into report shapes the CLI renders — no new write path is introduced except an explicit, `--yes`-gated single-block Git reset that reuses the existing `rollbackToCheckpoint` primitive.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest, commander.js (CLI), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-19-p1-confidence-and-recovery-design.md`

## Global Constraints

- TDD per task: failing test → implementation → passing test → commit. One commit per task, message format `type(scope): summary`.
- Every core-package task ends with `corepack pnpm --filter @jotaese68/core typecheck` and `corepack pnpm --filter @jotaese68/core test`, both green, before committing.
- Every CLI-package task additionally ends with `corepack pnpm --filter @jotaese68/ycf typecheck` green before committing.
- No feature flags. This is pre-1.0: change `Finding`, `RefactorBlock`, and `SafetyAssessment` directly. Do not keep the old `Finding.status` field alongside the new `uncertaintyState` — remove it.
- Do not touch `packages/core/src/release.ts`.
- Do not add a `ycf plan-context` command, schema validation for externally-produced plans, or any other agent-facing artifact. `architectural-refactor-plan.json` changing shape because `RefactorBlock` itself changed is expected and in scope; anything beyond that is not.
- Do not retrofit `Finding` producers other than the ones named in each task below (`security.ts`'s 5 detectors is the only `Finding`-producing surface this plan touches). `wordpress.ts`, `typescript.ts`, `duplicates.ts`, and `index.ts`'s own inline detectors keep `confidence: undefined`, exactly as today.
- Do not change `Finding.evidence`'s type (`string`). The new structured data lives in the new `evidenceItems` field.
- Manual verification before Task 6 is considered done: run `ycf recover .` and `ycf next .` against this repo itself and record the real output in the task report — the same "prove it with a real run, not just green tests" standard every prior plan in this repo has followed.

**Corrections made while writing this plan (the spec's own text was wrong or unresolved on these points — verified against the real source files before writing tasks below; each is called out again inline in its task):**

1. `security.ts` has **5** static detectors with hardcoded confidence, not 4 — the spec's Part A missed `unsafeShellCommandFindings` (confidence `75`, `status: 'needs_human'`). Since this plan removes `Finding.status` entirely, leaving that detector untouched would fail to typecheck. Task 2 covers all 5.
2. The spec's suggested `computeConfidence` base constants (`55`/`85`/`55`/`85` for the security detectors, `90`/`78`/`92` for `assessRefactorSafety`) were flagged in the spec's own text as unresolved ("recompute base per rule during implementation"). This plan uses each rule's **current fixed confidence number as its base**, because `computeConfidence(base, [oneItem])` returns exactly `base` (a single piece of evidence gets no bonus) — so every existing single-occurrence finding keeps today's exact number, and only a genuinely-corroborated (2+ occurrence) finding scores higher. This is the simplest calibration that satisfies "computed from evidence" without silently downgrading every finding YCF already produces.
3. `cockpit.test.ts` writes its fixture `RefactorBlock`s as JSON text (`JSON.stringify({...})` written to a `.json` file, read back at runtime), not as TypeScript object literals typed against the `RefactorBlock` interface. Adding required fields to `RefactorBlock` does **not** require editing this file — it isn't a compile-time construction site. (The spec listed it as one of 4 files needing edits; it doesn't.)
4. `refactor-safety.ts` has no dedicated test file today (`assessRefactorSafety` is only exercised indirectly through `refactor-operations.test.ts`). Task 3 creates `refactor-safety.test.ts` as a **new** file, not an extension of an existing one.
5. `buildArchitecturalRefactorPlan` is tested inside `packages/core/src/index.test.ts`, not a dedicated `refactor-planner.test.ts` file. Task 3's new tests go there.
6. **Load-bearing fix, not a nitpick:** `audit()` never calls `runSecurityChecks` — `security.ts`'s 5 detectors and `dependencySecurityProvider` are only ever invoked from inside `verify()`'s FULL VERIFY security check, and their `Finding[]` never escapes that function (only a pass/fail status string does). That means every `Finding` in `audit(target).findings` has `confidence: undefined` today, and Part A deliberately does not retrofit `audit()`'s own producers. Left as the spec described it, `ycf next`'s entire "rank by confidence tier" behavior would never fire on real data — every finding would sort as `SPECULATIVE` and the ranking would silently degrade to `scoreImpact`-only, 100% of the time. Task 5 fixes this by having `next()` merge `audit(target).findings` with `runSecurityChecks(target, walkSourceFiles(target))` (deduplicated by `id`, since WordPress-derived findings are computed by both paths and would otherwise appear twice), which requires exporting the previously-private `walkSourceFiles` from `verify.ts`. This does not retrofit any producer — it just makes `next()` read both of the two sources that already carry real confidence data.
7. The spec's `RestoreResult` type was written as an `interface` with a top-level `|` union, which is not valid TypeScript syntax for `interface`. Task 4 declares it as a `type` instead.
8. The spec's `next` CLI command declared only `--language`, but its own design says to reuse `audit`'s per-finding text formatting (`guidedAdvice(finding, language, audience)`), which needs `audience` too. Task 5 adds a `--audience` option, matching `audit`'s own CLI signature.

---

### Task 1: `confidence.ts` — evidence, tiers, and the shared confidence formula

**Files:**
- Create: `packages/core/src/confidence.ts`
- Test: `packages/core/src/confidence.test.ts`
- Modify: `packages/core/src/index.ts` (barrel export)

**Interfaces:**
- Produces: `EvidenceItem { file: string; lines?: number[]; detail: string }`, `ConfidenceTier = 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'DIRECTIONAL' | 'SPECULATIVE'`, `UncertaintyState = 'NEEDS_RUNTIME' | 'NEEDS_TEST' | 'NEEDS_HUMAN' | 'NEEDS_FRAMEWORK_CONTEXT' | 'NEEDS_EXTERNAL_CONTRACT'`, `confidenceTier(confidence: number): ConfidenceTier`, `computeConfidence(base: number, evidence: EvidenceItem[]): number`. Every later task consumes these exact names.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/confidence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { confidenceTier, computeConfidence } from './confidence.js';

describe('confidenceTier', () => {
  it('classifies boundary values into the correct tier', () => {
    expect(confidenceTier(89)).toBe('DIRECTIONAL');
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- confidence.test.ts`
Expected: FAIL — `Cannot find module './confidence.js'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/confidence.ts`:

```ts
export interface EvidenceItem { file: string; lines?: number[]; detail: string; }

export type ConfidenceTier = 'CONFIRMED' | 'HIGH_CONFIDENCE' | 'DIRECTIONAL' | 'SPECULATIVE';

export type UncertaintyState =
  | 'NEEDS_RUNTIME' | 'NEEDS_TEST' | 'NEEDS_HUMAN'
  | 'NEEDS_FRAMEWORK_CONTEXT' | 'NEEDS_EXTERNAL_CONTRACT';

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 90) return 'CONFIRMED';
  if (confidence >= 75) return 'HIGH_CONFIDENCE';
  if (confidence >= 50) return 'DIRECTIONAL';
  return 'SPECULATIVE';
}

export function computeConfidence(base: number, evidence: EvidenceItem[]): number {
  const distinctFiles = new Set(evidence.map((item) => item.file)).size;
  const bonus = Math.min(15, Math.max(0, evidence.length - 1) * 3 + Math.max(0, distinctFiles - 1) * 2);
  return Math.min(99, Math.round(base + bonus));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test -- confidence.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Export from the package barrel**

In `packages/core/src/index.ts`, after the line `export { demoRefactorBlock } from './refactor-block-fixture.js';` (currently line 24), add:

```ts
export { confidenceTier, computeConfidence } from './confidence.js';
export type { EvidenceItem, ConfidenceTier, UncertaintyState } from './confidence.js';
```

- [ ] **Step 6: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/confidence.ts packages/core/src/confidence.test.ts packages/core/src/index.ts
git commit -m "feat(core): add confidence.ts (EvidenceItem, ConfidenceTier, UncertaintyState, computeConfidence)"
```

---

### Task 2: `Finding` gains `evidenceItems`/`uncertaintyState`; `security.ts`'s 5 detectors switch to computed confidence

**Files:**
- Modify: `packages/core/src/types.ts` (`Finding` interface, ~lines 7-13)
- Modify: `packages/core/src/security.ts` (5 detector functions, ~lines 40-81)
- Modify: `packages/core/src/security.test.ts` (2 existing assertions reference the removed `status` field; extend with new tests)

**Interfaces:**
- Consumes: `EvidenceItem`, `computeConfidence` from Task 1 (`./confidence.js`).
- Produces: `Finding.evidenceItems?: EvidenceItem[]`, `Finding.uncertaintyState?: UncertaintyState` (both optional, additive). `Finding.status` no longer exists.

- [ ] **Step 1: Write the failing tests**

Two existing assertions in `packages/core/src/security.test.ts` reference the field being removed and must change first (this is why this step comes before the implementation edit — it locks in the new expected behavior as a red test):

Replace line 50 (`expect(finding?.status).toBe('needs_human');`) with:

```ts
    expect(finding?.uncertaintyState).toBe('NEEDS_HUMAN');
```

Replace line 68 (`expect(finding?.status).toBe('confirmed');`) with:

```ts
    expect(finding?.uncertaintyState).toBeUndefined();
```

(A `CONFIRMED`-tier finding has nothing left to resolve, so it carries no uncertainty state at all — this is the spec's own rule from Part A.)

Then add two new tests at the end of the `describe('basicStaticSecurityProvider', ...)` block, right before its closing `});` (after the `'flags rejectUnauthorized: false'` test and the `'every finding this provider produces has a reproduce command'` test, i.e. as new tests before line 119's `});`):

```ts
  it('computes higher confidence for multiple occurrences of the same secret pattern than a single occurrence', () => {
    const singleTarget = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const singleFile = writeFixture(singleTarget, 'src/config.ts', "export const key = 'AKIAABCDEFGHIJKLMNOP';\n");
    const singleFinding = basicStaticSecurityProvider.run(singleTarget, [singleFile]).find((item) => item.ruleId === 'hardcoded-secret');
    const multiTarget = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const multiFile = writeFixture(multiTarget, 'src/config.ts', "export const key = 'AKIAABCDEFGHIJKLMNOP';\nexport const key2 = 'AKIAXXXXXXXXXXXXXXXX';\n");
    const multiFinding = basicStaticSecurityProvider.run(multiTarget, [multiFile]).find((item) => item.ruleId === 'hardcoded-secret');
    expect(singleFinding?.confidence).toBe(70);
    expect(multiFinding?.confidence).toBeGreaterThan(singleFinding!.confidence!);
  });

  it('produces one evidenceItems entry per matched line', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-security-'));
    const file = writeFixture(target, 'src/app.ts', "eval(userInput);\neval(otherInput);\n");
    const finding = basicStaticSecurityProvider.run(target, [file]).find((item) => item.ruleId === 'unsafe-eval');
    expect(finding?.evidenceItems).toHaveLength(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- security.test.ts`
Expected: FAIL — the two changed assertions fail (`finding?.status` is still what the current implementation sets, `uncertaintyState` is `undefined`), and the two new tests fail (`confidence`/`evidenceItems` fields don't exist as computed values yet).

- [ ] **Step 3: Modify `Finding` in `packages/core/src/types.ts`**

At the top of the file, before line 1, add:

```ts
import type { EvidenceItem, UncertaintyState } from './confidence.js';
```

Replace (current lines 10-12):

```ts
  severity: 'low' | 'medium'; risk: FindingRisk; file: string; lines: number[]; evidence: string; scoreImpact: number;
  confidence?: number; reproduce?: string; status?: 'confirmed' | 'needs_human' | 'needs_framework_context';
  sourceSeverity?: 'low' | 'moderate' | 'high' | 'critical' | 'unknown';
```

with:

```ts
  severity: 'low' | 'medium'; risk: FindingRisk; file: string; lines: number[]; evidence: string; scoreImpact: number;
  confidence?: number; reproduce?: string; evidenceItems?: EvidenceItem[]; uncertaintyState?: UncertaintyState;
  sourceSeverity?: 'low' | 'moderate' | 'high' | 'critical' | 'unknown';
```

- [ ] **Step 4: Modify the 5 detectors in `packages/core/src/security.ts`**

Add to the import line at the top (currently `import { unsafeRuntimeCodePattern } from './refactor-safety.js';`), add a new import line right after it:

```ts
import { computeConfidence, type EvidenceItem } from './confidence.js';
```

Replace `hardcodedSecretFindings` (current lines 40-46) with:

```ts
function hardcodedSecretFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, secretPattern).filter((lineNumber) => !envReadPattern.test(content.split(/\r?\n/)[lineNumber - 1]));
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'hardcoded secret, API key, or password pattern match' }));
  return [{ id: `hardcoded-secret:${display}`, ruleId: 'hardcoded-secret', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} line(s) look like a hardcoded secret, API key, or password. Move it to an environment variable or a secrets manager.`, scoreImpact: 6, confidence: computeConfidence(70, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="hardcoded-secret")'`, uncertaintyState: 'NEEDS_HUMAN' }];
}
```

Replace `unsafeEvalFindings` (current lines 48-54) with:

```ts
function unsafeEvalFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, unsafeRuntimeCodePattern);
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'eval() or new Function() call' }));
  return [{ id: `unsafe-eval:${display}`, ruleId: 'unsafe-eval', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} use(s) of eval() or new Function() -- runs arbitrary strings as code. Refactor to avoid it if at all possible.`, scoreImpact: 6, confidence: computeConfidence(95, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="unsafe-eval")'` }];
}
```

Replace `unsafeShellCommandFindings` (current lines 57-63) with:

```ts
function unsafeShellCommandFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, shellExecPattern);
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'shell command built with string interpolation/concatenation' }));
  return [{ id: `unsafe-shell-command:${display}`, ruleId: 'unsafe-shell-command', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} shell command(s) built with string interpolation/concatenation passed to exec()/execSync(), which shell-interprets its argument. Prefer execFile()/execFileSync() with an argument array.`, scoreImpact: 6, confidence: computeConfidence(75, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="unsafe-shell-command")'`, uncertaintyState: 'NEEDS_HUMAN' }];
}
```

Replace `sqlInjectionRiskFindings` (current lines 66-72) with:

```ts
function sqlInjectionRiskFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, sqlConcatPattern);
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'query/execute/raw call built with template-literal interpolation' }));
  return [{ id: `sql-injection-risk:${display}`, ruleId: 'sql-injection-risk', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} query/execute/raw call(s) built by interpolating a template literal directly. Use parameterized queries instead.`, scoreImpact: 7, confidence: computeConfidence(70, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="sql-injection-risk")'`, uncertaintyState: 'NEEDS_HUMAN' }];
}
```

Replace `tlsVerificationDisabledFindings` (current lines 75-81) with:

```ts
function tlsVerificationDisabledFindings(target: string, file: string): Finding[] {
  const content = readFileSync(file, 'utf8');
  const display = relative(target, file);
  const lines = lineNumbersMatching(content, tlsDisabledPattern);
  if (!lines.length) return [];
  const evidenceItems: EvidenceItem[] = lines.map((line) => ({ file: display, lines: [line], detail: 'TLS/SSL certificate verification disabled' }));
  return [{ id: `tls-verification-disabled:${display}`, ruleId: 'tls-verification-disabled', severity: 'medium', risk: 'report-only', file: display, lines, evidence: `${lines.length} location(s) disable TLS/SSL certificate verification. This accepts any certificate, including a forged one.`, scoreImpact: 8, confidence: computeConfidence(95, evidenceItems), evidenceItems, reproduce: `ycf audit . --json | jq '.findings[] | select(.ruleId=="tls-verification-disabled")'` }];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `corepack pnpm --filter @jotaese68/core test -- security.test.ts`
Expected: PASS (all tests in the file, including the 2 modified and 2 new ones).

- [ ] **Step 6: Full core test suite and typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test`
Expected: no errors; every test file passes (confirms nothing else in the package referenced `Finding.status`).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/security.ts packages/core/src/security.test.ts
git commit -m "feat(core): compute Finding confidence from evidence in security.ts, replace status with uncertaintyState"
```

---

### Task 3: `RefactorBlock` gains `evidence`/`confidenceTier`/`uncertaintyState`; `refactor-planner.ts` and `refactor-safety.ts` switch to computed confidence

**Files:**
- Modify: `packages/core/src/refactor-types.ts` (`RefactorBlock` interface, ~lines 21-26)
- Modify: `packages/core/src/refactor-safety.ts` (`SafetyAssessment`, `assessRefactorSafety`, ~lines 35-42)
- Modify: `packages/core/src/refactor-planner.ts` (both block builders, full file)
- Modify: `packages/core/src/refactor-block-fixture.ts` (`demoRefactorBlock`, ~line 8)
- Modify: `packages/core/src/reorganization.test.ts` (2 typed `RefactorBlock` literals, ~lines 8-13 and 43-52)
- Create: `packages/core/src/refactor-safety.test.ts` (new — no test file exists for this module today)
- Modify: `packages/core/src/index.test.ts` (extend `buildArchitecturalRefactorPlan` coverage)

Note: `packages/core/src/cockpit.test.ts` is **not** touched by this task — its fixture `RefactorBlock`s are written as `JSON.stringify(...)` text read back at runtime, not TypeScript object literals typed against `RefactorBlock`, so adding required fields to the interface does not affect it (see Global Constraints correction #3 above).

**Interfaces:**
- Consumes: `EvidenceItem`, `ConfidenceTier`, `UncertaintyState`, `confidenceTier`, `computeConfidence` from Task 1.
- Produces: `RefactorBlock.evidence: EvidenceItem[]` (required), `RefactorBlock.confidenceTier: ConfidenceTier` (required), `RefactorBlock.uncertaintyState?: UncertaintyState` (optional). `SafetyAssessment.evidence: EvidenceItem[]` (required, new field).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/refactor-safety.test.ts`:

```ts
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
```

Add to `packages/core/src/index.test.ts`, as a new test near the existing `buildArchitecturalRefactorPlan`/`reviewBlocks` test (which currently ends around line 743 with `expect(reviewBlocks[0].operations).toEqual([]);` followed by `});`) — insert this new test immediately after that one:

```ts
  it('computes higher confidence for an exact duplicate group with more occurrences', () => {
    const duplicate = [
      'const a = "this exact code block is deliberately long enough to be meaningful";',
      'const b = a.trim();',
      'const c = b.toUpperCase();',
      'const d = c.toLowerCase();',
      'const e = d.slice(0, 10);',
      'export { e };'
    ].join('\n');
    const twoOccurrenceDir = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(twoOccurrenceDir);
    writeFileSync(join(twoOccurrenceDir, 'first.js'), duplicate);
    writeFileSync(join(twoOccurrenceDir, 'second.js'), duplicate);
    const twoOccurrenceBlock = buildArchitecturalRefactorPlan(twoOccurrenceDir).blocks.find((block) => block.type === 'CONSOLIDATE_DUPLICATE');
    expect(twoOccurrenceBlock).toBeDefined();
    expect(twoOccurrenceBlock?.evidence).toHaveLength(2);
    expect(twoOccurrenceBlock?.confidenceTier).toBe('CONFIRMED');

    const threeOccurrenceDir = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(threeOccurrenceDir);
    writeFileSync(join(threeOccurrenceDir, 'first.js'), duplicate);
    writeFileSync(join(threeOccurrenceDir, 'second.js'), duplicate);
    writeFileSync(join(threeOccurrenceDir, 'third.js'), duplicate);
    const threeOccurrenceBlock = buildArchitecturalRefactorPlan(threeOccurrenceDir).blocks.find((block) => block.type === 'CONSOLIDATE_DUPLICATE');
    expect(threeOccurrenceBlock).toBeDefined();
    expect(threeOccurrenceBlock!.confidence).toBeGreaterThan(twoOccurrenceBlock!.confidence);
  });

  it('gives a SUPERVISED_REVIEW block real evidence, a confidenceTier, and NEEDS_HUMAN', () => {
    // Reuses the exact fixture from the existing 'includes every refactorable finding as
    // a block, not only duplicates' test above (~line 726), already proven to produce at
    // least one SUPERVISED_REVIEW block -- do not invent a new, untested fixture here.
    const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_function_lines: 3\n');
    writeFileSync(join(directory, 'Sidebar.tsx'), [
      "import { useEffect } from 'react';",
      'export function Sidebar() {',
      '  useEffect(() => { loadSidebarData(); });',
      "  const title = 'Sidebar';",
      '  return <aside>{title}</aside>;',
      '}'
    ].join('\n'));
    const plan = buildArchitecturalRefactorPlan(directory);
    const reviewBlock = plan.blocks.find((block) => block.type === 'SUPERVISED_REVIEW');
    expect(reviewBlock).toBeDefined();
    expect(reviewBlock?.evidence.length).toBeGreaterThan(0);
    expect(typeof reviewBlock?.confidenceTier).toBe('string');
    expect(reviewBlock?.uncertaintyState).toBe('NEEDS_HUMAN');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-safety.test.ts index.test.ts`
Expected: FAIL — `refactor-safety.test.ts` fails because `result.evidence` doesn't exist yet; `index.test.ts`'s two new tests fail because `evidence`/`confidenceTier` don't exist on the returned blocks yet.

- [ ] **Step 3: Modify `RefactorBlock` in `packages/core/src/refactor-types.ts`**

Replace the import line (current line 1):

```ts
import type { Finding, RefactorPlan as LegacyRefactorPlan, UnderstandReport } from './types.js';
```

with:

```ts
import type { Finding, RefactorPlan as LegacyRefactorPlan, UnderstandReport } from './types.js';
import type { ConfidenceTier, EvidenceItem, UncertaintyState } from './confidence.js';
```

Replace the `RefactorBlock` interface (current lines 21-26):

```ts
export interface RefactorBlock {
  id: string; type: string; goal: string; reason: string; risk: RiskLevel; confidence: number; mode: SafetyMode;
  files: string[]; dependencies: string[]; affectedModules: string[]; preconditions: string[];
  operations: RefactorOperation[]; validation: VerificationStep[]; validations?: VerificationStep[]; rollback: RollbackStep[]; status: RefactorBlockStatus;
  result?: { changedFiles: string[]; diffSummary: string; verificationPassed: boolean; error?: string; verification?: unknown };
}
```

with:

```ts
export interface RefactorBlock {
  id: string; type: string; goal: string; reason: string; risk: RiskLevel; confidence: number; mode: SafetyMode;
  evidence: EvidenceItem[]; confidenceTier: ConfidenceTier; uncertaintyState?: UncertaintyState;
  files: string[]; dependencies: string[]; affectedModules: string[]; preconditions: string[];
  operations: RefactorOperation[]; validation: VerificationStep[]; validations?: VerificationStep[]; rollback: RollbackStep[]; status: RefactorBlockStatus;
  result?: { changedFiles: string[]; diffSummary: string; verificationPassed: boolean; error?: string; verification?: unknown };
}
```

- [ ] **Step 4: Modify `assessRefactorSafety` in `packages/core/src/refactor-safety.ts`**

Replace the import line (current line 2):

```ts
import type { RiskLevel, SafetyMode } from './refactor-types.js';
```

with:

```ts
import type { RiskLevel, SafetyMode } from './refactor-types.js';
import { computeConfidence, type EvidenceItem } from './confidence.js';
```

Replace `SafetyAssessment` and `assessRefactorSafety` (current lines 35-42):

```ts
export interface SafetyAssessment { risk: RiskLevel; mode: SafetyMode; confidence: number; signals: string[]; reason: string; }
export function assessRefactorSafety(files: string[], contents: Map<string, string>): SafetyAssessment {
  const supervised = new Set<string>(); const blocked = new Set<string>();
  for (const file of files) { const text = `${basename(file)} ${file}\n${contents.get(file) ?? ''}`; for (const [pattern, label] of supervisedPatterns) if (pattern.test(text)) supervised.add(label); for (const [pattern, label] of blockedPatterns) if (pattern.test(text)) blocked.add(label); }
  if (blocked.size) return { risk: 'CRITICAL', mode: 'BLOCKED', confidence: 98, signals: [...blocked], reason: `Cannot resolve safely: ${[...blocked].join(', ')}.` };
  if (supervised.size) return { risk: 'HIGH', mode: 'SUPERVISED', confidence: 86, signals: [...supervised], reason: `Protected area detected: ${[...supervised].join(', ')}.` };
  return { risk: 'LOW', mode: 'SAFE', confidence: 96, signals: [], reason: 'No protected dynamic or high-impact area detected statically.' };
}
```

with:

```ts
export interface SafetyAssessment { risk: RiskLevel; mode: SafetyMode; confidence: number; evidence: EvidenceItem[]; signals: string[]; reason: string; }
export function assessRefactorSafety(files: string[], contents: Map<string, string>): SafetyAssessment {
  const supervised = new Set<string>(); const blocked = new Set<string>();
  const supervisedEvidence: EvidenceItem[] = []; const blockedEvidence: EvidenceItem[] = [];
  for (const file of files) {
    const text = `${basename(file)} ${file}\n${contents.get(file) ?? ''}`;
    for (const [pattern, label] of supervisedPatterns) if (pattern.test(text)) { supervised.add(label); supervisedEvidence.push({ file, detail: label }); }
    for (const [pattern, label] of blockedPatterns) if (pattern.test(text)) { blocked.add(label); blockedEvidence.push({ file, detail: label }); }
  }
  if (blocked.size) return { risk: 'CRITICAL', mode: 'BLOCKED', confidence: computeConfidence(98, blockedEvidence), evidence: blockedEvidence, signals: [...blocked], reason: `Cannot resolve safely: ${[...blocked].join(', ')}.` };
  if (supervised.size) return { risk: 'HIGH', mode: 'SUPERVISED', confidence: computeConfidence(86, supervisedEvidence), evidence: supervisedEvidence, signals: [...supervised], reason: `Protected area detected: ${[...supervised].join(', ')}.` };
  return { risk: 'LOW', mode: 'SAFE', confidence: 96, evidence: [], signals: [], reason: 'No protected dynamic or high-impact area detected statically.' };
}
```

- [ ] **Step 5: Modify `packages/core/src/refactor-planner.ts` (full file replacement)**

Replace the entire file with:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { audit, understand } from './index.js';
import { buildRefactorPlan } from './planner.js';
import { computeConfidence, confidenceTier, type EvidenceItem } from './confidence.js';
import type { ArchitecturalRefactorPlan, RefactorBlock } from './refactor-types.js';
import type { RefactorRecommendation } from './types.js';

/** Build an executable architectural plan from static evidence. Explicit blocks can be supplied by a UI/agent after review. */
export function buildArchitecturalRefactorPlan(target: string, explicitBlocks: RefactorBlock[] = []): ArchitecturalRefactorPlan {
  const root = resolve(target); const understanding = understand(root); const auditReport = audit(root); const findings = auditReport.findings;
  const duplicateBlocks = understanding.duplicates.map((group, index): RefactorBlock => {
    const evidence: EvidenceItem[] = group.occurrences.map((occurrence) => ({ file: occurrence.file, lines: [occurrence.startLine, occurrence.endLine], detail: 'duplicate occurrence' }));
    const confidence = computeConfidence(group.kind === 'exact' ? 90 : 55, evidence);
    return {
      id: `RF-DUP-${String(index + 1).padStart(3, '0')}`, type: group.kind === 'exact' ? 'CONSOLIDATE_DUPLICATE' : 'SIMILAR_DUPLICATE_REVIEW',
      goal: group.kind === 'exact' ? 'Consolidate exact duplicate logic.' : 'Review structurally similar logic.', reason: 'Static duplicate evidence requires responsibility and API review before changing behavior.', risk: 'HIGH', confidence, evidence, confidenceTier: confidenceTier(confidence), mode: 'SUPERVISED',
      files: group.occurrences.map((occurrence) => occurrence.file), dependencies: [], affectedModules: group.occurrences.map((occurrence) => occurrence.file), preconditions: ['Confirm canonical owner and public API.'],
      operations: [{ id: `op-${index + 1}`, kind: group.kind === 'exact' ? 'CONSOLIDATE' : 'EXTRACT', description: 'Review duplicate candidate before execution.', ...(group.kind === 'exact' ? { canonicalFile: group.occurrences[0]?.file ?? '', duplicateFile: group.occurrences[1]?.file ?? '', symbol: 'unknown' } : { sourceFile: group.occurrences[0]?.file ?? '', targetFile: '', range: { startLine: group.occurrences[0]?.startLine ?? 1, endLine: group.occurrences[0]?.endLine ?? 1 }, exportedNames: [] }) } as never],
      validation: [], rollback: [{ id: `undo-${index + 1}`, kind: 'undo-operation', description: 'Undo the block operation journal.' }], status: 'PLANNED'
    };
  });
  const guidancePlan = buildRefactorPlan(auditReport, understanding);
  const reviewBlocks: RefactorBlock[] = guidancePlan.recommendations
    .filter((recommendation) => !recommendation.id.startsWith('refactor:duplicate-code:') && !recommendation.id.startsWith('refactor:similar-duplicate-code:'))
    .map((recommendation, index): RefactorBlock => reviewBlockFrom(recommendation, index));
  const blocks = explicitBlocks.length ? explicitBlocks : [...duplicateBlocks, ...reviewBlocks];
  const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), blocks, summary: { auto: blocks.filter((block) => block.mode === 'SAFE').length, safeRefactor: blocks.filter((block) => block.mode === 'SAFE').length, supervised: blocks.filter((block) => block.mode === 'SUPERVISED').length, architectural: blocks.filter((block) => block.risk === 'HIGH').length, blocked: blocks.filter((block) => block.mode === 'BLOCKED').length }, sourceFindings: findings.map((finding) => finding.id) };
  mkdirSync(join(root, '.ycf'), { recursive: true }); writeFileSync(join(root, '.ycf', 'architectural-refactor-plan.json'), JSON.stringify(plan, null, 2), 'utf8');
  return plan;
}

function reviewBlockFrom(recommendation: RefactorRecommendation, index: number): RefactorBlock {
  const evidence: EvidenceItem[] = [{ file: recommendation.file, lines: recommendation.lines, detail: recommendation.why }];
  const confidence = computeConfidence(70, evidence);
  return {
    id: `RF-REVIEW-${String(index + 1).padStart(3, '0')}`, type: 'SUPERVISED_REVIEW', goal: recommendation.title, reason: recommendation.why,
    risk: recommendation.risk === 'architectural' ? 'HIGH' : 'MEDIUM', confidence, evidence, confidenceTier: confidenceTier(confidence), uncertaintyState: 'NEEDS_HUMAN', mode: 'SUPERVISED',
    files: [recommendation.file], dependencies: [], affectedModules: recommendation.affectedModules, preconditions: recommendation.stopIf,
    operations: [], validation: [], rollback: [], status: 'PLANNED'
  };
}
```

- [ ] **Step 6: Modify `packages/core/src/refactor-block-fixture.ts`**

Replace the return statement inside `demoRefactorBlock` (current lines 6-12):

```ts
  return {
    id, type: options.type ?? 'DEMO', goal: id, reason: options.reason ?? 'reproducible fixture',
    risk: 'LOW', confidence: 99, mode: 'SAFE', files: [], dependencies: options.dependencies ?? [],
    affectedModules: [], preconditions: [], operations, validation: [],
    rollback: [{ kind: 'undo-operation', description: options.rollbackDescription ?? 'Undo this block operation journal.' }],
    status: 'PLANNED'
  };
```

with:

```ts
  return {
    id, type: options.type ?? 'DEMO', goal: id, reason: options.reason ?? 'reproducible fixture',
    risk: 'LOW', confidence: 99, evidence: [], confidenceTier: 'CONFIRMED', mode: 'SAFE', files: [], dependencies: options.dependencies ?? [],
    affectedModules: [], preconditions: [], operations, validation: [],
    rollback: [{ kind: 'undo-operation', description: options.rollbackDescription ?? 'Undo this block operation journal.' }],
    status: 'PLANNED'
  };
```

- [ ] **Step 7: Modify `packages/core/src/reorganization.test.ts`**

Replace the `block` helper (current lines 8-13):

```ts
const block = (id: string, source: string, destination: string): RefactorBlock => ({
  id, type: 'MOVE', goal: 'reorganize', reason: 'test', risk: 'MEDIUM', confidence: 70, mode: 'SUPERVISED',
  files: [source], dependencies: [], affectedModules: [], preconditions: [],
  operations: [{ id: `${id}-op`, kind: 'MOVE', description: 'move', source, destination, updateImports: true }],
  validation: [], rollback: [], status: 'PLANNED'
});
```

with:

```ts
const block = (id: string, source: string, destination: string): RefactorBlock => ({
  id, type: 'MOVE', goal: 'reorganize', reason: 'test', risk: 'MEDIUM', confidence: 70, evidence: [], confidenceTier: 'DIRECTIONAL', mode: 'SUPERVISED',
  files: [source], dependencies: [], affectedModules: [], preconditions: [],
  operations: [{ id: `${id}-op`, kind: 'MOVE', description: 'move', source, destination, updateImports: true }],
  validation: [], rollback: [], status: 'PLANNED'
});
```

Replace the `multiOpBlock` literal (current lines 43-52, the `confidence: 70,` line specifically) — change:

```ts
      id: 'RF-MOVE-003', type: 'MOVE', goal: 'reorganize', reason: 'test', risk: 'MEDIUM', confidence: 70, mode: 'SUPERVISED',
```

to:

```ts
      id: 'RF-MOVE-003', type: 'MOVE', goal: 'reorganize', reason: 'test', risk: 'MEDIUM', confidence: 70, evidence: [], confidenceTier: 'DIRECTIONAL', mode: 'SUPERVISED',
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-safety.test.ts index.test.ts reorganization.test.ts cockpit.test.ts refactor-executor.test.ts refactor-operations.test.ts`
Expected: PASS across all listed files (the last three confirm `refactor-block-fixture.ts`'s consumers and `cockpit.test.ts`'s untouched JSON fixtures still work).

- [ ] **Step 9: Full core test suite and typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test`
Expected: no errors; every test passes.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/refactor-types.ts packages/core/src/refactor-safety.ts packages/core/src/refactor-safety.test.ts packages/core/src/refactor-planner.ts packages/core/src/refactor-block-fixture.ts packages/core/src/reorganization.test.ts packages/core/src/index.test.ts
git commit -m "feat(core): compute RefactorBlock confidence from evidence, add confidenceTier/uncertaintyState"
```

---

### Task 4: `ycf recover` — surface the persistent checkpoint journal

**Files:**
- Create: `packages/core/src/recover.ts`
- Test: `packages/core/src/recover.test.ts`
- Modify: `packages/core/src/index.ts` (barrel export)
- Modify: `packages/cli/src/index.ts` (new `recover` command)

**Interfaces:**
- Consumes: `readCheckpointJournal`, `PersistentCheckpointJournal`, `PersistentBlockCheckpoint` from `./refactor-checkpoints.js` (already exist); `rollbackToCheckpoint` from `./git.js` (already exists, signature `(target: string, checkpoint: GitCheckpoint) => void` where `GitCheckpoint = { ref: string; commit: string; createdAt: string }`).
- Produces: `RecoverReport { target: string; journal?: PersistentCheckpointJournal }`, `recover(target: string): RecoverReport`, `RestoreResult = { restored: true; blockId: string; commit: string } | { restored: false; reason: string }`, `restoreBlock(target: string, blockId: string): RestoreResult`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/recover.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recover, restoreBlock } from './recover.js';
import { beginCheckpointJournal, updateBlockCheckpoint } from './refactor-checkpoints.js';

function initGit(root: string) {
  const runGit = (args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  runGit(['init', '-q']); runGit(['config', 'user.email', 'ycf-test@example.com']); runGit(['config', 'user.name', 'YCF Test']);
  return runGit;
}

describe('recover', () => {
  it('returns no journal when none exists on disk', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    expect(recover(target).journal).toBeUndefined();
  });

  it('returns the journal unmodified, without touching the working tree', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const context = beginCheckpointJournal(target, ['RF-001']);
    updateBlockCheckpoint(context, 'RF-001', 'RUNNING');
    const before = readFileSync(join(target, 'source.ts'), 'utf8');
    const report = recover(target);
    expect(report.journal?.blocks[0]).toMatchObject({ blockId: 'RF-001', status: 'RUNNING' });
    expect(readFileSync(join(target, 'source.ts'), 'utf8')).toBe(before);
  });
});

describe('restoreBlock', () => {
  it('refuses an unknown blockId without running Git', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    expect(restoreBlock(target, 'RF-UNKNOWN')).toEqual({ restored: false, reason: 'No block "RF-UNKNOWN" in the checkpoint journal.' });
  });

  it('refuses a block with no recorded ref', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    initGit(target);
    beginCheckpointJournal(target, ['RF-001']);
    expect(restoreBlock(target, 'RF-001')).toEqual({ restored: false, reason: 'Block "RF-001" has no recorded checkpoint ref to restore to.' });
  });

  it('resets the working tree to the block\'s recorded checkpoint commit', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-recover-'));
    const file = join(target, 'source.ts');
    writeFileSync(file, 'export const value = 1;\n');
    const runGit = initGit(target);
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'initial']);
    const context = beginCheckpointJournal(target, ['RF-001']);
    updateBlockCheckpoint(context, 'RF-001', 'RUNNING');
    writeFileSync(file, 'export const value = 2;\n');
    runGit(['add', 'source.ts']); runGit(['commit', '-qm', 'changed']);
    const result = restoreBlock(target, 'RF-001');
    expect(result.restored).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('export const value = 1;\n');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- recover.test.ts`
Expected: FAIL — `Cannot find module './recover.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/recover.ts`:

```ts
import { readCheckpointJournal, type PersistentCheckpointJournal } from './refactor-checkpoints.js';
import { rollbackToCheckpoint } from './git.js';

export interface RecoverReport { target: string; journal?: PersistentCheckpointJournal; }
export function recover(target: string): RecoverReport {
  return { target, journal: readCheckpointJournal(target) };
}

export type RestoreResult = { restored: true; blockId: string; commit: string } | { restored: false; reason: string };
export function restoreBlock(target: string, blockId: string): RestoreResult {
  const journal = readCheckpointJournal(target);
  const block = journal?.blocks.find((entry) => entry.blockId === blockId);
  if (!block) return { restored: false, reason: `No block "${blockId}" in the checkpoint journal.` };
  if (!block.ref || !block.commit) return { restored: false, reason: `Block "${blockId}" has no recorded checkpoint ref to restore to.` };
  rollbackToCheckpoint(target, { ref: block.ref, commit: block.commit, createdAt: block.startedAt ?? block.updatedAt });
  return { restored: true, blockId, commit: block.commit };
}
```

(`rollbackToCheckpoint` only reads `.commit` from the `GitCheckpoint` it's given — confirmed against `git.ts`'s actual body, `git(root, ['reset', '--hard', checkpoint.commit])` — so the synthesized `createdAt` above is inert, present only to satisfy the `GitCheckpoint` type.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm --filter @jotaese68/core test -- recover.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Export from the package barrel**

In `packages/core/src/index.ts`, after the `confidence.ts` export lines added in Task 1, add:

```ts
export { recover, restoreBlock } from './recover.js';
export type { RecoverReport, RestoreResult } from './recover.js';
```

- [ ] **Step 6: Add the CLI command**

In `packages/cli/src/index.ts`, add `recover` and `restoreBlock` to the existing giant import from `@jotaese68/core` (current line 9) — insert them alphabetically alongside the existing names (e.g. between `readOnly`... there is no such name; insert near `refactorPlan` / `releaseCheckLabel` alphabetically — exact position doesn't matter for compilation, just add `recover, restoreBlock,` into the destructured import list).

After the `rollback` command (the last command in the file, ending right before `program.parse();`), add:

```ts
program.command('recover [target]').description('Show or restore interrupted refactor blocks from the persistent checkpoint journal.').option('--json', 'Emit the complete journal as JSON.').option('--restore <blockId>', 'Restore one block to its pre-execution checkpoint.').option('--yes', 'Confirm the restore (required with --restore).').action((target = '.', options) => {
  const report = recover(target);
  if (options.restore) {
    const block = report.journal?.blocks.find((entry) => entry.blockId === options.restore);
    if (!block) { console.error(`No block "${options.restore}" in the checkpoint journal.`); process.exitCode = 1; return; }
    if (!options.yes) {
      console.log(`This would restore block "${options.restore}" to commit ${block.commit ?? '(no checkpoint recorded)'}.`);
      console.log('Re-run with --yes to confirm the restore.');
      return;
    }
    const result = restoreBlock(target, options.restore);
    if (!result.restored) { console.error(result.reason); process.exitCode = 1; return; }
    console.log(`Restored block "${result.blockId}" to commit ${result.commit}.`);
    return;
  }
  if (options.json) { console.log(JSON.stringify(report, null, 2)); return; }
  if (!report.journal) { console.log('No refactor run found for this target.'); return; }
  console.log(`YCF — refactor recovery (run ${report.journal.runId})`);
  console.log(`Base commit: ${report.journal.baseCommit ?? 'unknown'}`);
  for (const block of report.journal.blocks) {
    const marker = block.status === 'PENDING' || block.status === 'RUNNING' ? '!' : block.status === 'VERIFIED' ? '✓' : block.status === 'ROLLED_BACK' ? '↩' : '✗';
    console.log(`${marker} [${block.status}] ${block.blockId}${block.commit ? ` (commit ${block.commit})` : ''} — ${block.changedFiles.length} file(s) changed${block.error ? `: ${block.error}` : ''}`);
  }
  const unresolved = report.journal.blocks.filter((block) => block.status === 'PENDING' || block.status === 'RUNNING');
  if (unresolved.length) console.log(`${unresolved.length} block(s) did not reach a final state. Restore one with: ycf recover ${target} --restore <blockId> --yes`);
});
```

- [ ] **Step 7: Typecheck both packages**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core build && corepack pnpm --filter @jotaese68/ycf typecheck`
Expected: no errors. (Core must be built before the CLI typechecks against it, matching this repo's own root `typecheck` script ordering.)

- [ ] **Step 8: Manual smoke test**

Run against this repo itself, from the repo root:

```bash
node packages/cli/dist/index.js recover .
```

Expected output: `No refactor run found for this target.` (this repo has no `.ycf/refactor-checkpoints.json` from a prior interrupted run). Record the actual command output in the task report.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/recover.ts packages/core/src/recover.test.ts packages/core/src/index.ts packages/cli/src/index.ts
git commit -m "feat: add ycf recover, surfacing the persistent checkpoint journal"
```

---

### Task 5: `ycf next` — prioritized "what to do now"

**Files:**
- Modify: `packages/core/src/verify.ts` (export the previously-private `walkSourceFiles`)
- Create: `packages/core/src/next.ts`
- Test: `packages/core/src/next.test.ts`
- Modify: `packages/core/src/index.ts` (barrel export)
- Modify: `packages/cli/src/index.ts` (new `next` command)

**Interfaces:**
- Consumes: `audit` from `./index.js`; `runSecurityChecks` from `./security.js`; `walkSourceFiles` from `./verify.js` (made public in this task); `readCheckpointJournal` from `./refactor-checkpoints.js`; `confidenceTier` from `./confidence.js`; `Finding` from `./types.js`.
- Produces: `NextReport { target: string; blocked?: { reason: 'unfinished-run'; pendingBlockIds: string[] }; suggestions: Finding[] }`, `next(target: string, limit?: number): NextReport`.

- [ ] **Step 1: Export `walkSourceFiles`**

In `packages/core/src/verify.ts`, change (current line 13):

```ts
function walkSourceFiles(target: string): string[] {
```

to:

```ts
export function walkSourceFiles(target: string): string[] {
```

- [ ] **Step 2: Write the failing tests**

Create `packages/core/src/next.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { next } from './next.js';
import { beginCheckpointJournal, updateBlockCheckpoint } from './refactor-checkpoints.js';

describe('next', () => {
  it('short-circuits to a blocked report when a block is PENDING, without ranking findings', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-next-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    beginCheckpointJournal(target, ['RF-PENDING']);
    const report = next(target);
    expect(report.blocked).toEqual({ reason: 'unfinished-run', pendingBlockIds: ['RF-PENDING'] });
    expect(report.suggestions).toEqual([]);
  });

  it('short-circuits when a block is RUNNING', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-next-'));
    writeFileSync(join(target, 'source.ts'), 'export const value = 1;\n');
    const context = beginCheckpointJournal(target, ['RF-RUNNING']);
    updateBlockCheckpoint(context, 'RF-RUNNING', 'RUNNING');
    const report = next(target);
    expect(report.blocked?.pendingBlockIds).toEqual(['RF-RUNNING']);
  });

  it('ranks a CONFIRMED-tier finding above a DIRECTIONAL-tier one, tier beating raw score', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-next-'));
    writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'fixture' }));
    // unsafe-eval has base confidence 95 (CONFIRMED); sql-injection-risk has base
    // confidence 70 (DIRECTIONAL) but a higher scoreImpact (7 vs 6) -- proving tier
    // ordering wins over raw scoreImpact is the entire point of this test.
    writeFileSync(join(target, 'src.ts'), "eval(userInput);\ndb.query(`SELECT * FROM users WHERE id = ${id}`);\n");
    const report = next(target);
    expect(report.blocked).toBeUndefined();
    const evalIndex = report.suggestions.findIndex((finding) => finding.ruleId === 'unsafe-eval');
    const sqlIndex = report.suggestions.findIndex((finding) => finding.ruleId === 'sql-injection-risk');
    expect(evalIndex).toBeGreaterThanOrEqual(0);
    expect(sqlIndex).toBeGreaterThanOrEqual(0);
    expect(evalIndex).toBeLessThan(sqlIndex);
  });

  it('does not duplicate a finding that both audit() and runSecurityChecks() can produce', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-next-'));
    writeFileSync(join(target, 'includes/query.php'), '<?php\n$wpdb->query("DELETE FROM wp_profiles WHERE id = $id");\n');
    const report = next(target);
    const matches = report.suggestions.filter((finding) => finding.ruleId === 'wordpress-wpdb-unprepared-query');
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `corepack pnpm --filter @jotaese68/core test -- next.test.ts`
Expected: FAIL — `Cannot find module './next.js'`.

- [ ] **Step 4: Write the implementation**

Create `packages/core/src/next.ts`:

```ts
import { audit } from './index.js';
import { runSecurityChecks } from './security.js';
import { walkSourceFiles } from './verify.js';
import { readCheckpointJournal } from './refactor-checkpoints.js';
import { confidenceTier } from './confidence.js';
import type { Finding } from './types.js';

export interface NextReport {
  target: string;
  blocked?: { reason: 'unfinished-run'; pendingBlockIds: string[] };
  suggestions: Finding[];
}

export function next(target: string, limit = 5): NextReport {
  const journal = readCheckpointJournal(target);
  const pending = journal?.blocks.filter((block) => block.status === 'PENDING' || block.status === 'RUNNING') ?? [];
  if (pending.length) {
    return { target, blocked: { reason: 'unfinished-run', pendingBlockIds: pending.map((block) => block.blockId) }, suggestions: [] };
  }
  // Merge audit()'s structural findings with runSecurityChecks()'s output. Only the
  // latter (security.ts's 5 static detectors + dependencySecurityProvider) ever sets
  // Finding.confidence -- audit() alone would leave every finding undefined-confidence
  // and this command's entire tier-based ranking would never fire on real data. The two
  // sources overlap on WordPress-derived findings (audit() and runSecurityChecks() both
  // call the same wordpress*Findings functions), so dedupe by id, keeping whichever
  // occurrence is encountered -- they are identical when both exist.
  const merged = new Map<string, Finding>();
  for (const finding of audit(target).findings) merged.set(finding.id, finding);
  for (const finding of runSecurityChecks(target, walkSourceFiles(target))) merged.set(finding.id, finding);
  const tierRank: Record<string, number> = { CONFIRMED: 0, HIGH_CONFIDENCE: 1, DIRECTIONAL: 2, SPECULATIVE: 3 };
  const ranked = [...merged.values()].sort((a, b) => {
    const tierA = tierRank[confidenceTier(a.confidence ?? 0)] ?? 4;
    const tierB = tierRank[confidenceTier(b.confidence ?? 0)] ?? 4;
    if (tierA !== tierB) return tierA - tierB;
    return b.scoreImpact - a.scoreImpact;
  });
  return { target, blocked: undefined, suggestions: ranked.slice(0, limit) };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `corepack pnpm --filter @jotaese68/core test -- next.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Export from the package barrel**

In `packages/core/src/index.ts`, after the `recover.ts` export lines added in Task 4, add:

```ts
export { next } from './next.js';
export type { NextReport } from './next.js';
```

Also add `walkSourceFiles` to the existing `verify.ts` export line (current, after Task 1/4 edits still reads `export { verificationPlan, verify, verifyFast } from './verify.js';`) — change it to:

```ts
export { verificationPlan, verify, verifyFast, walkSourceFiles } from './verify.js';
```

- [ ] **Step 7: Add the CLI command**

In `packages/cli/src/index.ts`, add `next` and `confidenceTier` to the existing import from `@jotaese68/core` (same import line touched in Task 4).

After the `recover` command added in Task 4 (still before `program.parse();`), add:

```ts
program.command('next [target]').description('Show the single most useful next action: resume an interrupted run, or the most confidently actionable finding.').option('--json', 'Emit the complete result as JSON.').option('--language <language>', 'Response language: en, es, pt, fr, de, it, ar, or zh.').option('--audience <audience>', 'Explanation level: guided, technical, or professional.').action((target = '.', options) => {
  const report = next(target);
  if (options.json) { console.log(JSON.stringify(report, null, 2)); return; }
  console.log('YCF — next');
  if (report.blocked) {
    console.log(`Unfinished refactor run detected (block(s): ${report.blocked.pendingBlockIds.join(', ')}).`);
    console.log(`Run \`ycf recover ${target}\` first.`);
    return;
  }
  if (!report.suggestions.length) { console.log('No findings to act on.'); return; }
  const config = loadConfig(target);
  const language: Language = validLanguage(options.language) ? options.language : config.language;
  const audience = validAudience(options.audience) ? options.audience : config.audience;
  for (const finding of report.suggestions) console.log(`[${confidenceTier(finding.confidence ?? 0)}] [${finding.severity}] ${finding.file}:${finding.lines.join(', ')} — ${guidedAdvice(finding, language, audience)}`);
});
```

- [ ] **Step 8: Typecheck both packages**

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core build && corepack pnpm --filter @jotaese68/ycf typecheck`
Expected: no errors.

- [ ] **Step 9: Manual smoke test**

Run against this repo itself, from the repo root:

```bash
node packages/cli/dist/index.js next .
```

Expected: text output listing this repo's own top findings, each prefixed with a tier in brackets, or "No findings to act on." if this repo is currently clean. Record the actual command output in the task report.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/verify.ts packages/core/src/next.ts packages/core/src/next.test.ts packages/core/src/index.ts packages/cli/src/index.ts
git commit -m "feat: add ycf next, ranking findings by computed confidence tier"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Root typecheck**

Run: `corepack pnpm typecheck`
Expected: no errors (this builds `@jotaese68/core` first, then typechecks `@jotaese68/ycf` and `@jotaese68/desktop-launcher` against it — matching this repo's own CI gate).

- [ ] **Step 2: Full workspace test suite**

Run: `corepack pnpm -r test`
Expected: every package's test suite passes, including the new `confidence.test.ts`, `refactor-safety.test.ts`, `recover.test.ts`, `next.test.ts`, and every modified existing file.

- [ ] **Step 3: `ycf release` self-check**

Run: `node packages/cli/dist/index.js release . --dependencies`
Expected: `YCF — READY` (this repo's own established CI gate; confirms the new commands/types didn't regress the repo's own release readiness).

- [ ] **Step 4: Record both manual smoke runs**

Confirm the real output captured in Task 4 Step 8 (`ycf recover .`) and Task 5 Step 9 (`ycf next .`) is included in the final task report, alongside the typecheck/test/release results above. This is the plan's own "prove it with a real run" requirement — do not close this task on green tests alone.

- [ ] **Step 5: Commit (only if Steps 1-3 required any fix)**

If everything was already green, there is nothing to commit for this task. If a fix was needed, commit it with a message describing exactly what broke and why (e.g. `fix(core): <what>`), then re-run Steps 1-3 to confirm green before considering the plan complete.
