# YCF — YourCodeIsFucked

> **Il tuo codice è un casino. Sistemiamolo.**
>
> **Your code is fucked. Let's unfuck it.**

<details>
<summary>Leggi in un'altra lingua</summary>

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [العربية](README.ar.md) · [中文](README.zh.md)
</details>

## Usa quello che vuoi.

Claude Code · Codex · Cursor · Copilot · Gemini · Lovable · Bolt · Le tue mani

```text
              costruisci veloce
                     ↓
         YCF — il livello qualità
                     ↓
             spedisci codice pulito
```

**Non rileviamo codice IA. Rileviamo codice cattivo.**

YCF è una CLI gratuita e open source per capire una codebase, trovare problemi misurabili, pulire in sicurezza residui confermati, pianificare miglioramenti e verificare che nulla si sia rotto. Per vibe coder, sviluppatori assistiti dall'IA e team che hanno bisogno di quality gate.

Il vibe coding è divertente. Pulire dopo molto meno.

## Inizia qui

```bash
npx ycf-unfuck audit
npm install -g ycf-unfuck
cd mio-progetto
ycf audit
ycf map
ycf unfuck --dry-run
```

Usa `--yes` solo dopo aver letto il piano. YCF crea un checkpoint Git, verifica il risultato ed esegue rollback se la verifica fallisce.

## Cosa fa YCF oggi

- `ycf audit` controlla senza modificare codice e spiega i rischi nella lingua e al livello scelto.
- `ycf map` genera una mappa architetturale con entry point e connessioni locali.
- `ycf ai-residue` cerca residui di sviluppo e IA senza cancellare attribuzioni.
- `ycf cleanup --yes` rimuove residui di debug confermati dal parser e alcuni import inutilizzati con sicurezza Git.
- `ycf unfuck --dry-run` mostra la pipeline sicura: audit, checkpoint, pulizia, verifica e report.
- `ycf refactor` crea un piano supervisionato invece di riscrivere di nascosto l'architettura.
- `ycf verify` e `ycf release` eseguono verifiche e producono il report di release.

YCF include diagnostica deterministica per JavaScript, TypeScript, React, PHP e WordPress. Hook, filter, shortcode, REST, AJAX, cron e WooCommerce non sono considerati morti solo perché non hanno una chiamata diretta.

## I demoni della codebase

`DeadCode`, `CopyPaste`, `GodComponent`, `MysteryHelper`, `FinalFinalV3`, `TODOFromHell` e `DependencyNobodyUses`: nomi divertenti per problemi che richiedono prove vere. Ogni risultato deve dire file, rischio, azione sicura e decisione umana ancora necessaria.

> “Funziona” non è documentazione. La produzione non è un framework di test.

## Ingegneria seria sotto la battuta

- `ycf audit` non modifica mai il sorgente.
- La pulizia sicura richiede un worktree Git pulito, checkpoint e `--yes` esplicito.
- Autenticazione, pagamenti, API pubbliche, schemi database e callback dinamici non cambiano mai automaticamente.
- Licenze, copyright e attribuzioni obbligatorie sono protetti.
- Un refactor resta un piano supervisionato finché non ci sono prove sufficienti per farlo in sicurezza.

## Perché l'ho costruito

Ho usato l'IA per costruire più velocemente. E ha funzionato. Per un po'.

Poi aprivo progetti pieni di helper duplicati, patch “temporanee” di mesi prima, cartelle `final-final-v3` e componenti così enormi che stavano per chiedere un contratto collettivo.

Tutto funzionava. Più o meno. Spiegarlo, revisionarlo senza sudare o consegnarlo come qualcosa di professionale era un'altra storia.

La parte irritante? Era il mio stesso disastro.

Volevo mantenere la velocità senza ripulire la scena del crimine di nascosto. Per questo ho creato YCF: non per fingere che il codice sia stato scritto da un umano, ma per renderlo chiaro, manutenibile, verificabile e pronto da spedire.

## Prima la CLI. Poi Skills e agenti.

Il cuore di YCF è deterministico: mappa, misura, protegge con Git, scrive report e verifica. È progettato per lavorare con Codex, Claude Code e altri agenti. Skills, analisi d'impatto più ricca e un cockpit visivo locale sono roadmap, non funzionalità già consegnate.

`ycf init` permette di scegliere lingua e livello di spiegazione. L'inglese è predefinito; sono disponibili anche spagnolo, portoghese, francese, tedesco, italiano, arabo e cinese.

```bash
ycf audit --language it --audience guided
ycf audit --audience professional
```

## Contributi e sicurezza

YCF è open source con licenza Apache-2.0. Consulta [CONTRIBUTING.md](CONTRIBUTING.md) e [SECURITY.md](SECURITY.md).

Creato da [Jota Santos](https://www.jsantos.pro/).
