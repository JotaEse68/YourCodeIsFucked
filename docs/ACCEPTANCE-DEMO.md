# YCF — demo real de aceptación

Esta demo crea un proyecto fixture temporal, lo inicializa con Git y ejecuta el
executor real. No simula resultados.

```powershell
corepack pnpm demo:acceptance
```

El flujo demuestra las cinco operaciones reales del executor en un solo fixture:

1. **MOVE**: mover `src/legacy/feature.mjs` a `src/features/feature.mjs`, actualizar el import de `src/app.mjs` y recalcular el import interno hacia `math.mjs`.
2. **EXTRACT**: extraer `formatTotal` de `src/legacy/text.mjs` a su propio módulo `format-total.mjs`.
3. **RENAME**: renombrar `greeting.mjs` a `hello.mjs` y actualizar su único consumidor.
4. **CONSOLIDATE**: fusionar un duplicado exacto (`format-b.mjs`) en el canónico (`format-a.mjs`) y actualizar su consumidor.
5. Ejecutar `node --test` y los checks de build tras cada bloque.
6. Crear un bloque que falla de forma controlada (una operación `CREATE` seguida de un `RENAME` sobre un archivo inexistente) y revertirlo de forma aislada — sin tocar los bloques ya verificados.
7. Ejecutar un bloque independiente adicional para probar que la ejecución sigue adelante después de que otro bloque revierte.
8. Escribir el diario de checkpoints y un informe en `artifacts/acceptance-demo.md`, incluida la sección "Architecture (before → after)" con el grafo de imports antes y después.

El script termina con error si cualquiera de esas afirmaciones no se cumple.

**Hallazgo real durante la construcción de esta demo (no es un bug de la demo)**: `EXTRACT` genera el import hacia el módulo extraído sin extensión de archivo (`from './format-total'`). En un proyecto `type: module` (ESM nativo de Node), eso rompe en tiempo de ejecución — Node exige extensión explícita en imports relativos. Por eso esta demo extrae desde un archivo standalone (`text.mjs`) que no forma parte del grafo que `node --test` ejecuta realmente. Queda pendiente como deuda técnica real del executor, no cubierta en este bloque — ver `YCF-Pendientes-y-Bloqueos.md`.
