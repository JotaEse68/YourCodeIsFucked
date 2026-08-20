# P0b — AST-based reference rewriting, transactional MOVE/RENAME, and one unified refactor engine

**Date:** 2026-08-20
**Status:** approved in chat 2026-08-20

## Context

Third sub-project of the backlog decided after the gap-analysis of `YCF_FINAL_CORE_V2_CODEX.md`. P0a (real security check, public-contract protection, safety-engine coverage) and P1 (evidence, computed confidence, `ycf next`, `ycf recover`) are both shipped, merged, and published (`@jotaese68/ycf@0.1.16`).

P0b was originally scoped as three items: (4) transactional MOVE/RENAME, (5) AST-based reference rewriting instead of the current regex, (6) adversarial tests for both. During brainstorming, reading the real code surfaced a fact that widens the scope in a load-bearing way, confirmed and approved by the user: there are **two** separate regex-based reference rewriters today (`refactor-operations.ts`'s `rewriteReferences` and the CLI's own `rewriteImportsForMove`), and **three** independent callers with three different — and in one case, absent — safety postures:

- `ycf move` (CLI command): has its own Git checkpoint + rollback via `createCheckpoint`/`rollbackToCheckpoint`, but is regex-based and duplicates logic already in `refactor-operations.ts`.
- `executeRefactorPlan` (`unfuck --apply-plan`, `seniorize`): has a real per-block persistent Git checkpoint journal (`beginCheckpointJournal`/`updateBlockCheckpoint`, built in P1), calls the shared `applyRefactorOperation`, but that function's own `MOVE`/`RENAME` branch is not internally transactional — a failure between `rewriteReferences` completing and the final `renameSync` (or a failure partway through `rewriteReferences`'s own write loop) throws before `applyRefactorOperation` ever returns an `AppliedOperation`, so no `undo()` closure is ever produced for the caller to use.
- `reorganization.ts`'s `applyReorganizationMove` (the Cockpit's Reorganize tab): calls `applyRefactorOperation` directly with **no Git checkpoint at all** — its own doc comment explains this was deliberate, because it needs the `AppliedOperation.undo()` closures to survive *after* the function returns, for a later, separate "Undo" click, and `executeRefactorPlan` discards those closures once a block verifies. This is the least safe of the three paths and is exactly the "third insecure path" the user flagged.

The user's explicit, approved direction (verbatim intent, condensed): unify all three callers onto one execution engine (`executeRefactorPlan`, extended); build one `ReferenceRewriter` abstraction with a real TypeScript-AST implementation for JS/TS/JSX/TSX and explicit PHP gating (SUPERVISED/BLOCKED, never a silent regex fallback, with the interface left ready for a future `PhpReferenceRewriter`); make MOVE/RENAME/CONSOLIDATE genuinely transactional inside `applyRefactorOperation` itself; and — critically — **do not make in-memory `undo()` closures the contract for the Cockpit's "Undo" button**. Rollback must be two-tiered: immediate (in-process, closure-based, unchanged) and persistent (survives process restart, driven by `rollbackExecution(runId, blockId)` reading the same `.ycf/refactor-checkpoints` journal P1 already built and never wired into the Cockpit).

The user explicitly authorized proceeding through spec, plan, and full implementation without further architecture questions this phase, reserving only a stop for a genuine contradiction or real risk of code loss. No push/publish/release beyond the established standing pattern of this session (merge and push to `main` directly once the phase is verified green).

## Goal

One single write path for every refactor operation this tool performs — `ycf move`, the Cockpit's Reorganize tab, and `unfuck`/`seniorize` all construct an `ArchitecturalRefactorPlan` and call `executeRefactorPlan`. No other code path writes a refactored file to disk.

