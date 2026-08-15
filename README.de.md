# YCF — YourCodeIsFucked

> **Dein Code ist im Eimer. Lass ihn uns aufräumen.**
>
> **Your code is fucked. Let's unfuck it.**

<details>
<summary>In einer anderen Sprache lesen</summary>

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [العربية](README.ar.md) · [中文](README.zh.md)
</details>

## Nutze, was du willst.

Claude Code · Codex · Cursor · Copilot · Gemini · Lovable · Bolt · Deine eigenen Hände

```text
               schnell bauen
                    ↓
         YCF — die Qualitätsschicht
                    ↓
             sauberen Code liefern
```

**Wir erkennen keinen KI-Code. Wir erkennen schlechten Code.**

YCF ist eine kostenlose Open-Source-CLI, die eine Codebasis versteht, messbare Engineering-Probleme findet, bestätigte Rückstände sicher bereinigt, Verbesserungen plant und prüft, ob etwas kaputtging. Für Vibe Coder, KI-unterstützte Entwickler und Teams mit Quality Gates.

Vibe Coding macht Spaß. Danach aufzuräumen nicht.

## Hier beginnen

```bash
npm install -g @jotaese68/ycf-cli
cd mein-projekt
ycf audit
ycf map
ycf unfuck --dry-run
```

Nutze `--yes` erst nach der Planprüfung. YCF erstellt einen Git-Checkpoint, verifiziert das Ergebnis und führt bei Fehlern einen Rollback aus.

## Was YCF heute kann

- `ycf audit` prüft ohne Quellcode zu ändern und erklärt Risiken in Sprache und Detailgrad deiner Wahl.
- `ycf map` erstellt eine Architekturkarte mit Entry Points und lokalen Modulverbindungen.
- `ycf ai-residue` findet Entwicklungs- und KI-Rückstände, ohne Attributionen zu löschen.
- `ycf cleanup --yes` entfernt parser-bestätigte Debug-Rückstände und ausgewählte ungenutzte Imports mit Git-Sicherheit.
- `ycf unfuck --dry-run` zeigt die sichere Pipeline: Audit, Checkpoint, Bereinigung, Verifikation und Bericht.
- `ycf refactor` erstellt einen überwachten Plan, statt die Architektur heimlich umzuschreiben.
- `ycf verify` und `ycf release` führen Prüfungen aus und erstellen einen Release-Bericht.

YCF enthält deterministische Diagnosen für JavaScript, TypeScript, React, PHP und WordPress. Hooks, Filter, Shortcodes, REST, AJAX, Cron und WooCommerce gelten nicht als tot, nur weil kein direkter Aufruf sichtbar ist.

## Die Dämonen der Codebasis

`DeadCode`, `CopyPaste`, `GodComponent`, `MysteryHelper`, `FinalFinalV3`, `TODOFromHell` und `DependencyNobodyUses`: lustige Namen für Probleme, die echte Beweise brauchen. Jeder Fund erklärt Datei, Risiko, sichere Aktion und die noch nötige menschliche Entscheidung.

> „Es funktioniert“ ist keine Dokumentation. Produktion ist kein Test-Framework.

## Ernsthafte Technik unter dem Witz

- `ycf audit` ändert niemals Quellcode.
- Sichere Bereinigung verlangt einen sauberen Git-Worktree, Checkpoint und explizites `--yes`.
- Authentifizierung, Zahlungen, öffentliche APIs, Datenbankschemata und dynamische Callbacks werden nie automatisch verändert.
- Lizenzen, Copyright und erforderliche Attributionen bleiben geschützt.
- Ein Refactor bleibt ein überwachter Plan, bis genug Evidenz für eine sichere Umsetzung vorliegt.

## Warum ich das gebaut habe

Ich nutzte KI, um schneller zu bauen. Und es funktionierte. Eine Weile.

Dann öffnete ich Projekte voller doppelter Helper, Monate alter „temporärer“ Patches, Ordner namens `final-final-v3` und Komponenten, die so groß waren, dass sie bald einen Tarifvertrag verlangten.

Alles funktionierte. Mehr oder weniger. Es jemandem zu erklären, ohne Schweiß zu reviewen oder professionell zu übergeben, war eine andere Geschichte.

Der ärgerliche Teil? Es war mein eigenes Chaos.

Ich wollte die Geschwindigkeit behalten, ohne den Tatort heimlich aufzuräumen. Deshalb baute ich YCF: nicht um so zu tun, als hätte ein Mensch den Code geschrieben, sondern damit er klar, wartbar, überprüfbar und versandbereit ist.

## Erst CLI. Dann Skills und Agenten.

Der Kern von YCF ist deterministisch: er kartiert, misst, schützt mit Git, schreibt Berichte und verifiziert. YCF ist für die Zusammenarbeit mit Codex, Claude Code und anderen Agenten konzipiert. Skills, umfangreichere Wirkungsanalyse und ein lokales visuelles Cockpit stehen auf der Roadmap und werden nicht als bereits geliefert vermarktet.

`ycf init` wählt Sprache und Erklärungsniveau. Englisch ist Standard; Spanisch, Portugiesisch, Französisch, Deutsch, Italienisch, Arabisch und Chinesisch sind verfügbar.

```bash
ycf audit --language de --audience guided
ycf audit --audience professional
```

## Mitwirken und Sicherheit

YCF ist unter Apache-2.0 Open Source. Siehe [CONTRIBUTING.md](CONTRIBUTING.md) und [SECURITY.md](SECURITY.md).

Erstellt von [Jota Santos](https://www.jsantos.pro/).
