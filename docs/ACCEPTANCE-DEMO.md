# YCF — demo real de aceptación

Esta demo crea un proyecto fixture temporal, lo inicializa con Git y ejecuta el
executor real. No simula resultados.

```powershell
corepack pnpm demo:acceptance
```

El flujo cubre los 12 escenarios de aceptación requeridos:

- **A** — Mover `src/legacy/feature.mjs` a `src/features/feature.mjs` (BLOCK-001, `MOVE`).
- **B** — Renombrar `src/legacy/greeting.mjs` a `src/legacy/hello.mjs` y actualizar su único consumidor (BLOCK-003, `RENAME`).
- **C** — Actualizar el import de `src/app.mjs` tras el movimiento del módulo (BLOCK-001).
- **D** — Recalcular el import interno de `feature.mjs` hacia `math.mjs` tras moverlo (BLOCK-001).
- **E** — Extraer `formatTotal` de `src/legacy/text.mjs` a `src/legacy/format-total.mjs`, dejando un re-export en el origen (BLOCK-002, `EXTRACT`). El módulo extraído queda dentro del grafo que ejecuta `app.mjs` de verdad — no es solo una comprobación de texto.
- **F** — Consolidar `src/legacy/format-b.mjs` (duplicado exacto) en `src/legacy/format-a.mjs`, eliminando el duplicado (BLOCK-004, `CONSOLIDATE`).
- **G** — Ejecutar `node --test` y los checks de build (`fullVerify: true`) tras cada bloque.
- **H** — Fallo controlado: BLOCK-005 crea un archivo y luego falla deliberadamente (un `RENAME` sobre un archivo inexistente).
- **I** — Rollback aislado: solo BLOCK-005 se revierte, incluida la operación `CREATE` previa al fallo; los bloques ya verificados no se tocan.
- **J** — Continuidad tras el fallo de un bloque hermano: BLOCK-006 no depende de BLOCK-005 y se ejecuta y verifica con éxito aunque BLOCK-005 se revierta.
- **K** — Diff antes/después del fixture completo (Git diff real, no simulado).
- **L** — Reporte de arquitectura antes/después (`result.before.architecture` / `result.after.architecture`, incluidos ciclos de dependencias), en la sección "Architecture" del informe generado.

Además, el script escribe el diario de checkpoints y un informe en `artifacts/acceptance-demo.md`.

El script termina con error si cualquiera de esas afirmaciones no se cumple.

**Fix verificado en esta demo**: `EXTRACT` generaba el import hacia el módulo extraído sin extensión de archivo (`from './format-total'`), lo que rompía en tiempo de ejecución en un proyecto `type: module` (ESM nativo de Node, que exige extensión explícita en imports relativos). Ya está arreglado: `EXTRACT` ahora conserva la extensión real cuando el destino es un módulo JS/MJS/CJS/JSX, y solo la sigue omitiendo para TypeScript (`.ts`/`.tsx`, donde el compilador la rechaza). Esta demo lo prueba de verdad — `text.mjs` queda dentro del grafo que ejecuta `app.mjs`, y `node --test` corre y pasa un test dedicado a esto.
