# P0a — real security verification, full public-contract protection, full safety coverage

**Date:** 2026-08-19
**Status:** approved in chat 2026-08-19, pending spec review

## Context

This is the first of three sub-projects decomposed from a gap-analysis of
`YCF_FINAL_CORE_V2_CODEX.md` against the real codebase (audit performed 2026-08-19,
summarized in `YCF-Pendientes-y-Bloqueos.md`). The user resolved the analysis's two
CONFLICT findings with explicit architecture rulings that constrain all three
sub-projects:

- **The deterministic core never invents where an architecture change goes.** An
  external AI agent (Codex/Claude/compatible, via Skills/adapters) reasons and proposes;
  YCF's safety engine validates independently; YCF's executor is the only writer. This
  sub-project does not touch planning/proposal logic at all — it only makes the
  **validation** layer (safety engine, public-contract protection, verification) cover
  every operation kind and add a real security check, so that a later sub-project (the
  agent-interface work) has something real to validate against.
- **No internal multi-agent framework.** Nothing here introduces agent orchestration —
  the "provider" pattern in this spec (see below) is plain Node functions in an array,
  not an agent abstraction.

Full backlog order agreed with the user: P0a (this spec) → P0b (transactional
MOVE/RENAME + AST-based reference rewriting, spec'd separately, larger and more
invasive) → P1 (evidence/confidence/uncertainty schema, `ycf next`, `ycf recover`) → the
agent-interface subsystem (`ycf plan-context`, schema validation for externally-produced
plans, the SAFE/SUPERVISED/BLOCKED demo). Only P0a is in scope here.

## Goal

Three independent, additive hardening items, each closing a real gap the audit found
with file:line evidence — none require rewriting how MOVE/RENAME actually write to disk
(that's P0b):

1. A real `security` verification check (today `VerificationCheck['name']` has no
   `'security'` member at all), with two layers and a small provider interface so more
   layers (Semgrep, Snyk, ...) can be added later without changing the interface.
2. Public-contract protection (`package.json` `main`/`module`/`types`/`bin`/`exports`,
   barrel re-exports) extended to MOVE, RENAME, and EXTRACT — today only CONSOLIDATE
   checks it.
3. `assessRefactorSafety` (the safety engine) called from every operation kind — today
   only MOVE, RENAME, and CONSOLIDATE call it; CREATE, DELETE, EDIT_IMPORT, and
   EDIT_EXPORT can silently touch a sensitive-zone file with no classification at all.

## Non-goals (explicitly out of scope for this spec)

- Rewriting `rewriteReferences`'s write ordering or its regex-based specifier matching
  (P0b).
- A general "any web framework's sensitive endpoint lacks an auth check" detector. The
  user's security list includes this, but building it well (framework detection across
  Express/Fastify/Koa/etc.) is large and exactly the kind of aggressive-false-positive
  risk the user explicitly said to avoid defaulting to. This spec covers the WordPress
  case only (already-detectable, already has real per-callback nonce/capability
  detectors to reuse) and explicitly defers the generic-framework case rather than
  building a shallow version of it now.
- Integrating any external security tool (Semgrep, Snyk, etc.) — only the extension
  point (the provider array) is built now, per the user's explicit instruction.
- Any change to the `RefactorBlock`/`Finding` fields beyond the three optional additions
  needed for this spec's own security findings (`confidence`, `reproduce`, `status`).
  The full P1 evidence/confidence/uncertainty-state schema work is a separate
  sub-project — this spec pulls forward only the minimum slice those three new fields
  need, as optional/non-breaking additions.

## Part 1 — the `security` verification check

### Provider interface

New file `packages/core/src/security.ts`:

```typescript
export interface SecurityCheckProvider {
  name: string;
  run(target: string, files: string[]): Finding[];
}
export function runSecurityChecks(target: string, files: string[]): Finding[] {
  return [dependencySecurityProvider, basicStaticSecurityProvider].flatMap((provider) => provider.run(target, files));
}
```

No config-driven provider list, no registration API beyond editing this one array
literal — matches the codebase's existing plain-function style (no DI framework
anywhere else in `packages/core`). Adding a future provider (Semgrep, Snyk) is adding
one more object to the array; the interface does not change.

