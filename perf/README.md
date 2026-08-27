# Performance Agent

Terzo modulo indipendente nello stesso repository, insieme a QA Agent e
Data Health Agent. Misura le prestazioni reali delle tre app (Performance,
Accessibility, Best Practices, SEO) con Google Lighthouse, l'unico dei tre
controlli che si applica anche a Spot (nessun backend, quindi Data Health
non lo copre sui dati).

**Uso quotidiano**: tab **Actions** → workflow **"Performance Agent"** →
**"Run workflow"** → scegli quale app controllare. Vedi
[../FAQ.md](../FAQ.md) per la guida generale al repository.

## Come funziona

Lighthouse gira in un Chromium headless — lo stesso binario già installato
per il QA Agent (`npx playwright install --with-deps chromium`), nessun
browser aggiuntivo da scaricare. Gira in modalità **mobile** di default
(le tre app sono PWA usate principalmente da telefono).

Per ogni app: 4 punteggi (0-100), confrontati con le soglie in
`perf/thresholds.mjs`, più le 5 metriche grezze che compongono davvero il
punteggio "performance" (FCP, LCP, TBT, CLS, Speed Index) — il punteggio
0-100 da solo non dice *dove* va il tempo, queste sì. Utili per confrontare
due app diverse, non solo per vedere se una singola app peggiora nel
tempo.

Per i 5 audit con il punteggio più basso, il riepilogo mostra anche il
risparmio stimato in byte/ms e le risorse specifiche coinvolte, quando
Lighthouse le fornisce (es. "Efficiently encode images — ~1800 KB
risparmiabili" seguito dal file immagine coinvolto). Nessuna chiamata in
più: sono campi che Lighthouse calcola comunque, prima scartati e ora
letti (vedi `extractAuditDetail` in `engine.mjs`). Non tutti gli audit
hanno questa forma (es. quelli di accessibilità) — in quel caso resta solo
il titolo, non è un errore.

## Soglie

Partite volutamente larghe al primo giro, poi tarate il 21/08/2026 sui
punteggi reali osservati in produzione (CineFighi 96/91/96/90, CineTracker
84/88/96/90, Spot 79/89/92/90):

```js
{ performance: 70, accessibility: 80, "best-practices": 85, seo: 80 }
```

Ogni soglia resta sotto il minimo osservato per quella categoria, non al
filo: un run normale resta PASS, solo un peggioramento vero fa scattare
WARN/FAIL. Se le app cambiano sensibilmente (redesign, nuove dipendenze),
vale la pena ricontrollare i punteggi reali e aggiornare
`perf/thresholds.mjs` di conseguenza.

## Risultato per app

- **PASS**: tutti i punteggi sopra soglia.
- **WARN**: almeno un punteggio sotto soglia, ma non di molto (meno di 20
  punti).
- **FAIL**: almeno un punteggio sotto soglia di 20 punti o più, oppure
  Lighthouse non è riuscito a caricare la pagina.

## AI: solo quando serve

Claude viene chiamato **solo** per le app in WARN/FAIL, mai su un run
completamente PASS. Riceve i punteggi e i principali "audit" già
individuati da Lighthouse stesso (mai inventati da Claude) e li traduce in
una spiegazione breve, una priorità, e un primo intervento concreto da
provare — non ricalcola né rimette in discussione i punteggi.

## Storico

`perf/history.mjs` gira dopo `analyze.mjs` e prima del riepilogo:
confronta i quattro punteggi Lighthouse di oggi con l'ultimo run
registrato PER QUELLA APP. Non usa una percentuale — un calo assoluto di
punti conta più della percentuale che rappresenta (90→85 è solo -5.5% ma è
un calo reale; 40→38 è -5% ma quasi ininfluente a un livello già basso) —
segnala un calo di almeno 5 punti su una categoria. Ogni run accoda una
riga compatta a `history/data/performance.jsonl` (committata direttamente
nel repo dal workflow — vedi `history/lib/record.mjs` per il meccanismo
condiviso a tutti e quattro gli agenti che ne dispongono). Nessun
database: solo un file JSONL in Git, letto/scritto in modo
arithmetic-only (nessuna IA coinvolta). Non fa mai fallire il run.

## Credenziali

Nessuna nuova. Lighthouse legge solo l'HTML/JS pubblico delle tre app,
come farebbe un visitatore qualsiasi — nessun accesso a Supabase, nessuna
scrittura da nessuna parte. Unico secret riusato: `ANTHROPIC_API_KEY`
(già configurato per gli altri due moduli).
