# YCF — YourCodeIsFucked

> Your code is fucked. Let's unfuck it.

YCF is an open-source CLI for deterministic codebase understanding, auditing, safe cleanup and verification. It does not detect who wrote code; it finds measurable engineering problems.

## Development

```bash
pnpm install
pnpm build
pnpm ycf -- audit .
```

`ycf audit` is read-only. Mutating commands will require Git checkpoints and verification.

