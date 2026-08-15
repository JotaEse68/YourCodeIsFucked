---
name: ycf-quality-gate
description: Use YCF to understand, audit, clean up, refactor, verify, and document a JavaScript, TypeScript, React, PHP, or WordPress repository. Trigger when a user asks whether a codebase is messy, wants to remove AI/development residue, needs a change-impact review, or wants a safe pre-release quality gate.
---

# YCF Quality Gate

Use YCF as the evidence layer before changing a repository. YCF is irreverent in wording but conservative in behavior: never claim that code is AI-generated, never delete attribution or licenses, and never make a source change without an explicit user approval.

## Workflow

1. Detect the project root and read its package scripts/configuration. Preserve existing uncommitted work; do not reset, stash, or overwrite it.
2. Start read-only:

   ```bash
   ycf audit .
   ycf map .
   ycf impact <module> .
   ycf cockpit .
   ```

3. Explain each finding in plain language: what was found, why it matters, risk level, and whether it is safe, review-only, or architectural.
4. For cleanup, show the plan first:

   ```bash
   ycf cleanup . --dry-run
   ```

   Only after the user explicitly approves, run `ycf cleanup . --yes`. Confirm the checkpoint, verification result, and Git diff summary. If verification fails, report that YCF rolled back.
5. For structural work, generate a plan without editing:

   ```bash
   ycf refactor . --dry-run
   ycf verify .
   ```

   Never silently apply architectural refactors. Ask the user to approve a specific recommendation and define the verification checks before editing.
6. Before release, run `ycf release . --dependencies`. Treat medium findings as a review gate and low findings as explicit follow-up items.

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
