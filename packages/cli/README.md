# YourCodeIsFucked

YCF is a safe, guided command-line tool to understand, audit, and improve a codebase.

Try it without installing anything:

```bash
npx @jotaese68/ycf audit
```

Or install it globally:

```bash
npm install -g @jotaese68/ycf
```

Then run `ycf init` in a project to choose a language and explanation level. YCF starts with read-only diagnostics and never makes sensitive changes automatically.

Version `0.1.0` is released only after the maintainer intentionally runs the npm publication command.

## Execution policies

`ycf unfuck` always records its plan, checkpoint, cleanup, verification and final report in `.ycf/unfuck.json` and `.ycf/unfuck.md`. The policy only changes how approvals are requested:

```bash
# Plan only; no source changes and no checkpoint
ycf unfuck --dry-run

# Approve checkpoint, cleanup and verification step by step
ycf unfuck --guided

# Approve the complete safe pipeline after reviewing the plan
ycf unfuck --yes
```

There is no mode that disables the audit trail, verification or rollback safeguards. `--guided` is interactive and should not be used in CI; use `--yes` there after reviewing the generated plan.
