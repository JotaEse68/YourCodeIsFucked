# YCF - YourCodeIsFucked

> # Your code is fucked.
> ## Let's unfuck it.

**Tu código está jodido. Vamos a arreglarlo.**

<details>
<summary>Read this in another language</summary>

[Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)
</details>

---

## Use whatever the hell you want.

Claude Code · Codex · Cursor · Copilot · Gemini · Lovable · Bolt · Your own hands

```text
                 BUILD FAST
                     ↓
                CREATE STUFF
                     ↓
              ACCUMULATE SHIT
                     ↓
                    YCF
                     ↓
       UNDERSTAND · AUDIT · CLEAN · REFACTOR
                     ↓
                  VERIFY
                     ↓
              SHIP CLEAN CODE
```

**We don't detect AI code. We detect bad code.**

**No detectamos código escrito por IA. Detectamos código malo.**

Vibe coding is fun. Cleaning up after it isn't.

El vibe coding es divertido. Limpiar después no.

YCF es la capa de calidad para el desarrollo asistido por IA: entiende tu codebase, encuentra la deuda, propone el arreglo, verifica que nada se rompa y deja evidencia.

## The promise

YCF should be:

- Installable in one minute.
- Useful in five minutes.
- Safe on a real project.
- Memorable when it shows you the problems.
- Professional when it executes the changes.

## Built with AI? Built by humans? Mixed nightmare?

Maybe you wrote everything yourself.
Maybe twelve agents touched the repo.
Maybe it started clean and slowly became a crime scene.

YCF works in all three cases.

Use it from day one to keep the codebase clean.
Use it six months later when nobody knows what `final-final-v3` does.

We don't care who wrote the code.
We care whether it's clear, maintainable and safe to change.

## So... how fucked is your code?

```bash
npx @jotaese68/ycf audit

# O instala el comando corto para usarlo siempre
npm install -g @jotaese68/ycf
cd your-project
ycf audit
```

**Never used a terminal before?** One line installs Node.js-aware YCF and tells you
exactly what to type next — nothing else to configure.

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/JotaEse68/YourCodeIsFucked/main/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/JotaEse68/YourCodeIsFucked/main/install.ps1 | iex
```

If you don't have Node.js yet, the script tells you to grab it from
[nodejs.org](https://nodejs.org) first (it won't install anything silently) — then run
the line again. Once it's done, run `ycf cockpit` inside your project folder for the
visual dashboard.

**Never opened a terminal at all?** Download `YCF-Launcher-Windows.exe` from
the [latest release](https://github.com/JotaEse68/YourCodeIsFucked/releases/download/v0.1.15/YCF-Launcher-Windows.exe),
double-click it, and choose your project folder when it asks — no install, no terminal,
ever. First run: Windows will say it protected your PC (the binary isn't code-signed
yet) — click "More info", then "Run anyway".

The binary isn't signed, so this is the only integrity check available: its SHA-256 is
`f8682daab5a008118edcd05a108803627e7fd29df4609449e752f6cbb14a45f1`. Verify it with
`certutil -hashfile YCF-Launcher-Windows.exe SHA256` (Windows) if you want to confirm
what you downloaded matches what's published here.

Mac support is built but not yet verified on a real Mac — check the
[releases page](https://github.com/JotaEse68/YourCodeIsFucked/releases) for current status.

YCF puede darte malas noticias. La diferencia es que te dice dónde están, por qué importan y qué hacer después.

```text
╭──────────────────────────────────────╮
│            YCF AUDIT                 │
├──────────────────────────────────────┤
│ FUCKED SCORE: 30%                    │
│ HEALTH SCORE: 70/100                 │
│                                      │
│ Architecture ................. 37   │
│ Maintainability .............. 55   │
│ Security .................... 100   │
│ Tests ........................ 25   │
│ Documentation ................ 65   │
╰──────────────────────────────────────╯
```

Las cinco dimensiones son deterministas. Mismo commit, misma configuración, mismo resultado. No las inventa una IA porque le pareció que tu carpeta tenía mala energía.

## First: look. Then: touch.

```bash
# No modifica código
ycf audit
ycf map --html
ycf impact src/billing/SubscriptionService.ts .
ycf cockpit .