1. `ReferenceRewriter` interface with a real TypeScript-AST implementation, replacing both existing regexes.
2. PHP files are never silently reference-rewritten — a move touching PHP (as source or as a referencing file) classifies SUPERVISED or BLOCKED, with a clear reason. The interface is shaped so a future `PhpReferenceRewriter` can be added without touching the JS/TS implementation.
3. `applyRefactorOperation`'s MOVE/RENAME/CONSOLIDATE branches become internally transactional: every rewrite is computed in memory first; disk is touched only after every rewrite is known to be resolvable; a failure during the write phase restores every already-written file before the error propagates.
4. `ycf move` (CLI) is rewritten to build a one-block plan and call `executeRefactorPlan` — its own `rewriteImportsForMove`/`relativeImport`/checkpoint/verify/rollback wiring is deleted, not kept as a second path.
5. The Cockpit's Reorganize tab (`cockpit.ts`'s `/apply/move` etc., `reorganization.ts`) is rewritten the same way — `applyReorganizationMove` is deleted, replaced by one-block `executeRefactorPlan` calls.
6. `RefactorExecutionReport` exposes `runId` (the checkpoint journal's run id, already computed internally, currently discarded).
7. A new `rollbackExecution(target, runId, blockId)` (or equivalently extended `restoreBlock`) can restore a block from the *current* journal or, if not found there, from an archived run under `.ycf/refactor-checkpoints/<runId>.json` (already written by `beginCheckpointJournal`, never read back today) — matched unambiguously by `runId` + `blockId` when both are known (the Cockpit always has both), or by `blockId` alone only when exactly one archived run contains it (never guessing across an ambiguous match).
8. Regression/adversarial tests proving: AST false-positive avoidance, transactional atomicity under a simulated partial-write failure, PHP gating, that all three callers produce identical results through the same engine, immediate rollback (already covered, kept), and persistent rollback that works from a **fresh function call with no shared in-memory state** (simulating a process restart).

## Non-goals (explicitly out of scope for this spec)

- A working `PhpReferenceRewriter` implementation. Only the interface/adapter point is built now; PHP moves stay SUPERVISED/BLOCKED.
- Any change to the agent-interface work (`ycf plan-context`, schema validation, the SAFE/SUPERVISED/BLOCKED demo) — untouched, unapproved, not started.
- `ycf recover`'s default read-only listing (`ycf recover .` with no flags) gaining visibility into archived runs. It keeps showing only the *current* journal, exactly as P1 shipped it. Only the *restore* action (`restoreBlock`/`rollbackExecution`, given explicit ids) gains the ability to reach into an archived run — the Cockpit is the only caller that needs this today, and it always has both `runId` and `blockId` on hand.
- Any change to `packages/core/src/release.ts`'s own dependency-severity policy (same standing exclusion as P0a/P1).
- Publishing to npm or re-packaging the Windows `.exe`. This phase ends at a green, merged, pushed `main` — publishing is a separate, later decision.

## Part A — `ReferenceRewriter`: one real AST-based rewriter, two regexes deleted

### New file: `packages/core/src/reference-rewriter.ts`

```ts
export interface SpecifierMatch { start: number; end: number; specifier: string; }
export interface ReferenceRewriter {
  canHandle(file: string): boolean;
  findReferences(sourceFile: string, content: string): SpecifierMatch[];
  rewrite(content: string, matches: SpecifierMatch[], newSpecifierFor: (match: SpecifierMatch) => string | undefined): string;
}
```

- `findReferences` is read-only: it parses `content` with `ts.createSourceFile` (already a dependency, already used elsewhere in `refactor-operations.ts` for `EXTRACT`) and walks the AST for exactly three node shapes: `ImportDeclaration`/`ExportDeclaration` nodes with a string-literal `moduleSpecifier`, and `CallExpression` nodes whose callee is the identifier `require` or the `import` keyword, with exactly one string-literal argument. Each match records the literal's exact source position (`start`/`end`, excluding the quote characters) and its text. No other node kind is ever touched — a comment, an unrelated string variable, or a string that merely *looks like* a specifier is structurally invisible to this walk, unlike the old regex.
- `rewrite` is a pure function: given the matches already found and a callback that decides the replacement text per match (or `undefined` to leave a match untouched), it returns the rewritten string by splicing at the recorded positions — no file I/O, no resolution logic. This keeps "find" and "resolve-and-rewrite" cleanly separated, and makes `rewrite` trivially unit-testable without a filesystem.
- `jsTsReferenceRewriter: ReferenceRewriter` — the only implementation shipped. `canHandle(file)` returns true for `.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs`.
- No `phpReferenceRewriter` is written. A file failing every registered rewriter's `canHandle` is exactly the signal `applyRefactorOperation` uses to classify SUPERVISED/BLOCKED (Part B).

### Deleted

- `importSpecifierPattern` and the regex-based body of `rewriteReferences` in `packages/core/src/refactor-operations.ts` — replaced by calls into `jsTsReferenceRewriter` plus the existing `resolveImport`/`relativeSpecifier`/`aliases` resolution logic (which stays; it has nothing to do with the text-matching problem this part fixes — it already operates on a specifier string, not on raw file text).
- `rewriteImportsForMove` and `relativeImport` in `packages/cli/src/index.ts` — deleted outright, not kept as a second implementation (Part D removes their only caller).

### Testing (Part A)

- New `reference-rewriter.test.ts`: `findReferences` on a fixture containing a real `import ... from './x'`, a real `export * from './x'`, a real `require('./x')`, a real `import('./x')`, **and** a comment containing the literal text `from './x'`, **and** an unrelated string variable `const note = "see also from './x'"` — asserts exactly the 4 real occurrences are found, the comment and the string variable are not. `rewrite` on a small fixture with known matches asserts the exact spliced output, including a case where `newSpecifierFor` returns `undefined` for one match (left untouched) among several that do get replaced.

## Part B — PHP gating: SUPERVISED/BLOCKED, never a silent fallback

`applyRefactorOperation`'s MOVE/RENAME branch (and CONSOLIDATE's `rewriteReferences` call) walks every file real `walk(root)` returns — which today includes `.php`. The new rule, checked before any rewrite is attempted:

