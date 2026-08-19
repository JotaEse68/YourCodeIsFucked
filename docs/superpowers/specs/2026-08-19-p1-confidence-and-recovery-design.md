# P1 — real evidence, computed confidence, confidence tiers, uncertainty states, `ycf next`, `ycf recover`

**Date:** 2026-08-19
**Status:** approved in chat 2026-08-19, pending spec review

## Context

Second sub-project of the backlog decided after the gap-analysis of
`YCF_FINAL_CORE_V2_CODEX.md` (see `YCF-Pendientes-y-Bloqueos.md`). P0a (real security
check, full public-contract protection, full safety-engine coverage) shipped and merged
to `main` (`2f933a0`, plus the one-line `unfuck` rollback-message fix in `2100ba4`).

The user's explicit instruction for this round: do **not** start the
`ycf plan-context`/schema-validation/external-agent-interface work yet; keep
`packages/core/src/release.ts`'s own dependency-severity policy separate/untouched for
now; do not add functionality outside the 6 items below; once this is complete and
tested, stop and review with the user before starting the Codex/Claude integration work.

## Goal

Six items, grouped into three parts because they share one underlying problem: today
confidence is a hardcoded number sprinkled across producers, with nothing backing it and
no vocabulary for *why* something is uncertain.

- **Part A — data model.** (Items 7-10) A structured `EvidenceItem`, a `confidenceTier`
  derived from the numeric confidence, an explicit `uncertaintyState` for anything not
  `CONFIRMED`, and a shared `computeConfidence` function that every confidence-bearing
  producer switches to instead of a hardcoded constant.
- **Part B — `ycf recover`.** (Item 12) Surfaces the persistent per-block checkpoint
  journal (`readCheckpointJournal` in `refactor-checkpoints.ts`, implemented since an
  earlier session, never exposed by any CLI command) — read-only by default, with an
  explicit opt-in restore path.
- **Part C — `ycf next`.** (Item 11) A read-only "what should I do next" command, built
  on top of Part A's tiers and Part B's journal.

## Non-goals (explicitly out of scope for this spec)

- `ycf plan-context`, schema validation for externally-produced plans, or the
  SAFE/SUPERVISED/BLOCKED agent demo — a later sub-project.
