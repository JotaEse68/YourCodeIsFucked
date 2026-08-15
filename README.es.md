# YCF — YourCodeIsFucked

[English](README.md) · **Español** · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)

YCF es una herramienta open source de línea de comandos para entender, auditar y mejorar proyectos de código de forma segura. No intenta averiguar quién escribió el código: detecta problemas medibles y explica qué hacer después.

## Empieza aquí

```bash
npm install -g your-code-is-fucked
cd mi-proyecto
ycf init
ycf audit
ycf unfuck --dry-run
ycf release
```

En `ycf init` puedes elegir idioma y nivel de explicación. Para una guía clara, elige `Español` y `guided`.

## Cómo leer un resultado

- **AUTO**: YCF puede aplicar el cambio con checkpoint y verificación.
- **SAFE REFACTOR**: hay una mejora posible, pero debes revisar la intención antes de aplicarla.
- **REPORT-ONLY**: YCF explica el problema; no cambia nada.
- **ARCHITECTURAL**: afecta zonas sensibles y requiere decisión humana.

Ejecuta `ycf cleanup --dry-run` para ver cambios seguros. Solo usa `ycf cleanup --yes` cuando hayas revisado el plan; YCF crea un checkpoint Git y revierte si la verificación falla.

Antes de publicar, ejecuta `ycf release`. Reúne auditoría, mapa arquitectónico, verificaciones disponibles, estado limpio de Git y README; después guarda un informe claro de **LISTO** o **REVISIÓN NECESARIA** en `.ycf/`. Nunca modifica el código fuente. Usa el idioma elegido en `ycf init` o indícalo con `ycf release --language es`.

## Qué protege YCF

YCF no modifica automáticamente autenticación, pagos, APIs públicas, esquemas de base de datos, integraciones externas ni callbacks dinámicos de frameworks. `ycf audit` nunca modifica el código.

## Estado actual

Incluye diagnósticos JS/TS/React y PHP/WordPress, limpieza segura de artefactos de depuración e imports nombrados seleccionados, informes, checkpoints, validación y control de publicación. Los refactors amplios siguen siendo planes supervisados.