- If the file being moved/renamed **is itself PHP** (`extname(source) === '.php'`): the operation is **BLOCKED** — `applyRefactorOperation` throws `BLOCK: PHP files cannot be moved automatically; no verifiable reference rewriter exists for PHP includes/requires yet. Move it manually and update references by hand.` No rewrite of any kind is attempted, matching this codebase's existing convention that BLOCKED always throws regardless of `allowSupervised`.
- If any **other** file that references the moved module is PHP (i.e., `jsTsReferenceRewriter.canHandle(file)` is false for a file that plain-text still contains the moved module's basename or resolved specifier as a substring — a deliberately *cheap, conservative, over-inclusive* pre-check, not a rewrite attempt): the operation is **SUPERVISED** — `applyRefactorOperation` throws `SUPERVISED: <n> PHP file(s) may reference this module and cannot be automatically verified: <list>. Review and update them manually, then re-run with the appropriate approval.`, respecting `options.allowSupervised` the same way every other SUPERVISED throw in this function already does.
- JS/TS files that reference the moved module continue to be rewritten automatically via `jsTsReferenceRewriter`, exactly as today, just via the AST path instead of the regex.

This conservative PHP pre-check (a substring scan, not a real PHP parse) is allowed to have false positives (flagging a PHP file that merely happens to contain the basename as a coincidental string) — false positives here degrade to a SUPERVISED review, which is safe. It must never have false negatives (missing a PHP file that genuinely references the module and letting it go unreviewed) — the check is intentionally the *widest reasonable net* (moved-module basename, with and without extension, as a plain substring of the PHP file's raw text), not a precise one.

### Testing (Part B)

- Moving a `.php` file → BLOCKED, verified error message, verified zero disk writes occurred (before/after file listing identical).
- Moving a `.ts` file that a fixture `.php` file's text references by basename → SUPERVISED without `allowSupervised`, verified the PHP file's content is byte-identical after the throw (never touched); succeeds (JS/TS files rewritten, PHP file still untouched — PHP was never rewritten, only gated) with `allowSupervised: true`.
- Moving a `.ts` file with no PHP involvement at all → unaffected by this part, existing behavior.

## Part C — Transactional MOVE/RENAME/CONSOLIDATE

Restructure `rewriteReferences` (and its two callers in `applyRefactorOperation`, MOVE/RENAME and CONSOLIDATE) into three phases, replacing today's single write-as-you-go loop:

1. **Compute** — for every candidate file (`walk(root)`), read its content (read-only), run `jsTsReferenceRewriter.findReferences`, resolve each match via the existing `resolveImport`, and — for every match that resolves to the moved module — compute its replacement text via `relativeSpecifier`. Collect `{ file, content, matches, replacements }` for every file that has at least one real replacement. Nothing is written to disk in this phase. The PHP gating check from Part B happens here too, before any write — if it trips, the function throws now, with the filesystem completely untouched (stronger than today, where PHP files were never actually understood at all, just silently skipped by the regex's lack of match).
2. **Write** — for every collected file, call `rewrite()` (pure) to get the new content, then `atomicWrite` it, appending to a running `writtenSoFar: Map<string, string>` (the original content, for rollback) as each write succeeds. If any single `atomicWrite` throws, immediately restore every file already in `writtenSoFar` from its recorded original content, then re-throw the original error. This guarantees: either every file in the compute phase's list is written, or none of them remain changed.
3. **Rename** — only after phase 2 fully succeeds, `mkdirSync` + `renameSync` the moved file itself. If this throws, phase 2's writes are rolled back the same way (same `writtenSoFar` map) before re-throwing — so a rename failure after successful reference rewriting never leaves importers pointing at a destination that was never created.

The function's return shape is unchanged (`{ changed: string[]; before: Map<string, string> }`) — `before` is exactly `writtenSoFar` from phase 2, so the existing `AppliedOperation.undo()` closure built from it in `applyRefactorOperation` (which additionally reverses the rename) continues to work exactly as today for the *successful, fully-returned* case. What changes is that a **thrown** failure at any phase now guarantees zero net disk change, instead of leaving whatever phase 1's regex loop had already written.

### Testing (Part C)

- Simulate `atomicWrite` throwing on, e.g., the 2nd of 3 files that need rewriting (a fixture where 3 files import the moved module, with a way to force the 2nd write to fail — a mock/spy is appropriate here specifically because the point under test is failure-path plumbing, not real filesystem behavior — this is the one place in this phase's tests where a spy is the right tool, unlike the rest of this codebase's real-I/O convention, because there is no way to *organically* force a real disk write to fail on a specific file without OS-specific permission tricks that would be flaky across platforms). Assert: the 1st file's content is back to its original, the 3rd file was never written, the function throws, and the caller (`applyRefactorOperation`) never returns an `AppliedOperation` for this call.
- Simulate a rename failure after successful rewriting (e.g., destination's parent directory creation blocked by an existing file at that path with the wrong type) — assert all rewritten importer files are back to original content.
- Existing positive-path tests (aliases, require, dynamic import, .js→.ts resolution, barrel re-export blocking) continue to pass unmodified — this part changes *how* writes happen, not *what* gets resolved.

## Part D — `ycf move` becomes a one-block-plan wrapper

`packages/cli/src/index.ts`'s `move` command is rewritten:

- Delete `rewriteImportsForMove`, `relativeImport`, and the command's own `createCheckpoint`/`rollbackToCheckpoint`/`verify` calls.
- On `--yes`: build `const plan: ArchitecturalRefactorPlan = { version: 2, target, generatedAt: new Date().toISOString(), blocks: [{ id: 'CLI-MOVE', ..., operations: [{ kind: 'MOVE', source, destination, updateImports: true, ... }], validation: [], rollback: [], status: 'PLANNED', evidence: [], confidenceTier: 'CONFIRMED', mode: 'SAFE' }], summary: {...}, sourceFindings: [] }` and call `executeRefactorPlan(target, plan, { fullVerify: true })` (matches today's `move` command's behavior of running full `verify()`, not `verifyFast`).
- Report based on the returned `RefactorExecutionReport`: `keptBlocks.length === 1` → success (print the block's `changedFiles`, same shape as today's "Updated imports in N file(s)" message); `rolledBackBlocks.length === 1` → the existing `printFailedChecks`-style failure reporting, reusing `block.result.error`; `blockedBlocks.length === 1` → the block's `mode`/`result.error` names the reason (BLOCKED or SUPERVISED, per Part B) — this is new, honest information `ycf move` never surfaced before (today a BLOCKED/SUPERVISED classification wasn't possible for a PHP-touching move at all, since the CLI's own rewriter had no concept of it).
- `--dry-run` keeps printing the plan preview it already does (unaffected — it never touches disk today either way).

### Testing (Part D)

- `ycf move` on a real fixture (two files, a real import between them) via the built CLI, asserting the import is genuinely rewritten and the file moved — same shape as the existing manual-smoke-test convention this repo already uses for CLI commands.
- `ycf move` on a fixture that trips PHP gating — asserts the CLI prints the SUPERVISED/BLOCKED reason and makes no filesystem change.
- A unit-level test asserting `packages/cli/src/index.ts` no longer contains `rewriteImportsForMove` or `relativeImport` as identifiers (a simple `grep`-equivalent check in the test, not a structural AST assertion — proportionate to what's being proven: the old path is gone, not merely unused).

## Part E — Cockpit Reorganize joins the same engine

`packages/core/src/reorganization.ts`'s `applyReorganizationMove` is deleted. `packages/core/src/cockpit.ts`'s write handlers change:

- `/apply/move`: instead of `applyReorganizationMove(target, block)`, build a one-block plan (same shape as Part D's, `updateImports: true`, `validation: []` so `executeRefactorPlan`'s `runVerification` takes its FAST-only branch — preserving today's `verifyFast` behavior exactly) and call `executeRefactorPlan(target, plan, { fullVerify: false })`. On a rolled-back block: respond `{ status: 'rolled_back', error }` exactly as today. On a kept (verified) block: store `{ runId: report.runId, changedFiles: block's changedFiles }` in `appliedMoves` (replacing the current `AppliedOperation[]`-holding map — no closures stored anymore) and respond `{ status: 'applied', changedFiles }` exactly as today.
- `/undo/move`: instead of calling `.undo()` on stored closures, call the new `rollbackExecution(target, applied.runId, blockId)` (Part F). On success, remove the entry from `appliedMoves` and respond `{ status: 'pending' }` exactly as today. On failure, respond 500 with the error exactly as today.
- `/keep/move`, `/finalize`, `/finalize/publish`: unchanged in behavior — they only ever read `appliedMoves`' keys/`changedFiles`, both of which the new shape still provides.
- The doc comment on `appliedMoves` (currently: "Undo/Keep only work while this exact process is still running") is corrected to describe the new, actually-persistent behavior.

Each `/apply/move` call creates its own `executeRefactorPlan` run (its own `runId`) — a Cockpit session that applies several moves in sequence produces several archived runs, with only the most recent as "current". This is precisely why Part F's `rollbackExecution` must be able to reach an older, archived run: `/undo/move` for an earlier-applied block, called after a *later* block's own apply has already made that later run "current", is the exact scenario this phase exists to make reliable.

### Testing (Part E)

- Rewritten version of the existing Cockpit reorganization test suite (`cockpit.test.ts`), covering the same scenarios it already covers (apply, undo, keep, finalize, finalize/publish, malformed body survives, undo-throws survives) but against the new `executeRefactorPlan`-backed implementation — most of these tests assert on the same HTTP response shapes and should need only their setup fixtures adjusted (writing a real `ArchitecturalRefactorPlan`-shaped `.ycf/reorganization-plan.json`, which they already do).
- **New**: apply two moves in the same Cockpit session (two separate `/apply/move` calls, two separate runs), then `/undo/move` the **first** one (now archived, not current) — asserts it succeeds and genuinely reverts that file, proving the archived-run lookup works for the Cockpit's real usage pattern, not just in the abstract.

## Part F — `rollbackExecution`: current-journal-first, archived-run fallback

`packages/core/src/refactor-checkpoints.ts` gains:

```ts
export function findArchivedBlock(target: string, runId: string, blockId: string): PersistentBlockCheckpoint | undefined;
export function findBlockByIdAcrossRuns(target: string, blockId: string): { runId: string; block: PersistentBlockCheckpoint } | undefined; // undefined if zero or more-than-one archived run contains this blockId
```

`packages/core/src/recover.ts`'s `restoreBlock` becomes `rollbackExecution(target: string, runId: string | undefined, blockId: string): RestoreResult`:

- If `runId` is given: look in the *current* journal first (unchanged fast path); if not found there, look in the archived run named by that exact `runId` (`findArchivedBlock`). This is the path the Cockpit always uses — it always has both ids from the `executeRefactorPlan` report it stored.
- If `runId` is omitted (the CLI's `ycf recover --restore <blockId> --yes`, which only ever knows a blockId — unchanged public CLI surface): look in the current journal first (unchanged); if not found, use `findBlockByIdAcrossRuns` — restores it if and only if exactly one archived run contains that blockId; if more than one archived run contains a block with that id, refuses with a clear `{ restored: false, reason: 'Ambiguous: <blockId> exists in N archived runs (<runIds>). Use the Cockpit's own runId-qualified restore, or inspect .ycf/refactor-checkpoints/ directly.' }` — never guesses.
- Once the target block (wherever found) is located, the rest of the function is unchanged from P1: refuse if no `ref`/`commit`, `rollbackToCheckpoint`, catch its exceptions into `{ restored: false, reason }`, then mark the block `ROLLED_BACK` — `markBlockRolledBack` (already built in P1's final fix wave) is extended to accept an optional `runId` so it writes back to the *correct* journal file (current vs. the specific archived one) rather than assuming current.
- `packages/cli/src/index.ts`'s `recover` command's `--restore` option is unchanged in its public surface (still just `--restore <blockId>`) — internally it now calls `rollbackExecution(target, undefined, blockId)`.

### Testing (Part F)

- `findBlockByIdAcrossRuns`: zero archived runs contain the id → `undefined`. Exactly one does → returns it. Two different archived runs both happen to contain a block with the same id (construct this directly via two separate `beginCheckpointJournal` calls using the same blockId string) → `undefined` (ambiguous), and `rollbackExecution` with no `runId` in this exact situation returns the ambiguity-refusal message, not a guess.
- **Restart simulation**: call `beginCheckpointJournal` + `updateBlockCheckpoint(..., 'RUNNING')` + a second `beginCheckpointJournal` for a different block (archiving the first), all in one test — then, in a **separate, later call** to `rollbackExecution` with no shared variables from the setup beyond `target`/`runId`/`blockId` (the existing `recover.test.ts` pattern from P1 already does exactly this shape; extend it, don't reinvent it), restore the *first* (now-archived) block by its `runId`+`blockId` and assert the Git reset genuinely happened.

## Global constraints (carried into the plan)

- No feature flags; pre-1.0, delete the old regexes and the old Cockpit/CLI write paths outright — do not keep them side-by-side with the new engine "just in case."
- `Finding`/`RefactorBlock`/existing P0a/P1 types are not touched by this phase except `RefactorExecutionReport` gaining `runId` and `RestoreResult`/`restoreBlock` being renamed/extended per Part F.
- Do not touch `packages/core/src/release.ts`.
- Do not start any part of the agent-interface work.
- Every task ends with `corepack pnpm --filter @jotaese68/core typecheck`/`test` (and `@jotaese68/ycf typecheck` for CLI-touching tasks) green before commit, matching every prior plan in this repo.
- Manual verification before this phase is considered done: run `ycf move` and exercise the Cockpit's Reorganize apply/undo flow for real against this repo (or a disposable fixture), not just green unit tests — the same "prove it with a real run" standard P0a/P1 both followed.
- At the end of this phase there must be exactly one code path that writes a refactored file to disk: `applyRefactorOperation` (called only from `executeRefactorPlan`, called only from `ycf move`, the Cockpit's `/apply/move`, and `unfuck --apply-plan`/`seniorize`). No file in this repo should call `atomicWrite`/`writeFileSync`/`renameSync` for a *reference-rewrite-carrying* operation outside that chain — `CREATE`/`DELETE`/`EDIT_IMPORT`/`EDIT_EXPORT`/`EXTRACT`'s own direct writes inside `applyRefactorOperation` are unaffected and out of scope (they don't rewrite *references*, this phase is specifically about the reference-rewriting write path).

## Task ordering (for the plan)

1. Part A: `reference-rewriter.ts` + tests (no dependents yet, pure functions, TDD-friendly first task — same rationale P0a/P1 both used).
2. Part C: transactional compute/write/rename restructuring of `rewriteReferences`, using Part A's rewriter (folds in Part B's PHP gating, since the gating check is a natural part of the same "compute" phase — these two are small enough and tightly enough coupled to combine into one task, but keep as two tasks if the implementer/reviewer finds combining them makes the diff too large to review well; the plan decides the exact split).
3. Part D: `ycf move` rewritten as a one-block-plan wrapper; old CLI regex deleted.
4. `RefactorExecutionReport` gains `runId` (small, standalone — needed by both Part E and Part F, do before either).
5. Part F: `rollbackExecution`/archived-run lookup in `refactor-checkpoints.ts` + `recover.ts`.
6. Part E: Cockpit Reorganize rewritten onto `executeRefactorPlan` + the new `rollbackExecution` (depends on 4 and 5 both being done).
7. Final task: full typecheck/test/build across all packages, a real manual run of `ycf move` and the Cockpit's apply/undo flow, a repo-wide check confirming the two deleted regexes and the two deleted functions (`applyReorganizationMove`, `rewriteImportsForMove`) are genuinely gone, and confirming no parallel write path remains.
