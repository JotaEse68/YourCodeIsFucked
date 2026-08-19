---
name: ycf-quality-gate
description: Use YCF to understand, audit, clean up, refactor, verify, and document a JavaScript, TypeScript, React, PHP, or WordPress repository. Trigger when a user asks whether a codebase is messy, wants to remove AI/development residue, needs a change-impact review, or wants a safe pre-release quality gate.
---

# YCF Quality Gate

Use YCF as the evidence layer before changing a repository. YCF is irreverent in wording but conservative in behavior: never claim that code is AI-generated, never delete attribution or licenses, and never make a source change without an explicit user approval.

## Workflow

1. Detect the project root and read its package scripts/configuration. Preserve existing uncommitted work; do not reset, stash, or overwrite it.
2. Before scoring, check for bundled third-party SDKs that YCF's default ignores (`node_modules`, `vendor`, `dist`, `build`, `coverage`, `.git`, `.ycf`) do not catch. Look for top-level or second-level folders that carry their own license/SDK identity distinct from the project (examples: `freemius`, a payment/analytics SDK, a vendored API client). If found, add them to `ycf.config.yml` under `ignore:` before running audit, so the score reflects the project's own code, not a library it happens to include. This matters most when reviewing an app or plugin you did not author — see [references/reviewing-external-code.md](references/reviewing-external-code.md).
3. Start read-only:

   ```bash
   ycf audit .
   ycf map .
   ycf impact <module> .
   ycf cockpit .
   ```

   If findings still concentrate overwhelmingly in one folder not already ignored, that is a signal of an undetected vendored SDK — add it to `ignore:` and re-run before reporting a score. Always state what share of findings came from ignored/vendored code versus the project's own, even when no vendor folder needed excluding.
4. Explain each finding in plain language: what was found, why it matters, risk level, and whether it is safe, review-only, or architectural.
5. For cleanup, show the plan first:

   ```bash
   ycf cleanup . --dry-run
   ```

   Only after the user explicitly approves, run `ycf cleanup . --yes`. Confirm the checkpoint, verification result, and Git diff summary. If verification fails, report that YCF rolled back.
6. For structural work, generate a plan without editing:

   ```bash
   ycf refactor . --dry-run
   ycf verify .
   ```

   Before proposing where anything should move, load the organization conventions in [references/stack-profiles.md](references/stack-profiles.md) for the detected stack and check what structure the repository already partially follows via `ycf understand .` -- extend an existing convention before inventing a new one. Present the exact old-path -> new-path mapping and the reason for each move, one block at a time. Never silently apply architectural refactors. Ask the user to approve a specific recommendation and define the verification checks before editing.

   Once the user approves one or more moves in chat, write them to `.ycf/reorganization-plan.json` as an `ArchitecturalRefactorPlan` (one `MOVE` block per approved move, `mode: 'SUPERVISED'`, `reason` holding the plain-language justification already given in chat). Tell the user they can now run `ycf cockpit .` and use the "Reorganize" tab to apply, undo, or keep each move with one click, and to finalize when done -- or keep applying moves one at a time with `ycf move --dry-run`/`--yes` from the terminal if they prefer that instead. Never write this file before the user has approved the specific moves in it.
7. Before release, run `ycf release . --dependencies`. Treat medium findings as a review gate and low findings as explicit follow-up items.

## Stack profiles

When YCF detects a supported stack, load the matching guidance in [references/stack-profiles.md](references/stack-profiles.md). Keep the base checkpoint, approval, diff, and verification rules unchanged.

## Communication rules

- Prefer the user's configured language and explain English technical terms immediately.
- Use the YCF voice lightly: "Vibe coding is fast. Technical debt is faster." Keep advice professional and actionable.
- Say "static evidence" when the result comes from imports or source patterns. Mention that dynamic loading, runtime configuration, framework callbacks, and external consumers may be invisible.
- Do not invent a score, dependency, risk, or fix. Link every recommendation to the YCF output.
- For beginners, give one recommended next action and explain what could break if they choose another path.

## Agent handoff

When working with Codex, Claude Code, Cursor, Copilot, Gemini, or another agent, use YCF before asking that agent to rewrite code. Include the audit report, architecture map, impact result, and verification plan in the handoff. Ask the agent to return a focused diff and tests; then run YCF verification again.
