# YCF — demo real de aceptación

Esta demo crea un proyecto fixture temporal, lo inicializa con Git y ejecuta el
executor real. No simula resultados.

```powershell
corepack pnpm demo:acceptance
```

El flujo demuestra:

1. Mover `src/legacy/feature.mjs` a `src/features/feature.mjs`.
2. Actualizar el import de `src/app.mjs`.
3. Recalcular el import interno hacia `math.mjs`.
4. Ejecutar `node --test` y los checks de build.
5. Crear un segundo bloque que falla de forma controlada.
6. Revertir solo ese bloque, incluida una operación `CREATE` anterior al fallo.
7. Conservar el primer bloque verificado.
8. Escribir el diario de checkpoints y un informe en `artifacts/acceptance-demo.md`.

El script termina con error si cualquiera de esas afirmaciones no se cumple.
