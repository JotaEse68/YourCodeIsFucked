# YCF Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every remaining technical and operational gap identified on 2026-08-17 so YCF can be shared publicly without shipping anything half-done: architecture before/after reporting, a comprehensive architectural plan, semantic-shape duplicate candidates, CONSOLIDATE public-API safety, EXTRACT test visibility, expanded reference-rewrite test coverage, a complete 12-point acceptance demo, GitHub Release/npm housekeeping, and a real one-click Cockpit execution server.

**Architecture:** All engine work lands in `packages/core/src` (audit -> understand -> refactor-planner -> refactor-executor -> refactor-operations pipeline already exists and is not restructured). The Cockpit gains a small local `node:http` server started by `ycf cockpit`, replacing the current copy-to-clipboard flow with live read-only re-checks, gated by a per-session random token before anything runs.

**Tech Stack:** TypeScript (NodeNext ESM), Vitest, the TypeScript Compiler API (`typescript` package, already a dependency), Node's built-in `node:http`/`node:crypto` (no new runtime dependencies).

**Spec:** This plan implements the 11-item punch list agreed in conversation on 2026-08-17 (mapped 1:1 to Tasks 1-11 below), plus Task 12 added the same day once Jota clarified the actual priority is the agent/skill experience -- **execute Task 12 first**. Cross-checked against `YCF-YourCodeIsFucked-SPEC-Codex.md` section 10 (risk classification), section 11 (professional substitution rule), section 28 (Deterministic Core vs. Agent Intelligence split -- Task 12 lives entirely in the Agent Intelligence layer, by design), section 37 restriction 4 ("never delete code without checking references") and restriction 10 (avoid over-architecture).

## Global Constraints

- Every new engine feature must stay deterministic -- no LLM calls, no invented metrics (spec section 37 restrictions 1-2, 10).
- Every destructive/structural operation must remain reversible with an explicit `undo()` (existing `AppliedOperation` contract in `refactor-operations.ts`).
- Never silently apply anything classified `SUPERVISED` or `BLOCKED` -- surfacing a finding is always safe; executing it never is without approval (spec section 10).
- Each task is validated with `corepack pnpm --filter @jotaese68/core typecheck`, `corepack pnpm --filter @jotaese68/core test`, and (for CLI-facing tasks) `corepack pnpm --filter @jotaese68/ycf typecheck` plus a manual smoke run -- before commit.
- One commit per task, following the existing repo convention (`type(scope): summary`), pushed only after CI (`Validate YCF`) is green.
- No feature flags, no backwards-compat shims -- this is pre-1.0, change things directly.

---

## Task 1: Architecture BEFORE/AFTER in the refactor execution report

**Files:**
- Modify: `packages/core/src/refactor-types.ts` (tighten the `architecture?: unknown` fields to a real type, around lines 30-34)
- Modify: `packages/core/src/refactor-executor.ts` (capture graph snapshots)
- Modify: `packages/core/src/reporters.ts` (render the diff to Markdown)
- Modify: `packages/core/src/index.ts` (export the two new functions)
- Test: `packages/core/src/refactor-executor.test.ts`

**Interfaces:**
- Consumes: `understand(target: string): UnderstandReport` (`index.ts` line 617), specifically `UnderstandReport['graph']` shaped `{ nodes: Array<{id,file,kind,entryPoint}>; edges: Array<{from,to,kind}>; cycles: string[][] }` (`types.ts` lines 31-35).
- Produces: `RefactorExecutionReport.before.architecture` / `.after.architecture`, both typed `UnderstandReport['graph']`. New function `architectureDiff(before, after)` returning `{ addedModules: string[]; removedModules: string[]; addedEdges: number; removedEdges: number; cyclesBefore: number; cyclesAfter: number }` in `reporters.ts`, and `writeRefactorExecutionReport(target: string, report: RefactorExecutionReport): { jsonPath: string; markdownPath: string }` (new, following the existing `writeUnfuckReport` pattern in the same file).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/refactor-executor.test.ts`, inside the existing `describe('architectural refactor executor', ...)` block. Reuse the file's own top-level `block(...)` helper (line 10) and the exact same inline `mkdtempSync` + `write` closure pattern every other test in this file already uses (see the first test at line 13-14):

```typescript
it('captures architecture before and after the run', () => {
  const root = mkdtempSync(join(tmpdir(), 'ycf-architecture-'));
  const write = (file: string, content: string) => { const path = join(root, file); mkdirSync(path.slice(0, path.lastIndexOf('\\')), { recursive: true }); writeFileSync(path, content); };
  write('src/legacy/math.ts', 'export const add = (a: number, b: number) => a + b;\n');
  write('src/app.ts', "import { add } from './legacy/math';\nconsole.log(add(1, 2));\n");
  const plan: ArchitecturalRefactorPlan = { version: 2, target: root, generatedAt: new Date().toISOString(), sourceFindings: [], summary: { auto: 1, safeRefactor: 1, supervised: 0, architectural: 0, blocked: 0 }, blocks: [
    block('RF-MOVE', [{ id: 'op-move', kind: 'MOVE', description: 'move math module', source: 'src/legacy/math.ts', destination: 'src/lib/math.ts', updateImports: true }])
  ] };
  const report = executeRefactorPlan(root, plan, { createGitCheckpoint: false });
  expect(report.before.architecture?.nodes.some((node) => node.file === 'src/legacy/math.ts')).toBe(true);
  expect(report.after.architecture?.nodes.some((node) => node.file === 'src/legacy/math.ts')).toBe(false);
  expect(report.after.architecture?.edges.length).toBeGreaterThan(0);
});
```

`mkdirSync` is already imported at the top of this test file alongside `mkdtempSync` -- no new import needed here.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-executor`
Expected: FAIL -- `report.before.architecture` is `undefined`.

- [ ] **Step 3: Tighten the type**

In `packages/core/src/refactor-types.ts`, change:

```typescript
before?: { files: string[]; architecture?: unknown }; after?: { files: string[]; architecture?: unknown };
```

to:

```typescript
before?: { files: string[]; architecture?: UnderstandReport['graph'] }; after?: { files: string[]; architecture?: UnderstandReport['graph'] };
```

Add `import type { UnderstandReport } from './types.js';` to the top of `refactor-types.ts`.

- [ ] **Step 4: Capture the snapshots in the executor**

In `packages/core/src/refactor-executor.ts`, add `import { understand } from './index.js';` (this is a one-directional import -- `index.ts` does not import `refactor-executor.ts`, only `refactor-planner.ts` does, so no cycle is introduced). At the top of `executeRefactorPlan`, alongside the existing `const beforeFiles = sourceSnapshot(root);` line, add `const beforeArchitecture = understand(root).graph;`. At the end, change the return statement's `before`/`after` fields from `before: { files: beforeFiles }, after: { files: sourceSnapshot(root) }` to:

```typescript
before: { files: beforeFiles, architecture: beforeArchitecture }, after: { files: sourceSnapshot(root), architecture: understand(root).graph }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-executor`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 6: Add the diff renderer**

