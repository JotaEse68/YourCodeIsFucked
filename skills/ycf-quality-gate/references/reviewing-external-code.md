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

## 2. Detect and ignore bundled third-party SDKs before scoring

Real-world plugins and apps often bundle a third-party SDK wholesale (payment/licensing
SDKs, analytics SDKs, vendored API clients) as a plain folder, not under a conventional
`vendor/`/`node_modules/` that YCF already ignores by default. Left in, that folder can
dominate the finding count and make the score reflect a library the author did not write
instead of their own code.

Signal to watch for: a top-level or second-level folder with its own `LICENSE`, its own
`readme`/changelog, or code that looks structurally unrelated to the rest of the project.
Add it to a `ycf.config.yml` in the working copy:

```yaml
version: 1
mode: balanced
language: en
audience: guided
ignore:
  - freemius
```

Re-run `ycf audit` after adding the ignore and report both numbers if useful context: the
raw scan (everything) and the scoped scan (the author's own code) — do not silently
report only one without saying which.

## 3. Show, do not just tell

`ycf cockpit .` produces a self-contained HTML dashboard. When the user asks to *see*
results (not just read a findings list), generate it and open/screenshot it — a visual
health bar and findings-by-file view lands very differently than a wall of text.

## 4. Report what changed, honestly

If nothing was applied yet (audit/cockpit are read-only), say so plainly: what is shown
is the "before" state, and there is no "after" until a specific finding is reviewed and
an approved fix applied through the normal checkpoint/verify/rollback flow in `SKILL.md`.
Do not imply a fix happened when only analysis did.
