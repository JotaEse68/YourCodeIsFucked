# YCF — gap analysis técnico

Fecha: 2026-08-16

## Fuentes de verdad

- `YCF-YourCodeIsFucked-SPEC-Codex.md`: comportamiento técnico del producto.
- `YCF_MASTER_BRIEF_PARA_CODEX.docx`: identidad, UX, comunicación y límites de presentación.
- Chat de trabajo compartido: decisiones del executor y sus ocho restricciones duras.

## IMPLEMENTED

- Executor arquitectónico por bloques.
- MOVE y RENAME reales.
- Actualización estática de `import`, `export ... from`, `require` e `import()`.
- Resolución de rutas relativas y aliases de `tsconfig.json`/`jsconfig.json`.
- Recalculo de imports internos al mover un módulo.
- Operaciones `MOVE`, `RENAME`, `CREATE`, `DELETE`, `EDIT_IMPORT`, `EDIT_EXPORT`, `EXTRACT` y `CONSOLIDATE`.
- Undo explícito por operación y rollback aislado por bloque.
- Verificación FAST/FULL y clasificación `SAFE`, `SUPERVISED` y `BLOCKED`.
- Integración inicial en `unfuck` y `seniorize`.

## PARTIAL

- La extracción existe, pero aún usa rangos de líneas y no AST completo.
- El rollback aislado funciona con el diario de undo; falta checkpoint Git persistente por bloque.
- La consolidación de duplicados exactos necesita más protección para APIs públicas y reexports.
- La cobertura de aliases, `export-from`, `require`, `import()` y callbacks dinámicos necesita tests adicionales.

## MISSING

- Extracción AST con preservación completa de imports, exports, tipos, comentarios, scope y tests.
- Arquitectura BEFORE/AFTER en el informe final.
- Demo externa reproducible con fixture real, movimiento, tests/build, fallo controlado y rollback visible.

## ACTION

1. Implementar checkpoints Git persistentes por bloque.
2. Reemplazar extracción por rangos por transformación AST TypeScript.
3. Añadir tests de resolución y callbacks dinámicos.
4. Crear la demo externa de aceptación.
5. Actualizar README y marketing en un commit separado, solo con claims demostrados.

## Regla de publicación

Cada bloque se revisa, valida y publica por separado. No se debe subir el executor,
la documentación y la demo en un único commit o push.