### Layer 1 — dependency security (adapter over existing, real code)

`dependencySecurityProvider` calls the already-real `dependencyAudit(target)` (from
`dependencies.ts` — confirmed real: runs `npm audit --json`/`pnpm audit --json` and
parses the result, not a stub) and maps its `DependencyVulnerability[]` into `Finding[]`:
one finding per vulnerable package, `ruleId: 'dependency-vulnerability'`,
`severity`/`risk` derived from the vulnerability's own severity, `evidence` naming the
package and whether a fix is available.

**Fail/warn threshold, configurable:** new `ycf.config.yml` section:

```yaml
security:
  dependency_fail_on: high   # low | moderate | high | critical | none
```

Parsed in `loadConfig` (`config.ts`) following the exact existing pattern used for the
`refactor:` section (a `section === 'security'` branch inside the same line-by-line
loop, default `'high'`). This threshold decides whether the `security` check reports
`status: 'failed'` (blocks FULL VERIFY) or `status: 'passed'` with findings still
visible — it does not change what gets detected, only whether detection blocks.

### Layer 2 — basic static security (new, small, deterministic)

`basicStaticSecurityProvider` adds exactly six genuinely new detectors, each using the
same regex-over-source-text style `index.ts`'s existing rules already use (no new
parsing infrastructure):

