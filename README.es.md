# YCF — YourCodeIsFucked

> **Tu código está jodido. Vamos a arreglarlo.**
>
> **Your code is fucked. Let's unfuck it.**

<details>
<summary>Leer en otro idioma</summary>

[English](README.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)
</details>

## Usa lo que quieras.

Claude Code · Codex · Cursor · Copilot · Gemini · Lovable · Bolt · Tus propias manos

```text
                 crea rápido
                      ↓
          YCF — la capa de calidad
                      ↓
              envía código limpio
```

**No detectamos código escrito por IA. Detectamos código malo.**

YCF es una CLI gratuita y open source para entender un proyecto, encontrar problemas de ingeniería medibles, limpiar residuos confirmados de forma segura, planificar mejoras estructurales y comprobar que no se ha roto nada. Sirve al vibecoder con una gran idea, al senior con seis ventanas de agentes abiertas y al equipo que necesita quality gates antes de publicar.

El vibe coding es divertido. Limpiar después no.

## Empieza aquí

```bash
npm install -g @jotaese68/ycf-cli
cd mi-proyecto

# Primero mira. YCF no modifica el código fuente.
ycf audit
ycf map

# Mira el plan antes de permitir cambios.
ycf unfuck --dry-run
```

Cuando estés de acuerdo, usa `--yes`. YCF crea un checkpoint Git antes de la limpieza segura, verifica el resultado y hace rollback si falla la verificación.

```bash
ycf cleanup --yes
ycf unfuck --yes
ycf verify
ycf release
```

## Lo que YCF hace hoy

| Comando | Qué hace | ¿Modifica código? |
| --- | --- | --- |
| `ycf audit` | Audita un repositorio y explica riesgos en tu idioma y nivel elegido. | No |
| `ycf map` | Genera un mapa de arquitectura con entry points y conexiones locales detectadas. | No |
| `ycf ai-residue` | Busca candidatos de residuos de desarrollo e IA sin cambiar código ni atribución. | No |
| `ycf cleanup --yes` | Elimina residuos de depuración confirmados por parser e imports nombrados seleccionados con seguridad Git. | Sí, solo tras confirmar |
| `ycf unfuck --dry-run` | Muestra el pipeline seguro actual: auditoría, checkpoint, limpieza, verificación e informe. | No |
| `ycf refactor` | Genera un plan supervisado de refactor, sin reescribir tu arquitectura a escondidas. | No |
| `ycf verify` | Ejecuta los scripts disponibles de lint, typecheck, tests y build. | No |
| `ycf release` | Genera un informe de preparación para release con auditoría, mapa, verificaciones y Git. | No |

YCF incluye diagnósticos deterministas para JavaScript, TypeScript, React, PHP y WordPress. En WordPress respeta hooks, filters, shortcodes, rutas REST, AJAX, cron y patrones de WooCommerce: nada de asumir alegremente que “sin uso directo” significa “muerto”.

## Los demonios del codebase

Son las cosas que YCF persigue. Los nombres son divertidos; la evidencia no se inventa.

| Demonio | Traducción técnica aburrida |
| --- | --- |
| `DeadCode` | Código o archivos que necesitan análisis de referencias antes de llamarlos muertos. |
| `CopyPaste` | Lógica repetida que merece una responsabilidad clara. |
| `GodComponent` | Un archivo o componente que sabe demasiado, hace demasiado y teme a los tests. |
| `MysteryHelper` | Un helper cuyo propósito, dueño o llamadas no están claros. |
| `FinalFinalV3` | Residuos de desarrollo, alternativas abandonadas y archivos “definitivos”. |
| `TODOFromHell` | TODOs viejos, parches temporales y comentarios convertidos en yacimientos arqueológicos. |
| `DependencyNobodyUses` | Una dependencia candidata que necesita pruebas antes de salir de `node_modules`. |

> “Funciona” no es documentación. Producción no es un framework de testing.

Cada hallazgo debe decir qué se encontró, dónde vive, por qué importa, qué riesgo tiene, qué puede hacer YCF con seguridad y qué necesita aún una decisión humana. Sin métricas imaginarias. Sin borrados ciegos. Sin fingir que `grep` es análisis de arquitectura.

## Ingeniería seria debajo de la broma

El copy es gamberro. Las reglas son conservadoras.

- `ycf audit` nunca modifica el código fuente.
- La limpieza segura exige un worktree Git limpio, checkpoint y `--yes` explícito.
- YCF verifica después de cambiar y revierte si falla la verificación.
- Autenticación, pagos, APIs públicas, esquemas de base de datos y callbacks dinámicos nunca se cambian automáticamente.
- Licencias, copyright y atribuciones obligatorias están protegidos. Limpiar residuos no es ocultar de dónde sale el código.
- Un refactor sigue siendo un plan supervisado hasta que hay evidencia suficiente para hacerlo seguro.

Los linters encuentran problemas de sintaxis y estilo. YCF busca problemas estructurales y explica qué hacer después.

## Por qué construí esto

Usé IA para construir más rápido.

Y funcionó. Durante un rato.

Después abría proyectos llenos de helpers duplicados, parches “temporales” de hace meses, carpetas llamadas `final-final-v3` y componentes tan grandes que ya empezaban a pedir convenio colectivo.

Todo funcionaba. Más o menos.

Pero explicárselo a otra persona, revisarlo sin sudar o entregarlo como algo profesional era otra historia.

¿La parte molesta? Era mi propio desastre.

Quería conservar la velocidad sin limpiar el escenario del crimen a escondidas antes de que alguien mirase el código.

Por eso construí YCF.

No para fingir que el código lo escribió un humano. Para que, lo haya escrito quien lo haya escrito, quede claro, mantenible, verificable y listo para enviar.

## Primero CLI. Después Skills y agentes.

YCF no es un wrapper de prompts ni una sola instrucción para un agente. Su núcleo es una CLI determinista: crea mapas, mide, comprueba seguridad Git, escribe informes y ejecuta verificaciones. Eso da a los agentes algo mejor que una opinión vaga: evidencia y guardarraíles.

YCF está diseñado para trabajar junto a Codex, Claude Code y otros agentes. Skills, comandos guiados, análisis de impacto más rico y un cockpit visual local forman parte del roadmap; no se anuncian aquí como funciones ya terminadas.

## Hazlo comprensible para tu equipo

`ycf init` permite elegir idioma y nivel de explicación. El inglés es el idioma por defecto; también están disponibles español, portugués, francés, alemán, italiano, árabe y chino.

```bash
ycf audit --language es --audience guided
ycf audit --audience professional
```

El motor no cambia. Solo cambia la explicación: guía clara para quien aprende, detalle técnico para desarrolladores o lenguaje profesional para revisiones y CI.

## Roadmap

El próximo gran “wow” no es una lista de avisos más bonita. Es una vista navegable de arquitectura e impacto: entender el repositorio, ver rutas críticas y saber qué puede verse afectado antes de tocar algo importante.

Después, un cockpit YCF local podrá leer los informes de `.ycf/` y ofrecer Auditoría, Mapa, Revisión de limpieza, Plan de refactor, Verificación y Exportar informe. Todo botón que cambie código deberá enseñar primero su plan y el Git diff.

## Contribuir y seguridad

YCF es open source con licencia Apache-2.0. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para contribuir y [SECURITY.md](SECURITY.md) para comunicar una vulnerabilidad de forma responsable.

Creado por [Jota Santos](https://www.jsantos.pro/).
