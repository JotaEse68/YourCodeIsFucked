# YCF — YourCodeIsFucked

[English](README.md) · [Español](README.es.md) · [Português](README.pt.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · **Italiano** · [العربية](README.ar.md) · [中文](README.zh.md)

YCF è uno strumento open source da riga di comando per comprendere, controllare e migliorare un progetto in modo sicuro. Trova problemi misurabili e spiega il passo successivo.

## Inizia qui

```bash
npm install -g your-code-is-fucked
cd mio-progetto
ycf init
ycf audit
ycf unfuck --dry-run
```

In `ycf init` scegli lingua e livello di spiegazione. Per spiegazioni chiare scegli `Italiano` e `guided`.

## Capire un risultato

- **AUTO**: YCF può applicare la modifica con checkpoint e verifica.
- **SAFE REFACTOR**: è possibile un miglioramento; controlla l’intenzione prima di modificare.
- **REPORT-ONLY**: YCF spiega il problema senza modificare nulla.
- **ARCHITECTURAL**: riguarda un’area sensibile e richiede una decisione umana.

Usa `ycf cleanup --dry-run` per vedere le modifiche sicure. Usa `ycf cleanup --yes` solo dopo aver letto il piano; YCF crea un checkpoint Git e ripristina se la verifica fallisce.

## Protezioni e stato

YCF non modifica automaticamente autenticazione, pagamenti, API pubbliche, schemi di database, integrazioni esterne o callback dinamici. La versione attuale include diagnostica JS/TS/React e PHP/WordPress, pulizie sicure e controllo di pubblicazione con `ycf release`.

Questo repository esegue questi controlli a ogni modifica e ogni settimana. La consultazione degli avvisi sulle dipendenze è di sola lettura: può bloccare una pubblicazione non sicura, ma non aggiorna mai i pacchetti automaticamente.
