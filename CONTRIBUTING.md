# Contributing to YCF

Thank you for helping improve YCF. Keep every contribution understandable, reversible, and safe for people who do not know the codebase well.

## Before you change code

1. Open an issue or describe the problem clearly before broad changes.
2. Do not add automatic changes for authentication, payments, public APIs, database schemas, permissions, or dynamic framework entry points.
3. Prefer a small, focused commit with tests over a large mixed change.

## Local checks

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm ycf -- release . --dependencies
```

The dependency check only reads public advisories. It must never update packages automatically.

## Pull requests

- Explain the user problem, the risk, and why the proposed change is safe.
- Add or update a focused test for new diagnostics or behavior.
- Do not commit secrets, generated `.ycf/` reports, or local dependency folders.
- Keep documentation in sync when a command, safety boundary, or supported language changes.

## Reporting security issues

Do not open a public issue for a suspected vulnerability. Follow [SECURITY.md](SECURITY.md).
