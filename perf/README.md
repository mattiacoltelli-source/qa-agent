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
`perf/thresholds.mjs`.

## Soglie: permissive per ora, di proposito

Le soglie di partenza sono **volutamente larghe**:

```js
{ performance: 50, accessibility: 70, "best-practices": 70, seo: 60 }
```

L'idea: vedere prima i punteggi reali delle tre app in produzione (che
oggi non conosciamo), poi stringerle in un secondo momento in base a quei
numeri — partire già rigorosi avrebbe rischiato un FAIL immediato su
qualcosa che magari è così da sempre, senza che sia un problema nuovo da
inseguire. Quando saranno pronte a essere alzate, si modifica solo
`perf/thresholds.mjs`.

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

## Credenziali

Nessuna nuova. Lighthouse legge solo l'HTML/JS pubblico delle tre app,
come farebbe un visitatore qualsiasi — nessun accesso a Supabase, nessuna
scrittura da nessuna parte. Unico secret riusato: `ANTHROPIC_API_KEY`
(già configurato per gli altri due moduli).