# Ver el plan antes de cambiar nada
ycf unfuck --dry-run
ycf cleanup --dry-run
ycf refactor --dry-run
```

Si el plan tiene sentido:

```bash
ycf unfuck --yes
```

Checkpoint. Limpieza. Verificación. Diff. Y si algo explota, rollback.

Porque borrar cosas a ciegas probablemente es cómo llegamos hasta aquí.

## Meet the demons

Cada codebase tiene demonios. YCF les pone nombre para que puedas hablar del problema sin fingir que no existe.

<p>
  <img src="docs/assets/demons/deadcode.png" width="72" alt="DeadCode">
  <img src="docs/assets/demons/copypaste.png" width="72" alt="CopyPaste">
  <img src="docs/assets/demons/godcomponent.png" width="72" alt="GodComponent">
  <img src="docs/assets/demons/mysteryhelper.png" width="72" alt="MysteryHelper">
  <img src="docs/assets/demons/finalfinalv3.png" width="72" alt="FinalFinalV3">
  <img src="docs/assets/demons/todofromhell.png" width="72" alt="TODOFromHell">
  <img src="docs/assets/demons/dependencynobodyuses.png" width="72" alt="DependencyNobodyUses">
</p>

### DeadCode

Lleva años en `/utils`. Nadie lo importa. Nadie sabe por qué existe. Y en WordPress quizá alguien lo llama desde un hook que no aparece en una búsqueda rápida.

**Estado:** candidato. **Tratamiento:** investigar antes de borrar.

### CopyPaste

Una función funcionaba. Así que alguien creó siete:

```text
calculatePrice()
calculatePriceNew()
calculatePrice2()
calculatePriceFinal()
calculatePriceFinalNew()
calculatePriceFixed()
calculatePriceREAL()
```

YCF rastrea la responsabilidad antes de proponer una sola versión.

### GodComponent

1.847 líneas. 37 imports. Autenticación, billing, UI y notificaciones en el mismo archivo. Probablemente también hace café.

YCF no lo parte con un hacha. Primero averigua qué responsabilidades están mezcladas y qué consumidores podrían romperse.

### MysteryHelper

```ts
function processDataThingFinal(data) { /* ... */ }
```

Nadie sabe qué hace. Nadie sabe quién lo necesita. YCF pide contexto antes de tocarlo.

### FinalFinalV3

```text
checkout.js
checkout-new.js
checkout-fixed.js
checkout-final.js
checkout-final-2.js
checkout-final-final-v3.js
```

Uno está en producción. Buena suerte. YCF busca referencias y te enseña la evidencia.

### TODOFromHell

```js
// TODO: temporary fix
```

Git dice que lleva once meses siendo temporal. YCF lo convierte en una decisión: arreglar, documentar o abrir una tarea real.

### DependencyNobodyUses

Instalada durante un experimento. El experimento murió. La dependencia sigue ocupando espacio y nadie recuerda por qué.

YCF comprueba imports estáticos, pero avisa si puede existir uso dinámico.

## YCF doesn't just complain

Encontrar problemas es fácil. Decir “23 problemas encontrados” y marcharse es una forma elegante de no ayudar.

YCF trabaja así:

```text
UNDERSTAND
    ↓
AUDIT
    ↓
FIND THE PROBLEM
    ↓
TRACE RESPONSIBILITY
    ↓
CHECK DEPENDENCIES
    ↓
PLAN THE FIX
    ↓
CREATE GIT CHECKPOINT
    ↓
CLEAN / REFACTOR
    ↓
TEST → BUILD → VERIFY
    ↓
