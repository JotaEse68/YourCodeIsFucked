# YCF — YourCodeIsFucked

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · **Deutsch** · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)

YCF ist ein Open-Source-Kommandozeilentool, das Codeprojekte sicher versteht, prüft und verbessert. Es findet messbare Probleme und erklärt den nächsten Schritt.

## Schnellstart

```bash
npm install -g your-code-is-fucked
cd mein-projekt
ycf init
ycf audit
ycf unfuck --dry-run
```

Wähle in `ycf init` Sprache und Erklärungsniveau. Für klare Erklärungen wähle `Deutsch` und `guided`.

## Ergebnisse verstehen

- **AUTO**: YCF kann die Änderung mit Checkpoint und Prüfung anwenden.
- **SAFE REFACTOR**: Eine Verbesserung ist möglich; prüfe die Absicht vorher.
- **REPORT-ONLY**: YCF erklärt das Problem und ändert nichts.
- **ARCHITECTURAL**: Betrifft einen sensiblen Bereich und braucht eine menschliche Entscheidung.

Mit `ycf cleanup --dry-run` siehst du sichere Änderungen. Nutze `ycf cleanup --yes` erst nach Prüfung des Plans; YCF erstellt einen Git-Checkpoint und setzt bei fehlgeschlagener Prüfung zurück.

## Schutz und Status

YCF ändert Authentifizierung, Zahlungen, öffentliche APIs, Datenbankschemata, externe Integrationen oder dynamische Callbacks nie automatisch. Aktuell werden JS/TS/React und sichere Bereinigungen unterstützt; PHP/WordPress folgt.
