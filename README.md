# YCF — YourCodeIsFucked

> Your code is fucked. Let's unfuck it.

**Choose your language:**
[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)

YCF is an open-source command-line tool that helps you understand, audit and safely improve a codebase. It does not guess who wrote the code; it finds measurable engineering problems and explains what to do next.

<details>
<summary>English — What YCF does</summary>

YCF maps your project, finds issues, explains their risk and only applies changes it can demonstrate are safe. Start with `ycf audit`; use `ycf unfuck --dry-run` before allowing changes.
</details>

<details>
<summary>Español — Qué hace YCF</summary>

YCF crea un mapa del proyecto, encuentra problemas, explica su riesgo y solo aplica cambios que puede demostrar seguros. Empieza con `ycf audit`; usa `ycf unfuck --dry-run` antes de permitir cambios.
</details>

<details>
<summary>Português — O que o YCF faz</summary>

O YCF mapeia o projeto, encontra problemas, explica o risco e só aplica alterações comprovadamente seguras. Comece com `ycf audit` e use `ycf unfuck --dry-run` antes de permitir alterações.
</details>

<details>
<summary>Français — Ce que fait YCF</summary>

YCF cartographie le projet, détecte les problèmes, explique leur risque et n’applique que des changements démontrés sûrs. Commencez par `ycf audit` et utilisez `ycf unfuck --dry-run` avant d’autoriser des changements.
</details>

<details>
<summary>Deutsch — Was YCF macht</summary>

YCF erstellt eine Projektkarte, findet Probleme, erklärt das Risiko und wendet nur nachweislich sichere Änderungen an. Beginne mit `ycf audit` und nutze `ycf unfuck --dry-run` vor Änderungen.
</details>

<details>
<summary>Italiano — Cosa fa YCF</summary>

YCF crea una mappa del progetto, trova problemi, spiega il rischio e applica solo modifiche dimostrabilmente sicure. Inizia con `ycf audit` e usa `ycf unfuck --dry-run` prima di autorizzare modifiche.
</details>

<details>
<summary>العربية — ما الذي يفعله YCF</summary>

ينشئ YCF خريطة للمشروع ويكتشف المشكلات ويشرح المخاطر ولا يطبق إلا التغييرات الآمنة المثبتة. ابدأ بـ `ycf audit` واستخدم `ycf unfuck --dry-run` قبل السماح بالتغييرات.
</details>

<details>
<summary>中文 — YCF 的作用</summary>

YCF 会绘制项目结构、发现问题、解释风险，并且只应用已证明安全的变更。请先运行 `ycf audit`，在允许变更前使用 `ycf unfuck --dry-run`。
</details>

## Quick start

```bash
npm install -g your-code-is-fucked
cd your-project
ycf init
ycf audit
ycf unfuck --dry-run
ycf refactor --dry-run
ycf release
```

Use `ycf map` to see the detected entry points and local module connections.

Use `ycf release` before publishing. It runs the audit, architecture map, declared verification scripts, Git-cleanliness and README checks, then writes a clear READY / REVIEW REQUIRED report to `.ycf/`. It never changes source code. It uses the language selected in `ycf init`; override it with `ycf release --language es`.

This repository runs the same checks on every change and weekly. Its dependency advisory check is read-only: it can block an unsafe release, but it never updates packages automatically.

`ycf init` lets you choose the response language and explanation level. English is the default; Spanish, Portuguese, French, German, Italian, Arabic and Chinese are also available.

## Safe by default

- `ycf audit` never modifies source code.
- `ycf cleanup --yes` creates a Git checkpoint, applies only allowlisted safe changes, verifies the project and rolls back if verification fails.
- `ycf unfuck --yes` runs the current safe pipeline and writes a final report to `.ycf/`.
- Authentication, payments, public APIs, databases and dynamic framework callbacks are never changed automatically.

## Development

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

For contribution and security reporting guidance, see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). A public release still needs a license choice and an intentional versioning decision; the packages are currently private and cannot be published accidentally.

## Current status

YCF currently supports deterministic JS/TS/React and PHP/WordPress diagnostics, safe cleanup of parser-confirmed debug artifacts and selected unused named imports, Git checkpoints, verification, release-readiness reports and guided output. Broader refactors remain supervised plans.
