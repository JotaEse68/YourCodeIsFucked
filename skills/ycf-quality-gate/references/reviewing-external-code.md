# Reviewing external code (a zip, a plugin, an app you did not author)

Use this when the target is not already a working project you maintain — a downloaded
plugin/theme zip, a third-party app, a vendor deliverable — rather than your own
repository. The base workflow in `SKILL.md` still applies; this adds the setup it assumes
already exists.

## 1. Get a persistent, Git-backed working copy

YCF's checkpoint/rollback safety net requires Git. A temp-extracted zip is not durable
across sessions and is not a Git repo. Before running anything beyond a first look:

1. Extract the archive if needed.
2. Copy it to a persistent location next to the original deliverable (not a temp
   directory that will be cleaned up), clearly named so it is not confused with the
   original asset (e.g. `<name>-ycf-test/`).
3. `git init`, commit the extracted tree as-is as a baseline snapshot, before YCF or
   anyone touches anything. This baseline commit is the real "before" to compare against
   if any change is made later.

Never edit files inside the original zip/extraction location. Always work in the copy.

## 2. "External connections": one principle, not a fixed list

Code that depends on, or is referenced by, something outside this repository's control
needs different treatment than the project's own messy or AI-generated code. This shows
up in two forms — treat both as the same underlying concern, not two unrelated rules:

- **A bundled third-party SDK** (payment/licensing SDKs, analytics SDKs, vendored API
  clients) as a plain folder, not under a conventional `vendor/`/`node_modules/` that YCF
  already ignores by default. Left in, that folder can dominate the finding count and
  make the score reflect a library the author did not write instead of their own code.
  Signal to watch for: a top-level or second-level folder with its own `LICENSE`, its own
  `readme`/changelog, or code that looks structurally unrelated to the rest of the
  project.
- **The project's own code that talks to an external service** — payments, webhooks,
  auth providers, a database. Nothing in the repo's imports proves this (a webhook
  handler is called by URL from a panel that lives outside the repo entirely), so static
  analysis alone can't see it. YCF's engine (`assessRefactorSafety`) already flags this
  by pattern — auth/login/session, billing/payment/stripe/checkout, webhook/rest/route/
  api, database/migration/schema — and blocks automatic `MOVE`/`RENAME`/`CONSOLIDATE` on
  a match. Freemius and Stripe are just the two concrete examples found so far, not an
  exhaustive list — every project has its own external connections; reason about what
  *this* project actually integrates with, don't pattern-match only the examples here.

Why it matters specifically for a vibe-coder / AI-assisted-dev audience: the goal is
organizing messy or AI-generated code, not touching a legitimate external constraint.
"Fixing" or reorganizing code that exists because of an external contract can silently
break that integration — the opposite of what YCF is for.

For the bundled-SDK case, `ycf audit` detects this on its own now: a folder that carries
its own `LICENSE`/`LICENSE.md`/`COPYING` and its own `README`/`CHANGELOG` directly inside
itself (the same signal described above) is treated as a vendored third-party SDK and
excluded from the audit automatically — no `ycf.config.yml` edit required. The audit
report lists what it excluded under `autoIgnored` (JSON) / "Auto-excluded external
connections" (Markdown/CLI), naming the folder and file count, so nothing is silently
hidden. If the heuristic is wrong — a folder that happens to ship its own LICENSE/README
but is genuinely the author's own code — force it back into scope with `include:`:

```yaml
version: 1
mode: balanced
language: en
audience: guided
include:
  - my-own-sdk-shaped-folder
```

You can still add an explicit `ignore:` entry by hand for a folder that does *not* match
the LICENSE+README heuristic (e.g. no license file shipped) but is still clearly a vendor
drop. Report both numbers if useful context: the raw scan (everything) and the scoped
scan (the author's own code) — do not silently report only one without saying which.

For the project's-own-code case, `CONSOLIDATE` already refuses to merge a file matching
these patterns without review (see `refactor-safety.ts`). Findings in these files are
still reported as real evidence, but do not treat them as ordinary "clean this up" debt —
flag that they connect externally and need a human who understands that integration, not
an automatic fix.

## 3. Show, do not just tell

`ycf cockpit .` produces a self-contained HTML dashboard. When the user asks to *see*
results (not just read a findings list), generate it and open/screenshot it — a visual
health bar and findings-by-file view lands very differently than a wall of text.

## 4. Report what changed, honestly

If nothing was applied yet (audit/cockpit are read-only), say so plainly: what is shown
is the "before" state, and there is no "after" until a specific finding is reviewed and
an approved fix applied through the normal checkpoint/verify/rollback flow in `SKILL.md`.
Do not imply a fix happened when only analysis did.