| `ruleId` | Detects |
|---|---|
| `hardcoded-secret` | Assigned string literals matching common secret/API-key/token shapes (e.g. `AKIA[0-9A-Z]{16}`, `sk_live_...`, a variable named like `apiKey`/`secret`/`password`/`token` assigned a non-empty string literal that isn't an obvious placeholder like `''`/`process.env.X`) |
| `unsafe-eval` | `eval(...)` / `new Function(...)` — the same shape `refactor-safety.ts`'s `blockedPatterns` already matches for refactor-blocking purposes, but today that never becomes an audit `Finding`; this rule reuses the identical pattern so the two stay consistent by construction (import the pattern, don't redefine it) |
| `unsafe-shell-command` | `child_process` `exec`/`execSync` (not `execFile`/`execFileSync`, which don't shell-interpret) called with a template literal or string concatenation containing a non-literal expression |
| `sql-injection-risk` | A string built by concatenation/template-literal interpolation passed to a call that looks like a query method (`.query(`, `.execute(`, `.raw(`) — non-WordPress case; the WordPress `$wpdb` case is already covered by the existing `wordpress-wpdb-unprepared-query` rule and is reused, not reimplemented (see below) |
| `tls-verification-disabled` | `rejectUnauthorized:\s*false` or `NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]` |
| *(WordPress security findings)* | Not a new rule — `basicStaticSecurityProvider` calls the existing `wordpressFindings()` (already in `index.ts`) and re-surfaces only its security-relevant `ruleId`s (`wordpress-ajax-nonce-review`, `wordpress-ajax-capability-review`, `wordpress-wpdb-unprepared-query`, `wordpress-unsanitized-input`, `wordpress-unescaped-output`, and the others already listed in `types.ts`'s `wordpress-*` union) under the `security` check, without re-detecting them |

**Every finding this layer produces carries the three new optional `Finding` fields**
(see Part 4) — `confidence` when the pattern allows computing one (e.g. an AWS key
regex match is high-confidence; a `password`-named variable assigned a literal is
lower), `reproduce` naming the exact `ycf audit . --json` filter or grep to re-find it
by hand, and `status: 'needs_human'` or `'needs_framework_context'` for anything the
pattern can flag but not confirm (e.g. a secret-shaped string that might be a test
fixture) — never silently upgraded to `'confirmed'` when it isn't. All findings from
this layer are `risk: 'report-only'` — never auto-blocking, per the user's explicit
"nada de falsos positivos agresivos que bloqueen el pipeline por defecto."

### Wiring into `verify()`

`VerificationCheck['name']` (`types.ts`) gains `'security'`. `verificationPlan`/`verify`
(`verify.ts`) add it to FULL VERIFY only (never `verifyFast`, which stays lint+typecheck
only per its own existing, deliberate scope from the reorganization work merged today —
`verifyFast` is not touched by this spec). The check's `status` is `'failed'` only if
Layer 1's configured threshold is crossed; Layer 2 findings never fail the check by
themselves, only surface in its `output`.

## Part 2 — public-contract protection in MOVE, RENAME, EXTRACT

`publicEntryPoints`/`isReExported` (`refactor-operations.ts`, today reachable only from
the CONSOLIDATE branch of `applyRefactorOperation`) become shared helpers called from
the MOVE, RENAME, and EXTRACT branches too, against whichever file each operation is
about to relocate. `publicEntryPoints`'s parsed field set (`main`, `types`, `typings`,
`bin`, `exports`) gains `module` (the ESM entry-point field, currently unparsed). A
MOVE/RENAME/EXTRACT whose source file is a public entry point or is barrel-re-exported
throws the same `'BLOCKED: ...'` error CONSOLIDATE already throws today for this reason
— reuse the message shape, don't invent a new one.

## Part 3 — safety engine on every operation kind

`assessRefactorSafety(files, contents)` (`refactor-safety.ts`) is called today only from
MOVE/RENAME (implicitly, via the existing pre-write check) and CONSOLIDATE. It gets
called from CREATE, DELETE, EDIT_IMPORT, and EDIT_EXPORT too, against the operation's own
target file(s) — for CREATE against the target path plus the operation's own `content`
field (already available on the `CREATE` operation before any write happens — self-review
correction: an earlier draft of this spec wrongly assumed CREATE had no content to scan
yet; `RefactorOperation`'s `CREATE` variant already carries `content: string`), for
DELETE/EDIT_IMPORT/EDIT_EXPORT against the existing file's current content on disk. A `BLOCKED`
verdict throws before any write, exactly like MOVE/RENAME already do; a `SUPERVISED`
verdict is surfaced the same way EXTRACT's own narrower safety checks already surface
theirs (`'SUPERVISED: ...'` thrown error) — this spec does not change how a caller reacts
to `SUPERVISED`, only ensures every operation kind produces one when warranted.

## Part 4 — the three new optional `Finding` fields

```typescript
export interface Finding {
  // ...existing fields unchanged...
  confidence?: number;   // 0-100, present only when a rule can compute one
  reproduce?: string;    // exact command/filter to re-find this finding by hand
  status?: 'confirmed' | 'needs_human' | 'needs_framework_context'; // absent = 'confirmed'
}
```

All three are optional and additive — every existing finding-producing function in
`index.ts` is untouched and keeps working exactly as today (they simply never set these
fields, which is valid). Only the new Layer 2 static-security rules populate them. This
is a deliberately minimal slice of the full P1 evidence/confidence/uncertainty-state
work (a separate, later sub-project) — just enough for this spec's own new findings to
honor the user's "cada finding debe tener Evidence + Confidence + Reproduce" requirement
without redesigning the shared `Finding` contract project-wide yet.

## Testing

- One adversarial pair per new static-security rule: a true positive and a
  near-miss that must NOT fire (e.g. `hardcoded-secret` must not fire on
  `const apiKey = process.env.API_KEY;`).
- `dependencySecurityProvider` mapping test using a fixture `npm audit --json`-shaped
  string (reuse `parseDependencyAudit`, already tested — this test only covers the new
  `DependencyVulnerability -> Finding` mapping and the configurable fail/warn threshold).
- CREATE and DELETE in a sensitive-zone path (e.g. `auth/session.ts`) — today succeeds
  unblocked, must become BLOCKED/SUPERVISED after Part 3.
- MOVE of a file that is `package.json`'s `main` — today succeeds unblocked, must become
  BLOCKED after Part 2. Same for a MOVE of a barrel-re-exported file, and a MOVE with
  `module` set (the newly-parsed field).
- `verify()`'s FULL VERIFY output includes a `security` check entry; `verifyFast` does
  not (regression test proving the two stay distinct).

## Risk carried forward, not resolved here

The generic "sensitive endpoint without an auth check, framework-detected" item from the
user's list is explicitly deferred (see Non-goals) rather than built shallow. If real
demand shows up for it, it should get its own brainstorming pass — building framework
detection well is a bigger design question than fits inside this hardening pass.