In `packages/core/src/reporters.ts`, add `RefactorExecutionReport` to the existing `import type { ... } from './refactor-types.js';`-style import (check whether `reporters.ts` currently imports anything from `refactor-types.js` -- it doesn't yet, so add a new line: `import type { RefactorExecutionReport } from './refactor-types.js';`) and add `UnderstandReport` to the existing `import type { ... } from './types.js';` line. Then add:

```typescript
export function architectureDiff(before: UnderstandReport['graph'] | undefined, after: UnderstandReport['graph'] | undefined): { addedModules: string[]; removedModules: string[]; addedEdges: number; removedEdges: number; cyclesBefore: number; cyclesAfter: number } {
  const beforeFiles = new Set((before?.nodes ?? []).map((node) => node.file));
  const afterFiles = new Set((after?.nodes ?? []).map((node) => node.file));
  const edgeKey = (edge: { from: string; to: string }) => `${edge.from}->${edge.to}`;
  const beforeEdges = new Set((before?.edges ?? []).map(edgeKey));
  const afterEdges = new Set((after?.edges ?? []).map(edgeKey));
  return {
    addedModules: [...afterFiles].filter((file) => !beforeFiles.has(file)).sort(),
    removedModules: [...beforeFiles].filter((file) => !afterFiles.has(file)).sort(),
    addedEdges: [...afterEdges].filter((edge) => !beforeEdges.has(edge)).length,
    removedEdges: [...beforeEdges].filter((edge) => !afterEdges.has(edge)).length,
    cyclesBefore: before?.cycles.length ?? 0,
    cyclesAfter: after?.cycles.length ?? 0
  };
}

export function writeRefactorExecutionReport(target: string, report: RefactorExecutionReport): { jsonPath: string; markdownPath: string } {
  const output = join(resolve(target), '.ycf');
  mkdirSync(output, { recursive: true });
  const jsonPath = join(output, 'refactor-execution.json');
  const markdownPath = join(output, 'refactor-execution.md');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const diff = architectureDiff(report.before?.architecture, report.after?.architecture);
  const blocks = report.blocks.map((block) => `- \`${block.id}\` **${block.status}** -- ${block.goal}`).join('\n') || '- No blocks.';
  writeFileSync(markdownPath, `# YCF refactor execution report\n\nStatus: **${report.status.toUpperCase()}**\n\nStarted: ${report.startedAt}\nCompleted: ${report.completedAt}\n\n## Architecture\n\n- Modules added: ${diff.addedModules.map((file) => `\`${file}\``).join(', ') || 'none'}\n- Modules removed: ${diff.removedModules.map((file) => `\`${file}\``).join(', ') || 'none'}\n- Import edges added: ${diff.addedEdges}\n- Import edges removed: ${diff.removedEdges}\n- Dependency cycles before: ${diff.cyclesBefore}\n- Dependency cycles after: ${diff.cyclesAfter}\n\n## Blocks\n\n${blocks}\n\n## Rollback events\n\n${report.rollbackEvents.length ? report.rollbackEvents.map((event) => `- \`${event.blockId}\`: ${event.reason} (undone: ${event.operationsUndone.join(', ') || 'none'})`).join('\n') : '- None.'}\n`, 'utf8');
  return { jsonPath, markdownPath };
}
```

- [ ] **Step 7: Export the new functions and run full core tests**

In `packages/core/src/index.ts`, find where `reporters.js` functions are re-exported (e.g. `writeAuditReport`, `writeUnfuckReport`) and add `writeRefactorExecutionReport` and `architectureDiff` to that same export surface, the same way the others are exposed.

Run: `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test`
Expected: PASS, 0 type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/refactor-types.ts packages/core/src/refactor-executor.ts packages/core/src/reporters.ts packages/core/src/refactor-executor.test.ts packages/core/src/index.ts
git commit -m "feat(core): report architecture before/after a refactor run"
```

---

## Task 2: Bridge the architectural plan to every refactorable finding, not just duplicates

**Context:** `buildArchitecturalRefactorPlan` (`refactor-planner.ts`) today only turns `understanding.duplicates` into blocks. Findings like `god-component`, `large-source-file`, `long-function`, `high-complexity` already get advisory text via `buildRefactorPlan` (`planner.ts`), but never appear as a block in `.ycf/architectural-refactor-plan.json` -- so the executable plan and the advisory plan are two disconnected outputs. Automatically deciding *where exactly* to cut a god component is not safe to fabricate deterministically (spec section 37 restriction 10, avoid over-architecture) -- so this task makes the architectural plan **comprehensive**, not more automatic: every refactorable finding becomes a real `SUPERVISED` block with the existing guidance attached and `operations: []`, so a human (or an agent, per the `ycf-quality-gate` skill) can review one single plan that covers everything YCF found, not just duplicates.

**Files:**
- Modify: `packages/core/src/refactor-planner.ts`
- Test: `packages/core/src/index.test.ts`

**Interfaces:**
- Consumes: `buildRefactorPlan(audit: AuditReport, understanding: UnderstandReport, language?, audience?): RefactorPlan` (`planner.ts` line 51), specifically `RefactorPlan.recommendations: RefactorRecommendation[]` where each item has `id, title, risk, file, lines, why, suggestedAction, affectedModules, requiresHumanReview, steps, stopIf` (`types.ts` lines 64-69).
- Produces: `buildArchitecturalRefactorPlan` blocks now include one `type: 'SUPERVISED_REVIEW'` block per non-duplicate `RefactorRecommendation`, in addition to the existing duplicate-derived blocks.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/index.test.ts`, reusing the exact fixture already proven a few tests above it in the same file (search for the test named `'reports oversized React components and effects without dependencies without changing them'`, which triggers `large-react-component` using a `ycf.config.yml` with a low `max_function_lines` plus a small `Dashboard.tsx`) and the same `temporaryDirectories.push(...)` cleanup convention every test in this file uses:

```typescript
it('includes every refactorable finding as a block, not only duplicates', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ycf-'));
  temporaryDirectories.push(directory);
  writeFileSync(join(directory, 'ycf.config.yml'), 'refactor:\n  max_function_lines: 3\n');
  writeFileSync(join(directory, 'Dashboard.tsx'), [
    "import { useEffect } from 'react';",
    'export function Dashboard() {',
    '  useEffect(() => { loadDashboard(); });',
    "  const heading = 'Dashboard';",
    '  return <section>{heading}</section>;',
    '}'
  ].join('\n'));
  const plan = buildArchitecturalRefactorPlan(directory);
  const reviewBlocks = plan.blocks.filter((block) => block.type === 'SUPERVISED_REVIEW');
  expect(reviewBlocks.length).toBeGreaterThan(0);
  expect(reviewBlocks[0].mode).toBe('SUPERVISED');
  expect(reviewBlocks[0].operations).toEqual([]);
});
```

Add `buildArchitecturalRefactorPlan` to the existing multi-name import from `'./index.js'` at the top of `index.test.ts` -- it is not imported there yet, only `refactorPlan` is (check the current import line before editing it).

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- index.test`
Expected: FAIL -- no `SUPERVISED_REVIEW` blocks exist yet.

- [ ] **Step 3: Implement the bridge**

In `packages/core/src/refactor-planner.ts`, add `import { buildRefactorPlan } from './planner.js';` and `import type { RefactorRecommendation } from './types.js';`. Change the function body: keep the existing duplicate-block computation exactly as it is today but assign it to a named `const duplicateBlocks = ...` instead of inlining it directly as `blocks:`, then add:

