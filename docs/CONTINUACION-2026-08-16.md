# YCF — continuidad de trabajo

Fecha: 2026-08-16

## Estado guardado

La fase del executor de refactor arquitectónico está implementada localmente y sin publicar.

Este documento refleja el bloque técnico aprobado en la conversación de trabajo del
16/08/2026. La especificación técnica sigue siendo `YCF-YourCodeIsFucked-SPEC-Codex.md`
y el brief de identidad/UX sigue siendo `YCF_MASTER_BRIEF_PARA_CODEX.docx`.

El executor debe conservar como restricciones duras:

1. MOVE/RENAME real con actualización de referencias estáticas.
2. Resolución de `import`, `export ... from`, `require`, `import()` estático, aliases y rutas relativas.
3. Recalculo de imports internos del módulo movido.
4. Bloqueo de zonas sensibles o referencias no resolubles con seguridad.
5. Operaciones atómicas registradas con undo explícito.
6. Extracción únicamente con AST, rangos y exports conocidos.
7. Verificación después de cada bloque.
8. Rollback aislado por bloque, no solo rollback global.

No se ha hecho push ni publicación npm en esta fase.

Pruebas ejecutadas correctamente:

- Core: 42 tests pasando.
- Core: typecheck pasando.
- CLI: typecheck pasando.
- CLI: build pasando.

## Implementado

- Modelo `RefactorBlock` con riesgo, confianza, dependencias, modo de seguridad y estados.
- Operaciones reversibles: MOVE, RENAME, CREATE, DELETE, EDIT_IMPORT, EDIT_EXPORT, EXTRACT y CONSOLIDATE.
- Actualización de imports ES modules, exports, require, import dinámico estático y aliases de tsconfig/jsconfig.
- Recalculo de imports internos cuando se mueve un archivo.
- Executor por bloques con dependencias y rollback aislado.
- Registro de operaciones y eventos de rollback.
- FAST VERIFY y FULL VERIFY.
- Clasificación SAFE, SUPERVISED y BLOCKED para zonas sensibles.
- `ycf refactor --architectural`.
- `ycf unfuck --apply-plan <archivo> --yes`.
- Integración inicial del executor en `ycf seniorize`.
- Demo automatizada que cubre movimiento, extracción, duplicado, fallo, rollback y continuación.
- Demo externa reproducible en `scripts/acceptance-demo.mjs`, documentada en `docs/ACCEPTANCE-DEMO.md`, con fixture Git real, tests/build, fallo controlado, rollback aislado e informe antes/después.

## Archivos principales

- `packages/core/src/refactor-types.ts`
- `packages/core/src/refactor-operations.ts`
- `packages/core/src/refactor-executor.ts`
- `packages/core/src/refactor-safety.ts`
- `packages/core/src/refactor-planner.ts`
- `packages/core/src/refactor-executor.test.ts`

## Pendiente para la próxima sesión

1. Sustituir la extracción actual por rangos de líneas por extracción AST real con TypeScript.
2. Preservar de forma completa imports, exports, tipos, comentarios, scope y tests asociados durante extracción.
3. Implementar checkpoints Git persistentes por bloque sin depender únicamente del diario de undo.
4. Añadir generación de arquitectura BEFORE/AFTER al informe final, no solo snapshots de archivos.
5. Conectar el plan arquitectónico generado con operaciones seguras reales de reorganización.
6. Añadir detección explícita de duplicados estructurales y semánticos como candidatos supervisados.
7. Revisar la compatibilidad de la operación CONSOLIDATE con APIs públicas y reexports.
8. Añadir tests para aliases, export-from, require, import() y callbacks dinámicos.
9. Revisar el cambio de dependencia CLI a `workspace:*` antes de preparar el siguiente commit.

## Alcance de producto confirmado

Se mantiene el cockpit, pero como una vista local, educativa y práctica: debe enseñar
qué encontró YCF, por qué importa, qué bloque se ejecutó, qué verificación pasó y qué
se revirtió. Incluirá una línea temporal sencilla de bloques y checkpoints para que
alguien que no conozca YCF pueda aprender a usarlo sin leer un manual entero.

Queda fuera del plan activo:

- Cloud, cuentas y servicios remotos.
- Gráficas inútiles, métricas decorativas y panel empresarial.
- Comentarios automáticos en Pull Requests.
- GitHub Action compleja; solo se contempla una acción mínima y copiable.
- Automatización avanzada de npm.
- Soporte profundo de todos los frameworks a la vez.
- Monetización, funciones sociales, badges y estadísticas históricas sofisticadas.

Estas piezas no se borran necesariamente del repositorio: dejan de bloquear el
producto central y solo volverán si un problema real demuestra que hacen falta.

## Restricciones que siguen vigentes

- No mezclar documentación, executor y demo en un único commit o publicación.
- README y marketing se actualizarán en un bloque separado, después de validar claims reales.
- No añadir badges, PR comments, cloud ni monetización.
- No publicar npm.
- No hacer push sin revisar y aprobar el bloque completo.

## Comandos de comprobación

```powershell
corepack pnpm --filter @jotaese68/core test
corepack pnpm --filter @jotaese68/core typecheck
corepack pnpm --filter @jotaese68/ycf-cli typecheck
corepack pnpm --filter @jotaese68/ycf-cli build
```

## Punto exacto para retomar

La siguiente fase recomendada es: **documentación técnica separada → checkpoints Git persistentes por bloque + extracción AST segura → demo externa**.