KEEP / ROLLBACK
```

## Stop reading files one by one

```bash
ycf map --html
```

YCF genera un mapa de arquitectura local. Después puedes preguntar:

```bash
ycf impact src/billing/SubscriptionService.ts
```

YCF muestra dependencias directas, consumidores y superficie de cambio visible estáticamente.

El análisis no adivina: carga dinámica, callbacks de frameworks y consumidores externos pueden necesitar revisión humana.

## Welcome to the cockpit

```bash
ycf cockpit .
```

Abre `.ycf/cockpit.html` en tu navegador. Sin cuenta. Sin SaaS. Sin subir tu repositorio a ningún sitio porque un dashboard tenga gradientes.

Incluye score, hallazgos, módulos, impacto, planes guiados y exportación JSON. Los botones que podrían cambiar código enseñan primero el plan y el diff.

## Who is this for?

### The vibe coder

“Tengo una idea enorme y no soy senior, pero quiero entregar algo mantenible.”

### The AI-assisted developer

“Sé lo que hago. Claude y Codex simplemente generan código más rápido de lo que puedo revisar cada línea.”

### The old-school senior

“Odio el vibe coding.”

Cierra Copilot. Cierra Claude. Cierra Codex. Ahora dilo otra vez. Esperaremos.

### The professional team

“Usamos agentes, pero necesitamos quality gates antes de mezclar este material.”

YCF habla con los cuatro.

## Serious engineering under the profanity

YCF habla mal. El motor no.

- `ycf audit` es de solo lectura.
- La limpieza exige worktree limpio, checkpoint y `--yes` explícito.
- YCF verifica después de cambiar y revierte si falla.
- APIs públicas, pagos, autenticación, esquemas de base de datos y callbacks dinámicos requieren revisión humana.
- Licencias, copyright y atribuciones no se borran.
- WordPress no se trata como una carpeta de JavaScript: hooks, AJAX, REST, cron y WooCommerce importan.

## Agents welcome

YCF no es otro prompt genérico. Incluye una skill reutilizable en [`skills/ycf-quality-gate`](skills/ycf-quality-gate) y adaptadores para Claude Code, Cursor y Copilot en [`integrations/`](integrations/).

La herramienta funciona con Codex, Claude, Cursor, Copilot, Gemini, Lovable, Bolt o tus propias manos. Los agentes aportan razonamiento; YCF aporta evidencia, guardarraíles y verificación.

## Why I built this

Empecé a usar IA porque quería construir más rápido.

Funcionó. Demasiado bien.

Feature. Feature. Patch. Otro helper. Un arreglo temporal. Una versión final de la versión final.

Un día abrí uno de mis proyectos antiguos y pensé:

> ¿Quién coño ha escrito esto?

Git tenía la respuesta.

Yo.

La aplicación funcionaba. Más o menos. Pero debajo había helpers duplicados, experimentos abandonados, estructuras raras y funciones que nadie quería tocar porque nadie sabía qué iba a explotar.

Me había vuelto increíblemente eficiente produciendo software. También produciendo deuda técnica.

La solución no era dejar de usar IA. Eso sería absurdo. La solución era poner disciplina de ingeniería después de la velocidad.

Quería conservar Codex, Claude y los agentes. Quería seguir construyendo rápido. Pero cuando otro desarrollador abriera el repositorio, quería que pensara:

> Nice.

No:

> What the fuck happened here?

Así nació YCF.

## Build however the hell you want

Vibe codea el producto entero si quieres. Usa veinte agentes. Escríbelo todo en Vim. Nos da igual.

Solo no confundas:

```text
IT RUNS
```

con:

```text
IT'S READY
```

Antes de publicar:

```bash
ycf unfuck
```

**Your code is fucked. Let's unfuck it.**

Created by [Jota Santos](https://www.jsantos.pro/)

Digital systems · AI-assisted development · automation

[www.jsantos.pro](https://www.jsantos.pro/)

---

Apache-2.0 · Free and open source.