- Touching or unifying `release.ts`'s own hardcoded dependency-severity policy with
  `security.dependency_fail_on` (P0a's config key) — left deliberately separate per the
  user's instruction, undecided whether they should ever be one threshold.
- Retrofitting every one of the ~53 existing `Finding` construction sites (`wordpress.ts`,
  `typescript.ts`, `index.ts`, `duplicates.ts`) to populate the new optional
  `evidenceItems`/`uncertaintyState` fields. Only producers that already compute a
  `confidence` today (`refactor-safety.ts`, `refactor-planner.ts`'s two block builders,
  `security.ts`'s 4 static detectors) are switched over. The other Finding producers keep
  `confidence`/`evidenceItems`/`uncertaintyState` as `undefined`, exactly as they leave
  `confidence` `undefined` today — no regression, no obligation to touch them.
- Changing `Finding.evidence`'s type (`string`). It has 53 construction sites; changing
  its shape is a large, unrelated mechanical migration this spec does not need. The new
  structured information lives in the new optional `evidenceItems` field instead.
- A generic "resume an interrupted run automatically" command. `ycf recover` reports and
  offers a manual, explicit, one-block-at-a-time restore — it does not re-drive
  `executeRefactorPlan`.

## Part A — evidence, computed confidence, confidence tiers, uncertainty states

### New file: `packages/core/src/confidence.ts`

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

`confidenceTier`'s thresholds are chosen so today's existing hardcoded numbers land
where their current `status` implies: `unsafe-eval`/`tls-verification-disabled` at 95 →
`CONFIRMED`; `hardcoded-secret`/`sql-injection-risk` at 70 → `DIRECTIONAL`;
`assessRefactorSafety`'s `BLOCKED` (98) → `CONFIRMED`, `SUPERVISED` (86) →
`HIGH_CONFIDENCE`, `SAFE` (96) → `CONFIRMED`. No behavior changes from this table alone;
it's read-only classification layered on top of the number.

`computeConfidence`'s bonus rewards two independent things: more occurrences of the same
evidence (`evidence.length`), and those occurrences spanning more distinct files
(`distinctFiles`) — a pattern matched three times in one file is weaker corroboration
than the same pattern matched in three different files. A single piece of evidence gets
no bonus (`base` unchanged), matching every producer's current single-signal baseline.

### `Finding` (`packages/core/src/types.ts`)

Two new optional fields, additive:

```ts
evidenceItems?: EvidenceItem[];
uncertaintyState?: UncertaintyState;
```

The existing `status?: 'confirmed' | 'needs_human' | 'needs_framework_context'` field
(added in P0a, set only in `security.ts`, never read anywhere else in `packages/core/src`
— confirmed by search) is removed and replaced by `uncertaintyState`. Mapping at the 4
call sites in `security.ts`:

- `status: 'confirmed'` (unsafe-eval, tls-verification-disabled) → drop `status`
  entirely; `uncertaintyState` stays `undefined` (a `CONFIRMED` tier finding has nothing
  left to resolve, so there is no uncertainty state to name).
- `status: 'needs_human'` (hardcoded-secret, sql-injection-risk) →
  `uncertaintyState: 'NEEDS_HUMAN'`.

`confidence` at these 4 sites switches from a literal number to
`computeConfidence(base, evidenceItems)`, where `base` is a new per-rule constant
(`hardcoded-secret` 55, `unsafe-eval` 85, `sql-injection-risk` 55,
`tls-verification-disabled` 85 — chosen so a single-occurrence finding still lands in the
same tier its current fixed number does: 55+0=55 is below the old 70, so a bump is needed
for the common single-occurrence case; recompute base per rule during implementation so
`computeConfidence(base, evidenceItems)` for a 1-item evidence array reproduces
(±5) today's fixed number, and let cases with 2+ occurrences score higher — this is a
plan-time detail, not a spec ambiguity, since the exact per-rule base only matters
relative to itself). `evidenceItems` is built from the same `lines: number[]` each
detector already computes: `lines.map((line) => ({ file: display, lines: [line], detail:
'<the existing evidence sentence>' }))`.

### `RefactorBlock` (`packages/core/src/refactor-types.ts`)

New **required** fields (small blast radius — 4 construction sites: `refactor-planner.ts`
and 3 test/fixture files):

```ts
evidence: EvidenceItem[];
confidenceTier: ConfidenceTier;
uncertaintyState?: UncertaintyState;
```

`confidenceTier` is stored (not just derived on read) because `RefactorBlock` is a
persisted artifact (`architectural-refactor-plan.json`) an external agent or the Cockpit
UI reads directly — it should not need to import `confidence.ts` to know a block's tier.
It's still always set via `confidenceTier(confidence)` at construction time, never by
hand, so it can't drift from the number.

Construction-site changes in `refactor-planner.ts`:

- `duplicateBlocks` (line 11-17): `evidence: group.occurrences.map((occurrence) => ({
  file: occurrence.file, lines: [occurrence.startLine, occurrence.endLine], detail:
  'duplicate occurrence' }))`; `confidence: computeConfidence(group.kind === 'exact' ? 90
  : 55, evidence)` (bases chosen so a 2-occurrence exact duplicate — the minimum a
  duplicate group can have — still lands `CONFIRMED`, matching today's fixed 94; a
  2-occurrence structural duplicate lands `DIRECTIONAL`, matching today's fixed 62);
  `confidenceTier: confidenceTier(confidence)`; no `uncertaintyState` (a duplicate that's
  been statically confirmed as identical/similar text doesn't need human/runtime/test
  context to know it exists — what's uncertain is only whether it's *safe to merge*,
  which is exactly what `mode: 'SUPERVISED'` already communicates).
- `reviewBlockFrom` (line 28-35): `evidence: [{ file: recommendation.file, lines:
  recommendation.lines, detail: recommendation.why }]`; `confidence:
  computeConfidence(55, evidence)` (single evidence item, so this reproduces today's
  fixed 70 only if base is picked accordingly — same plan-time calibration note as
  above); `confidenceTier: confidenceTier(confidence)`; `uncertaintyState:
  'NEEDS_HUMAN'` (`recommendation.requiresHumanReview` is already `true` for every
  recommendation reaching this function, per `buildRefactorPlan`'s existing filtering).

`assessRefactorSafety` (`packages/core/src/refactor-safety.ts`) keeps returning a bare
`confidence: number` in its own `SafetyAssessment` interface — it has no per-file
`EvidenceItem[]` today (it works over a `Map<string, string>` of file contents, not
discrete evidence occurrences), and none of P0a's call sites need a tier from it, only
the number. Converting it to emit `EvidenceItem[]` (one item per matched pattern label,
e.g. `{ file: <matched file>, detail: label }` for each entry in `supervised`/`blocked`)
is small and worth doing for consistency: `confidence: computeConfidence(base, evidence)`
where `base` is 90 (blocked), 78 (supervised), 92 (safe) — again picked so the common
single-signal case reproduces close to today's 98/86/96. `SafetyAssessment` gains
`evidence: EvidenceItem[]` alongside its existing fields; callers of
`assessRefactorSafety` (`refactor-operations.ts`) are unaffected since they only read
`.mode`/`.reason` today (confirmed by grep) — no follow-on changes required there.

### Testing (Part A)

- `confidence.test.ts` (new): `confidenceTier` boundary values (89/90, 74/75, 49/50);
  `computeConfidence` — 1 item no bonus, 2 items same file small bonus, 3 items 3
  distinct files larger bonus, bonus caps at 15 (never exceeds `base + 15`), result never
  exceeds 99 even with a high base.
- `security.test.ts` (existing, extend): each of the 4 static detectors — single
  occurrence still classifies into the same tier as before; a fixture with 2+ occurrences
  of the same rule produces a higher `confidence` than the single-occurrence fixture (the
  actual "computed from evidence, not constant" proof).
- `refactor-planner` tests (existing suite, wherever `buildArchitecturalRefactorPlan` is
  tested — extend, do not create a new file if one already covers it): an exact-duplicate
  group with 3 occurrences produces higher confidence than one with 2; every emitted
  block has non-empty `evidence` and a `confidenceTier` consistent with its `confidence`.
- `refactor-safety.test.ts` (existing, extend): `SafetyAssessment.evidence` is non-empty
  whenever `signals` is non-empty, and empty when `mode === 'SAFE'`.

## Part B — `ycf recover`

Surfaces `readCheckpointJournal(target)` (`packages/core/src/refactor-checkpoints.ts:42`,
already implemented, currently dead code from the CLI's perspective — confirmed by grep,
no call site outside its own test file and `refactor-executor.ts`'s writer side).

### `packages/core/src/recover.ts` (new)

```ts
import { readCheckpointJournal, type PersistentCheckpointJournal, type PersistentBlockCheckpoint } from './refactor-checkpoints.js';
import { rollbackToCheckpoint } from './git.js';

export interface RecoverReport { target: string; journal?: PersistentCheckpointJournal; }
export function recover(target: string): RecoverReport {
  return { target, journal: readCheckpointJournal(target) };
}

export interface RestoreResult { restored: true; blockId: string; commit: string; } | { restored: false; reason: string };
export function restoreBlock(target: string, blockId: string): RestoreResult {
  const journal = readCheckpointJournal(target);
  const block = journal?.blocks.find((entry) => entry.blockId === blockId);
  if (!block) return { restored: false, reason: `No block "${blockId}" in the checkpoint journal.` };
  if (!block.ref || !block.commit) return { restored: false, reason: `Block "${blockId}" has no recorded checkpoint ref to restore to.` };
  rollbackToCheckpoint(target, { ref: block.ref, commit: block.commit, createdAt: block.startedAt ?? block.updatedAt });
  return { restored: true, blockId, commit: block.commit };
}
```

`rollbackToCheckpoint(target, checkpoint: GitCheckpoint)` (`git.ts:40`) takes
`{ ref: string; commit: string; createdAt: string }` (`types.ts:61`).
`PersistentBlockCheckpoint` has no `createdAt`, only `startedAt?`/`updatedAt` — the shim
above synthesizes it from whichever is available. Confirmed `rollbackToCheckpoint`'s body
only uses `.ref`/`.commit` for the actual Git reset and never reads `.createdAt` itself
(it exists on the type for other callers' logging), so this synthesized value is inert,
not a behavior risk — the plan verifies this against the real function body regardless.

### CLI: `packages/cli/src/index.ts`

New command:

```
program.command('recover [target]')
  .description('Show or restore interrupted refactor blocks from the persistent checkpoint journal.')
  .option('--json', 'Emit the complete journal as JSON.')
  .option('--restore <blockId>', 'Restore one block to its pre-execution checkpoint.')
  .option('--yes', 'Confirm the restore (required with --restore).')
```

- No flags: read-only. No journal on disk → "No refactor run found for this target."
  Journal present → print each block's `blockId`, `status`, `commit` (if any),
  `changedFiles.length`, `error` (if any), grouped/highlighted so `PENDING`/`RUNNING`
  blocks (the ones that didn't reach a final state) stand out from `VERIFIED` ones.
- `--json`: the full `PersistentCheckpointJournal`, unmodified.
- `--restore <blockId>` without `--yes`: print what restoring would do (the block's
  target commit) and instruct the user to add `--yes` — same confirmation posture as
  `move`/`cleanup`. Never writes.
- `--restore <blockId> --yes`: calls `restoreBlock`. Unknown blockId or a block with no
  `ref` → clear error, `process.exitCode = 1`, nothing touched. Success → prints the
  restored commit.

### Testing (Part B)

- `recover.test.ts` (new, `packages/core/src`): no journal on disk → `journal` is
  `undefined`. A fixture journal with a mix of statuses → `recover()` returns it
  unmodified (read-only, confirmed by checking the working tree is unchanged after the
  call). `restoreBlock` with an unknown blockId → `{ restored: false, ... }`, no Git
  command executed. `restoreBlock` on a block with a real `ref` (set up via
  `beginCheckpointJournal`/`updateBlockCheckpoint` in the test, same as
  `refactor-executor.test.ts` already does) → working tree actually resets to that
  commit, verified by reading a file's content before/after.
- CLI-level test only if `packages/cli` already has a test harness pattern to extend
  (it currently has none — confirmed, `vitest run --passWithNoTests`); if none exists,
  Part B relies on `packages/core`'s `recover.ts` tests plus one manual smoke run
  recorded in the task report, matching how `unfuck`'s CLI layer is tested today.

## Part C — `ycf next`

### `packages/core/src/next.ts` (new)

```ts
import { audit } from './index.js';
import { readCheckpointJournal } from './refactor-checkpoints.js';
import { confidenceTier } from './confidence.js';
import type { Finding } from './types.js';

export interface NextReport {
  target: string;
  blocked: { reason: 'unfinished-run'; pendingBlockIds: string[] } | undefined;
  suggestions: Finding[];
}

export function next(target: string, limit = 5): NextReport {
  const journal = readCheckpointJournal(target);
  const pending = journal?.blocks.filter((block) => block.status === 'PENDING' || block.status === 'RUNNING') ?? [];
  if (pending.length) {
    return { target, blocked: { reason: 'unfinished-run', pendingBlockIds: pending.map((block) => block.blockId) }, suggestions: [] };
  }
  const findings = audit(target).findings;
  const tierRank: Record<string, number> = { CONFIRMED: 0, HIGH_CONFIDENCE: 1, DIRECTIONAL: 2, SPECULATIVE: 3 };
  const ranked = [...findings].sort((a, b) => {
    const tierA = tierRank[confidenceTier(a.confidence ?? 0)] ?? 4;
    const tierB = tierRank[confidenceTier(b.confidence ?? 0)] ?? 4;
    if (tierA !== tierB) return tierA - tierB;
    return b.scoreImpact - a.scoreImpact;
  });
  return { target, blocked: undefined, suggestions: ranked.slice(0, limit) };
}
```

A `Finding` with no `confidence` set (the ~49 producers Part A deliberately leaves alone)
sorts as `confidenceTier(0)` → `SPECULATIVE`, i.e. last — correct: a finding this system
has no real confidence signal for should not out-rank one it does, and it still appears
in the list (nothing is hidden), just lower.

### CLI: `packages/cli/src/index.ts`

```
program.command('next [target]')
  .description('Show the single most useful next action: resume an interrupted run, or the most confidently actionable finding.')
  .option('--json', 'Emit the complete result as JSON.')
  .option('--language <language>', 'Response language: en, es, pt, fr, de, it, ar, or zh.')
```

Read-only, same posture/flags as `audit`. `blocked` present → print "Unfinished refactor
run detected (block(s): <ids>). Run `ycf recover` first." and stop (this is the entire
output — Part C never reads findings while a run is unfinished, since acting on stale
findings while a block is mid-flight could be misleading). Otherwise print the top
`suggestions` in the same per-finding format `audit`'s text output already uses (reuse,
don't reinvent), prefixed by the finding's tier so the ranking is visible, not just
implied by order.

### Testing (Part C)

- `next.test.ts` (new): a fixture with a `PENDING` block in the journal → `blocked` is
  set, `suggestions` is empty, and — critically — `audit` is never invoked (verify via a
  spy/mock or by structuring the test so a target that would make `audit` throw still
  passes, proving the short-circuit is real, not just first-in-array luck). No journal →
  `blocked` is `undefined`, `suggestions` ranks a `CONFIRMED`-tier low-impact finding
  above a `SPECULATIVE`-tier high-impact one (proves tier beats score, not the reverse).
  Two same-tier findings → higher `scoreImpact` first.

## Global constraints (carried into the plan)

- TDD per task: failing test → implementation → passing test → commit, one commit per
  task, `type(scope): summary` messages, matching every prior plan in this repo.
- `corepack pnpm --filter @jotaese68/core typecheck` and `test` gate every core-package
  task; `corepack pnpm --filter @jotaese68/ycf typecheck` gates every CLI-package task.
  Root `corepack pnpm typecheck` (which builds core first) and `corepack pnpm -r test`
  gate the final task.
- No feature flags. Pre-1.0 — change `Finding`/`RefactorBlock`/`SafetyAssessment`
  directly; do not keep the old `status` field alongside the new `uncertaintyState`.
- Do not touch `packages/core/src/release.ts`.
- Do not add a `ycf plan-context` command, schema validation, or any agent-facing
  artifact beyond what already exists (`architectural-refactor-plan.json`'s shape simply
  gains the new required `RefactorBlock` fields — that file format changing is expected
  and is not "building the agent interface," it's this spec's own type change flowing
  through to the one place `RefactorBlock` is already persisted).
- Manual verification step before considering Part B/C done: run `ycf recover` and
  `ycf next` against this repo itself (`.`) and record real output in the task report,
  the same "prove it with a real run, not just green tests" standard every prior plan in
  this repo has followed.

## Task ordering (for the plan)

1. Part A's `confidence.ts` (new module, no dependents yet — pure functions, TDD-friendly
   first task, same ordering rationale P0a used for its own pure-adapter first task).
2. `Finding` type change + `security.ts`'s 4 detectors switched over (single file
   dependent on task 1).
3. `RefactorBlock` type change + `refactor-planner.ts` + `refactor-safety.ts` switched
   over (dependent on task 1; touches the 3 test/fixture files that construct
   `RefactorBlock` literals).
4. Part B: `recover.ts` + CLI `recover` command (independent of tasks 1-3 — only depends
   on already-existing `refactor-checkpoints.ts`/`git.ts`).
5. Part C: `next.ts` + CLI `next` command (depends on task 1 for `confidenceTier`, and
   task 4's journal-reading pattern for the unfinished-run check).
6. Final task: root typecheck + full test suite + the two manual smoke runs against this
   repo, recorded in the report.