```typescript
const guidancePlan = buildRefactorPlan(auditReport, understanding);
const reviewBlocks: RefactorBlock[] = guidancePlan.recommendations
  .filter((recommendation) => !recommendation.id.startsWith('refactor:duplicate-code:') && !recommendation.id.startsWith('refactor:similar-duplicate-code:'))
  .map((recommendation, index): RefactorBlock => reviewBlockFrom(recommendation, index));
const blocks = explicitBlocks.length ? explicitBlocks : [...duplicateBlocks, ...reviewBlocks];
```

Note the function currently computes `const findings = audit(root).findings;` -- rename that local call so both `findings` and the full report are available: `const auditReport = audit(root); const findings = auditReport.findings;`. Add the helper function below `buildArchitecturalRefactorPlan`:

```typescript
function reviewBlockFrom(recommendation: RefactorRecommendation, index: number): RefactorBlock {
  return {
    id: `RF-REVIEW-${String(index + 1).padStart(3, '0')}`, type: 'SUPERVISED_REVIEW', goal: recommendation.title, reason: recommendation.why,
    risk: recommendation.risk === 'architectural' ? 'HIGH' : 'MEDIUM', confidence: 70, mode: 'SUPERVISED',
    files: [recommendation.file], dependencies: [], affectedModules: recommendation.affectedModules, preconditions: recommendation.stopIf,
    operations: [], validation: [], rollback: [], status: 'PLANNED'
  };
}
```

`RefactorBlock.risk` accepts `'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'` (`refactor-types.ts` line 3) -- `'MEDIUM'` is a valid existing value.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS, all core tests including the new one.

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/refactor-planner.ts packages/core/src/index.test.ts
git commit -m "feat(core): include every refactorable finding in the architectural plan"
```

---

## Task 3: Semantic-shape duplicate candidates

**Context:** Today `duplicates.ts` finds `exact` (byte-identical after whitespace normalization) and `similar` (structurally normalized 6-line windows compared by token-overlap ratio). Neither catches two functions that do the same thing with a genuinely different shape. Full semantic equivalence is undecidable in general -- this task adds one honest, deterministic step further than today: compare the sequence of AST statement kinds inside each function-like declaration (ignoring identifiers, literals, and comments entirely, keeping statement order), and flag two *different* functions whose statement-kind sequences match as a `kind: 'semantic'` candidate, always `certainty: 'possible'`, never auto-consolidated.

**Files:**
- Modify: `packages/core/src/duplicates.ts`
- Modify: `packages/core/src/types.ts` (`DuplicateGroup.kind` gains `'semantic'`, `certainty` gains `'possible'`, around lines 20-23; `Finding['ruleId']` union gains `'possible-semantic-duplicate'`, around line 9)
- Modify: `packages/core/src/index.ts` (finding text for the new kind, mirroring the existing `duplicate-code`/`similar-duplicate-code` pattern)
- Test: `packages/core/src/index.test.ts`

**Interfaces:**
- Consumes: TypeScript Compiler API, imported the same way `refactor-operations.ts` already does it: `import ts from 'typescript';`.
- Produces: `duplicateGroups(target, files)` return array gains entries with `kind: 'semantic'`, `certainty: 'possible'`. New `ruleId: 'possible-semantic-duplicate'` finding via `duplicateFindings`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/index.test.ts`, using the same `mkdtempSync` + `temporaryDirectories.push(...)` convention as every other test in the file:

```typescript
it('flags two differently-named functions with the same statement shape as a possible semantic duplicate', () => {
  const target = mkdtempSync(join(tmpdir(), 'ycf-'));
  temporaryDirectories.push(target);
  writeFileSync(join(target, 'sum-loop.ts'), 'export function sumLoop(items: number[]): number {\n  let total = 0;\n  for (const item of items) {\n    total += item;\n  }\n  return total;\n}\n');
  writeFileSync(join(target, 'add-all.ts'), 'export function addAll(values: number[]): number {\n  let result = 0;\n  for (const value of values) {\n    result += value;\n  }\n  return result;\n}\n');
  const groups = duplicateGroups(target, [join(target, 'sum-loop.ts'), join(target, 'add-all.ts')]);
  const semantic = groups.find((group) => group.kind === 'semantic');
  expect(semantic).toBeDefined();
  expect(semantic?.certainty).toBe('possible');
});
```

`duplicateGroups` is already imported at the top of `index.test.ts` (line 6) -- no new import needed for the test itself.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- index.test`
Expected: FAIL -- no `kind: 'semantic'` entries exist.

- [ ] **Step 3: Add the union members**

In `packages/core/src/types.ts`, change:

```typescript
export interface DuplicateGroup {
  id: string; kind: 'exact' | 'similar'; certainty: 'confirmed' | 'likely'; similarity: number; lines: number;
  occurrences: Array<{ file: string; startLine: number; endLine: number }>;
}
```

to:

```typescript
export interface DuplicateGroup {
  id: string; kind: 'exact' | 'similar' | 'semantic'; certainty: 'confirmed' | 'likely' | 'possible'; similarity: number; lines: number;
  occurrences: Array<{ file: string; startLine: number; endLine: number }>;
}
```

Add `'possible-semantic-duplicate'` to the long `Finding['ruleId']` union type (the line ending in `'unused-production-dependency'`).

- [ ] **Step 4: Implement the AST-shape fingerprint**

In `packages/core/src/duplicates.ts`, add near the top (after the existing imports):

```typescript
import ts from 'typescript';

function statementShape(node: ts.Node): string {
  const parts: string[] = [];
  const visit = (current: ts.Node) => { parts.push(ts.SyntaxKind[current.kind]); ts.forEachChild(current, visit); };
  visit(node);
  return parts.join('|');
}

function functionLikeDeclarations(file: string, text: string): Array<{ file: string; startLine: number; endLine: number; shape: string }> {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.tsx?$/i.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
  const results: Array<{ file: string; startLine: number; endLine: number; shape: string }> = [];
  const visit = (node: ts.Node) => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.body) {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const end = source.getLineAndCharacterOfPosition(node.end).line + 1;
      if (end - start >= 2) results.push({ file, startLine: start, endLine: end, shape: statementShape(node.body) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return results;
}

function semanticDuplicateGroups(target: string, files: string[]): DuplicateGroup[] {
  const byShape = new Map<string, Array<{ file: string; startLine: number; endLine: number }>>();
  for (const file of files.filter((candidate) => /\.(?:tsx?|jsx?)$/i.test(candidate))) {
    for (const declaration of functionLikeDeclarations(relative(target, file), readFileSync(file, 'utf8'))) {
      const key = declaration.shape;
      byShape.set(key, [...(byShape.get(key) ?? []), { file: declaration.file, startLine: declaration.startLine, endLine: declaration.endLine }]);
    }
  }
  return [...byShape.values()]
    .filter((occurrences) => occurrences.length > 1 && new Set(occurrences.map((occurrence) => occurrence.file)).size > 1)
    .map((occurrences) => ({ id: `possible-semantic-duplicate:${occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(':')}`, kind: 'semantic' as const, certainty: 'possible' as const, similarity: 1, lines: occurrences[0].endLine - occurrences[0].startLine, occurrences }));
}
```

`relative` and `readFileSync` are already imported at the top of `duplicates.ts`. In `duplicateGroups`, change the final `return [...exact, ...similar];` to `return [...exact, ...similar, ...semanticDuplicateGroups(target, files)];`.

- [ ] **Step 5: Wire the finding text**

In `packages/core/src/duplicates.ts`, inside `duplicateFindings`'s `.map()`, change the ternary that currently picks between `group.kind === 'exact'` and the `similar` text into a three-way branch:

```typescript
evidence: group.kind === 'exact'
  ? `Confirmed: an exact normalized ${group.lines}-line block appears in ${group.occurrences.length} locations (${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}). Review behavior and consumers before consolidation.`
  : group.kind === 'similar'
  ? `Likely duplicate: structurally similar ${group.lines}-line blocks have ${Math.round(group.similarity * 100)}% lexical overlap in ${group.occurrences.length} locations (${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}). Names or values differ, so compare behavior, errors, and consumers before consolidation.`
  : `Possible semantic duplicate: these functions share the exact same statement shape despite different names, in ${group.occurrences.map((occurrence) => `${occurrence.file}:${occurrence.startLine}`).join(', ')}. This is a shape match, not a proven behavior match -- read both before treating them as the same thing.`,
```

and change `ruleId: group.kind === 'exact' ? 'duplicate-code' : 'similar-duplicate-code',` to `ruleId: group.kind === 'exact' ? 'duplicate-code' : group.kind === 'similar' ? 'similar-duplicate-code' : 'possible-semantic-duplicate',`.

- [ ] **Step 6: Run test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/duplicates.ts packages/core/src/types.ts packages/core/src/index.test.ts
git commit -m "feat(core): detect possible semantic duplicates by AST statement shape"
```

---

## Task 4: CONSOLIDATE -- refuse to merge a duplicate that's part of a public API or re-export

**Context:** `applyRefactorOperation`'s `CONSOLIDATE` branch (`refactor-operations.ts`, near line 89) today only checks the two files are byte-identical. It does not check whether the file being deleted is re-exported elsewhere (`export * from './duplicate.js'` / `export { X } from './duplicate.js'`) or referenced from `package.json`'s own `main`/`exports` field.

**Files:**
- Modify: `packages/core/src/refactor-operations.ts`
- Test: create `packages/core/src/refactor-operations.test.ts` (this file does not exist yet -- operation-level tests currently only live indirectly inside `refactor-executor.test.ts`)

**Interfaces:**
- Consumes: nothing new -- reuses the existing `walk(root)`, `resolveImport`, `aliases`, `sameModule`, `stripExt` helpers already defined in `refactor-operations.ts`.
- Produces: `applyRefactorOperation` throws `Error('BLOCKED: duplicate file is re-exported or referenced from package.json exports; consolidating would change a public contract.')` before performing the CONSOLIDATE, when applicable.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/refactor-operations.test.ts`:

```typescript
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyRefactorOperation } from './refactor-operations.js';

describe('CONSOLIDATE safety', () => {
  it('blocks consolidating a file that is re-exported from package.json exports', () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-consolidate-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    write('package.json', JSON.stringify({ name: 'fixture', exports: { './extra': './src/duplicate.js' } }));
    write('src/canonical.js', 'export const value = 1;\n');
    write('src/duplicate.js', 'export const value = 1;\n');
    expect(() => applyRefactorOperation(target, { id: 'op-1', kind: 'CONSOLIDATE', description: 'test', canonicalFile: 'src/canonical.js', duplicateFile: 'src/duplicate.js', symbol: 'value' })).toThrow(/BLOCKED/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations`
Expected: FAIL -- the consolidate currently succeeds instead of throwing.

- [ ] **Step 3: Implement the check**

In `packages/core/src/refactor-operations.ts`, add a helper near `sameModule`:

```typescript
function isPubliclyReferenced(root: string, duplicateFile: string): boolean {
  const packageJsonPath = resolve(root, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { main?: string; exports?: unknown };
      const referenced = [pkg.main, JSON.stringify(pkg.exports ?? {})].filter(Boolean).join(' ');
      const normalized = relative(root, resolve(root, duplicateFile)).replaceAll('\\', '/');
      if (referenced.includes(normalized) || referenced.includes(stripExt(normalized))) return true;
    } catch { /* malformed package.json is out of scope here */ }
  }
  const reexportPattern = /\bexport\s*(?:\*|\{[^}]*\})\s*from\s*(["'])([^"']+)\1/g;
  const duplicateAbs = resolve(root, duplicateFile);
  for (const file of walk(root)) {
    if (resolve(file) === duplicateAbs) continue;
    const text = readFileSync(file, 'utf8'); let match: RegExpExecArray | null;
    while ((match = reexportPattern.exec(text))) { const resolved = resolveImport(file, match[2], root, aliases(root)); if (resolved && sameModule(resolved, duplicateAbs)) return true; }
  }
  return false;
}
```

At the top of the `CONSOLIDATE` branch in `applyRefactorOperation`, before the existing byte-identical check, add the `isPubliclyReferenced` check so the branch reads:

```typescript
if (operation.kind === 'CONSOLIDATE') {
  const canonical = resolve(root, operation.canonicalFile); const duplicate = resolve(root, operation.duplicateFile);
  if (isPubliclyReferenced(root, operation.duplicateFile)) throw new Error('BLOCKED: duplicate file is re-exported or referenced from package.json exports; consolidating would change a public contract.');
  if (readFileSync(canonical, 'utf8').replace(/\s/g, '') !== readFileSync(duplicate, 'utf8').replace(/\s/g, '')) throw new Error('SUPERVISED: files are not exact duplicates.');
  // ...rest of the existing branch body is unchanged below this point
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations`
Expected: PASS.

- [ ] **Step 5: Run the full core suite (regression check)**

Run: `corepack pnpm --filter @jotaese68/core test`
Expected: PASS -- the CONSOLIDATE test inside `refactor-executor.test.ts` (the first, largest test in that file) has no `package.json` in its fixture and no re-export of `api-copy.ts`, so it is unaffected by this new check.

- [ ] **Step 6: Typecheck**

Run: `corepack pnpm --filter @jotaese68/core typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/refactor-operations.ts packages/core/src/refactor-operations.test.ts
git commit -m "fix(core): block CONSOLIDATE on re-exported or publicly-referenced duplicates"
```

---

## Task 5: EXTRACT -- identify and surface related test files

**Context:** Because `EXTRACT` leaves a re-export in the original file, existing test imports never break. What's missing is visibility: nothing tells a reviewer which test file(s) exercise the extracted code, so they know what to run and check by hand. This task adds identification and surfacing, not file moves.

**Files:**
- Modify: `packages/core/src/refactor-operations.ts` (`AppliedOperation` interface and `applyRefactorOperation`)
- Modify: `packages/core/src/refactor-types.ts` (`OperationRecord` gains `relatedTestFiles`)
- Modify: `packages/core/src/refactor-executor.ts` (surface it into the pushed `OperationRecord`)
- Test: `packages/core/src/refactor-operations.test.ts` (created in Task 4)

**Interfaces:**
- Produces: `AppliedOperation.relatedTestFiles: string[]` (repo-relative, POSIX-slash paths); `OperationRecord.relatedTestFiles: string[]` (same shape).

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/refactor-operations.test.ts`:

```typescript
it('identifies test files that reference the extracted export', () => {
  const target = mkdtempSync(join(tmpdir(), 'ycf-extract-'));
  const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
  write('src/math.ts', 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
  write('src/math.test.ts', "import { add } from './math.js';\nimport { test } from 'node:test';\ntest('adds', () => add(1, 2));\n");
  const result = applyRefactorOperation(target, { id: 'op-1', kind: 'EXTRACT', description: 'test', sourceFile: 'src/math.ts', targetFile: 'src/add.ts', range: { startLine: 1, endLine: 3 }, exportedNames: ['add'] });
  expect(result.relatedTestFiles).toContain('src/math.test.ts');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations`
Expected: FAIL -- `relatedTestFiles` is `undefined`.

- [ ] **Step 3: Add the field to the interfaces**

`AppliedOperation` is declared in `packages/core/src/refactor-operations.ts` (not `refactor-types.ts`). Change:

```typescript
export interface AppliedOperation { operationId: string; changedFiles: string[]; description: string; undo: () => void; }
```

to:

```typescript
export interface AppliedOperation { operationId: string; changedFiles: string[]; description: string; relatedTestFiles: string[]; undo: () => void; }
```

In `packages/core/src/refactor-types.ts`, update `OperationRecord`:

```typescript
export interface OperationRecord { operationId: string; kind: RefactorOperationKind; changedFiles: string[]; description: string; relatedTestFiles: string[]; undone: boolean; }
```

- [ ] **Step 4: Implement the scan**

In `packages/core/src/refactor-operations.ts`, add a helper:

```typescript
function relatedTestFiles(root: string, exportedNames: string[]): string[] {
  const testFilePattern = /\.(test|spec)\.[cm]?[jt]sx?$/i;
  const nameBoundary = exportedNames.map((name) => `\\b${name}\\b`).join('|');
  if (!nameBoundary) return [];
  const pattern = new RegExp(nameBoundary);
  return walk(root).filter((file) => testFilePattern.test(file) && pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file).replaceAll('\\', '/')).sort();
}
```

In every `return { operationId: id, ... }` inside `applyRefactorOperation` for MOVE/RENAME/CREATE/DELETE/EDIT_IMPORT/EDIT_EXPORT/CONSOLIDATE, add `relatedTestFiles: [],` (these operation kinds don't need the scan). For the `EXTRACT` branch's return, compute it: `relatedTestFiles: relatedTestFiles(root, operation.exportedNames)`.

- [ ] **Step 5: Surface it in the executor's operation log**

In `packages/core/src/refactor-executor.ts`, find `operationLog.push({ operationId: result.operationId, kind: operation.kind, changedFiles: result.changedFiles, description: result.description, undone: false });` and add `relatedTestFiles: result.relatedTestFiles,` to the pushed object.

- [ ] **Step 6: Run test to verify it passes**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations`
Expected: PASS.

- [ ] **Step 7: Run full suite + typecheck**

Run: `corepack pnpm --filter @jotaese68/core test && corepack pnpm --filter @jotaese68/core typecheck`
Expected: PASS, 0 errors. If any existing test does a strict `toEqual` on a full operation-log entry object, update its expected object to include `relatedTestFiles: []` (or the real expected list).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/refactor-operations.ts packages/core/src/refactor-types.ts packages/core/src/refactor-executor.ts packages/core/src/refactor-operations.test.ts
git commit -m "feat(core): surface test files related to an EXTRACT operation"
```

---

## Task 6: Expand reference-rewrite test coverage (aliases, export-from, require, dynamic import)

**Context:** `rewriteReferences` in `refactor-operations.ts` already implements alias resolution, `export ... from`, `require()`, and `import()`. What's missing is individual test proof for each form, so a regression in one doesn't hide behind the others.

**Files:**
- Test only: `packages/core/src/refactor-operations.test.ts`

- [ ] **Step 1: Write four coverage tests**

Add to `packages/core/src/refactor-operations.test.ts`:

```typescript
describe('reference rewriting coverage', () => {
  const setup = () => {
    const target = mkdtempSync(join(tmpdir(), 'ycf-refs-'));
    const write = (file: string, content: string) => { mkdirSync(join(target, file, '..'), { recursive: true }); writeFileSync(join(target, file), content, 'utf8'); };
    return { target, write };
  };

  it('rewrites a tsconfig path alias on move', () => {
    const { target, write } = setup();
    write('tsconfig.json', JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@lib/*': ['src/lib/*'] } } }));
    write('src/lib/math.ts', 'export const add = (a: number, b: number) => a + b;\n');
    write('src/app.ts', "import { add } from '@lib/math';\nexport { add };\n");
    applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move', source: 'src/lib/math.ts', destination: 'src/lib/numbers/math.ts', updateImports: true });
    expect(readFileSync(join(target, 'src/app.ts'), 'utf8')).toMatch(/@lib\/numbers\/math|\.\/lib\/numbers\/math/);
  });

  it('rewrites export-from on move', () => {
    const { target, write } = setup();
    write('src/math.ts', 'export const add = (a: number, b: number) => a + b;\n');
    write('src/index.ts', "export { add } from './math.js';\n");
    applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move', source: 'src/math.ts', destination: 'src/lib/math.ts', updateImports: true });
    expect(readFileSync(join(target, 'src/index.ts'), 'utf8')).toContain('./lib/math.js');
  });

  it('rewrites require() on move', () => {
    const { target, write } = setup();
    write('src/math.js', 'module.exports.add = (a, b) => a + b;\n');
    write('src/app.js', "const { add } = require('./math.js');\nmodule.exports = { add };\n");
    applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move', source: 'src/math.js', destination: 'src/lib/math.js', updateImports: true });
    expect(readFileSync(join(target, 'src/app.js'), 'utf8')).toContain('./lib/math.js');
  });

  it('rewrites dynamic import() on move', () => {
    const { target, write } = setup();
    write('src/math.ts', 'export const add = (a: number, b: number) => a + b;\n');
    write('src/app.ts', "export async function load() {\n  const { add } = await import('./math.js');\n  return add;\n}\n");
    applyRefactorOperation(target, { id: 'op-1', kind: 'MOVE', description: 'move', source: 'src/math.ts', destination: 'src/lib/math.ts', updateImports: true });
    expect(readFileSync(join(target, 'src/app.ts'), 'utf8')).toContain('./lib/math.js');
  });
});
```

- [ ] **Step 2: Run and observe results**

Run: `corepack pnpm --filter @jotaese68/core test -- refactor-operations`
Expected: All four PASS immediately (they exercise already-implemented behavior). **If any fails**, that is a real regression in `rewriteReferences` -- fix it in `refactor-operations.ts` before proceeding; do not weaken the test to make it pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/refactor-operations.test.ts
git commit -m "test(core): cover alias, export-from, require, and dynamic import rewriting"
```

---

## Task 7: Complete the acceptance demo to all 12 required scenarios

**Context:** `scripts/acceptance-demo.mjs` today covers move, update-importers, update-internal-imports, verify, controlled failure, isolated rollback, and before/after diff (scenarios A, C, D, G, H, I, K). Missing: **B** (successful rename), **E** (extract), **F** (consolidate), **J** (an independent block continuing after a sibling fails), **L** (architecture before/after, available after Task 1). Note the unit test at the top of `refactor-executor.test.ts` already proves the underlying engine handles rename/extract/consolidate/independent-continuation correctly -- this task is only about extending the *external, reproducible* demo script to show the same thing, not new engine work.

**Files:**
- Modify: `scripts/acceptance-demo.mjs`
- Modify: `docs/ACCEPTANCE-DEMO.md`

**Interfaces:**
- Consumes: `executeRefactorPlan` (unchanged), `RefactorExecutionReport.before.architecture`/`.after.architecture` (from Task 1).

- [ ] **Step 1: Extend the fixture with rename, extract, and consolidate material**

In `scripts/acceptance-demo.mjs`, after the existing `write(...)` calls and before `git(['init', '-q'])`, add:

```javascript
write('src/legacy/greeting.mjs', 'export const greet = (name) => `hi ${name}`;\n');
write('src/legacy/helper.mjs', 'export function formatTotal(total) {\n  return `Total: ${total}`;\n}\n\nexport function unrelated() {\n  return true;\n}\n');
write('src/duplicate-a.mjs', 'export const label = () => "checkout";\n');
write('src/duplicate-b.mjs', 'export const label = () => "checkout";\n');
```

- [ ] **Step 2: Add BLOCK-003 (rename), BLOCK-004 (extract), BLOCK-005 (consolidate)**

Replace the `plan` object's `blocks` array with:

```javascript
blocks: [
  block('BLOCK-001', [{ id: 'move-feature', kind: 'MOVE', description: 'Move feature and update every static reference', source: 'src/legacy/feature.mjs', destination: 'src/features/feature.mjs', updateImports: true }]),
  block('BLOCK-002', [{ id: 'create-temporary-file', kind: 'CREATE', description: 'Create a file that must be rolled back with this failed block', file: 'src/features/should-not-survive.mjs', content: 'export const broken = true;\n' }, { id: 'controlled-failure', kind: 'RENAME', description: 'Controlled failure after the first operation', source: 'src/features/missing.mjs', destination: 'src/features/never-created.mjs', updateImports: true }], ['BLOCK-001']),
  block('BLOCK-003', [{ id: 'rename-greeting', kind: 'RENAME', description: 'Rename a module and update every static reference', source: 'src/legacy/greeting.mjs', destination: 'src/features/salutation.mjs', updateImports: true }]),
  block('BLOCK-004', [{ id: 'extract-format-total', kind: 'EXTRACT', description: 'Extract formatTotal into its own module', sourceFile: 'src/legacy/helper.mjs', targetFile: 'src/features/format-total.mjs', range: { startLine: 1, endLine: 3 }, exportedNames: ['formatTotal'] }]),
  block('BLOCK-005', [{ id: 'consolidate-duplicate-label', kind: 'CONSOLIDATE', description: 'Consolidate an exact duplicate module', canonicalFile: 'src/duplicate-a.mjs', duplicateFile: 'src/duplicate-b.mjs', symbol: 'label' }])
] };
```

BLOCK-003/004/005 have no `dependencies` on BLOCK-002 and still run and succeed even though BLOCK-002 failed -- that is scenario **J**, demonstrated by the fact these blocks appear in `keptBlocks` alongside `BLOCK-001` while `BLOCK-002` is the only one in `rolledBackBlocks`.

- [ ] **Step 3: Assert the new scenarios**

After the existing `assert.*` calls, add:

```javascript
assert.deepEqual(result.keptBlocks.sort(), ['BLOCK-001', 'BLOCK-003', 'BLOCK-004', 'BLOCK-005']);
assert.equal(existsSync(join(fixture, 'src/features/salutation.mjs')), true, 'B: rename succeeded');
assert.equal(existsSync(join(fixture, 'src/legacy/greeting.mjs')), false, 'B: old path removed');
assert.equal(existsSync(join(fixture, 'src/features/format-total.mjs')), true, 'E: extract succeeded');
assert.match(readFileSync(join(fixture, 'src/legacy/helper.mjs'), 'utf8'), /from '\.\.\/features\/format-total\.mjs'/, 'E: re-export points at the extracted module');
assert.equal(existsSync(join(fixture, 'src/duplicate-b.mjs')), false, 'F: duplicate consolidated');
assert.ok(result.before.architecture && result.after.architecture, 'L: architecture captured before and after');
```

- [ ] **Step 4: Add architecture summary to the generated Markdown report**

In the `report` array construction near the end of the file, add after the `'## After diff'` block:

```javascript
'## Architecture', '', `- Modules before: ${result.before.architecture?.nodes.length ?? 'n/a'}`, `- Modules after: ${result.after.architecture?.nodes.length ?? 'n/a'}`, '',
```

- [ ] **Step 5: Run the demo end-to-end**

Run: `corepack pnpm build && node scripts/acceptance-demo.mjs`
Expected: exits 0. BLOCK-001, BLOCK-003, BLOCK-004, BLOCK-005 are `VERIFIED`; BLOCK-002 is `ROLLED_BACK`. If any assertion throws, fix the fixture/block definitions (not the assertions) until it is genuinely true.

- [ ] **Step 6: Update the documentation**

Read `docs/ACCEPTANCE-DEMO.md` first to see its current scenario list, then update it to explicitly enumerate all 12 letters (A-L) and mark each as covered.

- [ ] **Step 7: Commit**

```bash
git add scripts/acceptance-demo.mjs docs/ACCEPTANCE-DEMO.md
git commit -m "test: extend the acceptance demo to cover rename, extract, consolidate, and architecture diff"
```

---

## Task 8: GitHub Release housekeeping

**Files:** none (operational, no code).

- [ ] **Step 1: Confirm the working tree is clean and CI is green on `main`**

Run: `cd "C:\Users\Jota\Documents\Codex\2026-08-14\va\work\ycf" && git status --short && gh run list -R JotaEse68/YourCodeIsFucked --limit 1`
Expected: clean tree, latest run `success`.

- [ ] **Step 2: Create the missing release**

Run: `gh release create v0.1.15 -R JotaEse68/YourCodeIsFucked --title "YCF 0.1.15" --notes "Windows browser launch fix, honest Cockpit, single self-contained npm package."`
Expected: release created.

- [ ] **Step 3: Confirm**

Run: `gh release list -R JotaEse68/YourCodeIsFucked --limit 3`
Expected: `v0.1.15` listed as latest. If the version has moved on further by the time this task runs (later tasks in this plan bump the version again), release the version that is actually live on npm at that point instead of hardcoding `v0.1.15`.

---

## Task 9: Deprecate the orphaned `@jotaese68/ycf-cli` npm package

**Files:** none (operational, no code).

- [ ] **Step 1: Deprecate**

Run: `npm deprecate @jotaese68/ycf-cli "Renamed to @jotaese68/ycf -- install that instead: npm install -g @jotaese68/ycf"`
Expected: exits 0.

- [ ] **Step 2: Confirm**

Run: `npm view @jotaese68/ycf-cli deprecated`
Expected: prints the deprecation message just set.

---

## Task 10: README demo section refresh

**Context:** Uses `examples/bad-vibe` (now covering all 12 acceptance scenarios after Task 7) rather than a real external project -- Jota's own real-project acceptance test is the next phase after this plan, by his own earlier direction.

**Files:**
- Modify: `README.md` and any other language README that references the same demo section (check `README.es.md` and the others for the same paragraph before editing just one).

- [ ] **Step 1: Regenerate the demo artifact**

Run: `node scripts/acceptance-demo.mjs` (from Task 7, now covering all 12 scenarios) and open `artifacts/acceptance-demo.md` for accurate, current numbers.

- [ ] **Step 2: Update the demo section**

Find the current demo section in `README.md` (search for the existing `assets/ycf-demo.gif` reference or the word "demo"). Do not claim anything the demo doesn't actually prove. Add one sentence noting the demo fixture is synthetic and that real-project validation is the next step -- do not claim it has been run on a real project, since it has not yet.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): refresh the demo section against the completed acceptance demo"
```

(If other language READMEs needed the same edit per Step 1's check, stage and include them in this same commit.)

---

## Task 11: Cockpit -- live read-only re-checks via a local, token-gated server

**Context:** Today's Cockpit (fixed earlier on 2026-08-17) is honest but copy-paste only. This task adds a local HTTP server bound to `127.0.0.1` only, serving live read-only plan data behind a per-session random token. Nothing destructive executes from the browser in this version -- the server only ever returns read-only plan JSON (`audit`, `refactorPlan`, `buildArchitecturalRefactorPlan`); a real `--yes` execution still requires the terminal. This keeps the security surface minimal while still delivering a real "click and see what YCF found right now" experience instead of only a static snapshot.

**Files:**
- Modify: `packages/cli/src/index.ts` (the `cockpit` command and `cockpitActionsHtml`)

**Interfaces:**
- Consumes: `understand`, `audit`, `verificationPlan`, `refactorPlan`, `buildArchitecturalRefactorPlan` (check the CLI's existing top-of-file import line from `@jotaese68/core` for the exact imported names already in scope before adding new ones).

- [ ] **Step 1: Add the server function**

In `packages/cli/src/index.ts`, add near `openBrowser`:

```typescript
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

function startCockpitServer(target: string, port: number): { url: string; token: string; close: () => void } {
  const token = randomBytes(16).toString('hex');
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.headers['x-ycf-token'] !== token) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid token' })); return; }
    if (url.pathname === '/plan/audit') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(audit(target))); return; }
    if (url.pathname === '/plan/refactor') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(refactorPlan(audit(target), understand(target)))); return; }
    if (url.pathname === '/plan/architectural') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(buildArchitecturalRefactorPlan(target))); return; }
    res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'not found' }));
  });
  server.listen(port, '127.0.0.1');
  return { url: `http://127.0.0.1:${port}`, token, close: () => server.close() };
}
```

Check the CLI's existing import line from `'@jotaese68/core'` -- `refactorPlan` and `buildArchitecturalRefactorPlan` must both be in it (add whichever is missing).

- [ ] **Step 2: Wire it into the `cockpit` command**

Find `program.command('cockpit [target]')...` and change its `.action(...)` body:

```typescript
program.command('cockpit [target]').description('Write and open a self-contained visual audit and impact cockpit with live, read-only re-checks.').option('--no-open', 'Write the cockpit without opening a browser.').option('--no-server', 'Write a fully static cockpit with no local server (copy-command only).').action((target = '.', options) => {
  const resolvedTarget = resolve(target);
  const report = understand(resolvedTarget);
  const auditReport = audit(resolvedTarget);
  const cockpitPath = join(report.target, '.ycf', 'cockpit.html');
  let bootstrap = '';
  if (options.server !== false) {
    const server = startCockpitServer(resolvedTarget, 4287);
    bootstrap = `<script>window.__YCF_COCKPIT__=${JSON.stringify({ token: server.token, base: server.url })};</script>`;
    process.on('SIGINT', () => { server.close(); process.exit(0); });
    console.log(`YCF — local read-only server running at ${server.url} (Ctrl+C to stop).`);
  }
  const cockpit = cockpitHtml(report, auditReport, verificationPlan(resolvedTarget)).replace('</body>', `${bootstrap}${cockpitActionsHtml()}</body>`);
  writeFileSync(cockpitPath, cockpit, 'utf8');
  console.log('YCF — cockpit ready.');
  if (options.open !== false && openBrowser(cockpitPath)) console.log(`Opened in your browser: ${cockpitPath}`);
  else console.log(`Open this file in your browser: ${cockpitPath}`);
  console.log('Read-only: it does not modify source files.');
});
```

This changes the command from exiting immediately to staying alive while `--server` is on, since `server.listen` keeps the Node process running -- that is intended, the browser needs the server available while the tab is open. The console output above already documents this to the user.

- [ ] **Step 3: Call the server from the Cockpit's action buttons**

In `cockpitActionsHtml()`'s `<script>` block (the `onclick` handler written earlier on 2026-08-17), replace the handler body with a version that tries the live server first and falls back to copy-only:

```typescript
document.querySelectorAll('[data-ycf-action]').forEach((button)=>button.onclick=async ()=>{
  const command=button.dataset.ycfCommand;
  const box=document.querySelector('#ycf-action-result');
  box.style.display='block';
  document.querySelector('#ycf-action-label').textContent=button.dataset.ycfAction+' — run this in your terminal, inside your project folder:';
  const commandEl=document.querySelector('#ycf-action-command');
  commandEl.textContent=command;
  const status=document.querySelector('#ycf-action-status');
  const cockpit=window.__YCF_COCKPIT__;
  if(cockpit && button.dataset.ycfPlan){
    try{
      const response=await fetch(cockpit.base+'/plan/'+button.dataset.ycfPlan,{headers:{'x-ycf-token':cockpit.token}});
      const plan=await response.json();
      status.textContent='Live read-only re-check ran — see the plan below. To apply anything, run the command above in your terminal (YCF never applies changes from this page).';
      const pre=document.createElement('pre'); pre.style.cssText='max-height:240px;overflow:auto;background:#0f172a;padding:10px;border-radius:8px;margin-top:8px'; pre.textContent=JSON.stringify(plan,null,2);
      box.appendChild(pre);
      return;
    }catch(error){ /* server not running (e.g. --no-server) — fall through to copy-only */ }
  }
  navigator.clipboard?.writeText(command).then(()=>{status.textContent='Copied to your clipboard — just paste it in your terminal.';}).catch(()=>{const range=document.createRange();range.selectNodeContents(commandEl);const selection=window.getSelection();if(selection){selection.removeAllRanges();selection.addRange(range);}status.textContent="Couldn't copy automatically — it's selected above, press Ctrl+C / Cmd+C.";});
});
```

Add `data-ycf-plan="audit"` to the "Analyze my project" button and `data-ycf-plan="refactor"` to the "Organize & refactor" button in the button markup (find them by their existing `data-ycf-action` attribute values). Leave "Understand my code", "Unfuck safe stuff", and "Is this ready to ship?" without a `data-ycf-plan` attribute -- they stay copy-only in this version.

- [ ] **Step 4: Manual smoke test**

Run: `corepack pnpm --filter @jotaese68/ycf build && node packages/cli/dist/index.js cockpit examples/bad-vibe`
Expected: console prints `YCF — local read-only server running at http://127.0.0.1:4287`; browser opens; clicking "Analyze my project" shows a live JSON plan appended below the command box instead of only a clipboard message. Press Ctrl+C in the terminal and confirm the server shuts down cleanly (`netstat -ano | grep 4287` shows nothing afterward -- the same check already used earlier today to confirm the preview server's cleanup).

- [ ] **Step 5: Typecheck and build**

Run: `corepack pnpm --filter @jotaese68/ycf typecheck && corepack pnpm --filter @jotaese68/ycf build`
Expected: 0 errors, bundle builds.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cockpit): serve live read-only re-checks from a local, token-gated server"
```

---

---

## Task 12: Teach the agent skill how to organize code professionally, per stack

**Context (priority note: execute this task FIRST, before Tasks 1-11 -- it is the highest-priority item, added after Jota clarified on 2026-08-17 that the actual goal is "a set of agents and skills that help improve applications and plugins built with AI" used from Claude Code / Codex, desktop or PowerShell. `skills/ycf-quality-gate/SKILL.md` and `skills/ycf-quality-gate/references/stack-profiles.md` today only cover safety review ("check this before changing it") -- they never tell the agent where anything should actually live to look logical, clear, and professional. Without that guidance every agent invents its own folder convention, inconsistently. This task adds real, stack-specific organization guidance, grounded in widely-recognized conventions (not invented by YCF), and wires it into the existing safety workflow instead of replacing it.**

**Files:**
- Modify: `skills/ycf-quality-gate/references/stack-profiles.md`
- Modify: `skills/ycf-quality-gate/SKILL.md`
- Modify: `integrations/claude-code/ycf-quality-gate.md`, `integrations/cursor/ycf-quality-gate.md`, `integrations/copilot/ycf-quality-gate.md` (check each for the same structural-work step before assuming all three need the identical edit -- they may already just point back at the skill file rather than duplicating its content)

**Interfaces:** none (documentation only, consumed by an LLM agent, not by YCF's own code).

- [ ] **Step 1: Add organization conventions to each stack profile**

In `skills/ycf-quality-gate/references/stack-profiles.md`, add a `### Organization conventions` subsection under each of the three existing headings.

Under `## TypeScript and JavaScript`, after the existing three bullets, add:

```markdown
### Organization conventions

Before proposing any move, run `ycf understand .` and check `.ycf/modules.json` for the folder structure that already exists. If a convention is already partially present (a `utils/`, `services/`, or `lib/` folder with some files in it), extend it -- do not invent a competing one. If no convention exists yet, use the smallest set of folders that separates responsibilities: `services/` or `api/` for external calls, `utils/` or `lib/` for pure helpers with no side effects, `types/` for shared type declarations not colocated with their module. Keep test files wherever the project already keeps them (colocated `*.test.ts` next to source, or a separate `__tests__/` tree) -- match the existing pattern, do not switch it.
```

Under `## React`, after the existing three bullets, add:

```markdown
### Organization conventions

Follow the widely-recognized React split when introducing structure: `components/` for presentational UI (one file per component, named to match the exported component), `hooks/` for custom hooks (`useXxx.ts`), `contexts/` or `store/` for shared state, `pages/` or `routes/` for route-level components if the project uses file-based or declarative routing. Move one component at a time with `ycf move`, verify after each move, and never regroup a component that is a route entry point or a dynamic `import()` target without confirming its usage first -- dynamic import targets are invisible to static analysis.
```

Under `## PHP and WordPress`, after the existing three bullets, add:

```markdown
### Organization conventions

For a WordPress plugin, follow the widely-used WordPress Plugin Boilerplate layout when reorganizing: `includes/` for core classes and shared logic, `admin/` for admin-only screens and hooks, `public/` for front-end-facing code, `languages/` for translations. Never move a file registered as a REST route, AJAX handler, cron callback, or activation/deactivation hook without first tracing every `add_action`/`add_filter`/`register_rest_route` call that references it by path or class name -- WordPress resolves many of these dynamically, so a move that "looks safe" from imports alone can silently break a hook.
```

- [ ] **Step 2: Wire it into the main skill workflow**

In `skills/ycf-quality-gate/SKILL.md`, change step 5 (currently reads "For structural work, generate a plan without editing... Never silently apply architectural refactors. Ask the user to approve a specific recommendation and define the verification checks before editing.") to insert a new sentence right before the existing "Never silently apply" sentence:

```markdown
5. For structural work, generate a plan without editing:

   ```bash
   ycf refactor . --dry-run
   ycf verify .
   ```

   Before proposing where anything should move, load the organization conventions in [references/stack-profiles.md](references/stack-profiles.md) for the detected stack and check what structure the repository already partially follows via `ycf understand .` -- extend an existing convention before inventing a new one. Present the exact old-path -> new-path mapping and the reason for each move, one block at a time. Never silently apply architectural refactors. Ask the user to approve a specific recommendation and define the verification checks before editing.
```

- [ ] **Step 3: Check the per-agent integration docs**

Read `integrations/claude-code/ycf-quality-gate.md`, `integrations/cursor/ycf-quality-gate.md`, and `integrations/copilot/ycf-quality-gate.md`. If any of them restates the structural-work step instead of just referencing `skills/ycf-quality-gate/SKILL.md`, apply the same Step 2 edit there too, in the same commit.

- [ ] **Step 4: Manual review**

Read all edited files back top to bottom and confirm: the new guidance never contradicts the existing "never silently apply" / "ask before editing" safety rules, it only adds *where things should go once approved*, and it never claims YCF's core engine picks the destination automatically (it doesn't, and per spec section 28 it deliberately shouldn't -- this is the agent's judgment call, informed by this guidance).

- [ ] **Step 5: Commit**

```bash
git add skills/ycf-quality-gate/references/stack-profiles.md skills/ycf-quality-gate/SKILL.md
git commit -m "docs(skills): teach the quality-gate skill per-stack organization conventions"
```

(Add the three `integrations/*/ycf-quality-gate.md` files to this same commit if Step 3 found edits needed in them.)

---

## Final Validation (after all 12 tasks)

- [ ] Run `corepack pnpm --filter @jotaese68/core typecheck && corepack pnpm --filter @jotaese68/core test && corepack pnpm --filter @jotaese68/ycf typecheck && corepack pnpm --filter @jotaese68/ycf build` -- all green.
- [ ] Run `node scripts/acceptance-demo.mjs` -- all 12 scenarios pass.
- [ ] Push to `main`, confirm the `Validate YCF` workflow is green on GitHub.
- [ ] Bump `packages/cli/package.json` version (0.1.15 -> 0.1.16), rebuild, `npm publish --access public` -- same flow already proven working today.
- [ ] Update `YCF-Estado-desarrollo.md` and `YCF-Pendientes-y-Bloqueos.md` in the Desktop hub to reflect everything in this plan as done, moving Jota's real-project acceptance test to the top of "next".
