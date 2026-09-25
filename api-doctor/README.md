# API Doctor Agent

Modulo indipendente dal QA Agent, nello stesso repository. Non testa il
*comportamento* delle app né lo *stato* dei dati (quello lo fanno il QA
Agent e Data Health): controlla se le **API esterne** da cui le app
dipendono davvero rispondono, e nella forma attesa.

**Uso quotidiano**: tab **Actions** → workflow **"API Doctor Agent"** →
**"Run workflow"** → scegli quale app controllare. Funziona anche da
telefono, come gli altri agenti — vedi [../FAQ.md](../FAQ.md) per la guida
generale al repository.

## Cosa controlla

- **CineTracker**: 3 endpoint TMDB (ricerca, dettaglio titolo, scoperta
  titoli) — con la `api_key` reale, hardcoded nel bundle JS come
  nell'app stessa, verificato sul sorgente reale `tmdb.js`.
- **Spot**: 3 API keyless (Open-Meteo forecast, Open-Meteo marine,
  sunrise-sunset.org), verificate sul sorgente reale `app.js`, su un punto
  reale (Corfù, Città Vecchia) già presente in `spots.js`.
- **Prova (AI Predictor)**: 6 controlli keyless (Yahoo Finance prezzo, SEC
  EDGAR elenco ticker, SEC EDGAR submissions, GDELT — le fonti *primarie*
  di prezzo/fondamentali/transazioni insider più la fonte di riserva per le
  news — e lo storico giornaliero di Yahoo per i due ticker "non
  standard" del secondo sistema dell'app, i Trend strutturali: `6481.T`
  (Tokyo) e l'indice `^SOX` usato come benchmark di settore), verificate
  sul sorgente reale del repo Prova
  (`src/data_sources/{prices,fundamentals,news,insider}.py`,
  `src/config.py`, `src/trend_run.py`). I due controlli trend chiedono la
  serie storica, non il prezzo di oggi: è quella che
  `trend_analysis.py` legge per CAGR, media a 200 settimane e distanza da
  ATH, e un 200 senza `chart.result[0].timestamp` non basta. Il controllo
  SEC EDGAR submissions (`data.sec.gov`) è separato da quello sull'elenco
  ticker (`www.sec.gov`) perché sono sottodomini/gateway diversi con
  disponibilità potenzialmente indipendente. Le fonti a chiave (Twelve
  Data, Finnhub, Alpha Vantage, FRED) restano fuori: sono secret
  server-side del repo Prova, non chiavi pubbliche riusabili come per
  TMDB — richiederebbero copiarle anche qui.

Per ogni endpoint: raggiungibile? Status HTTP 2xx? Il corpo ha la forma
attesa (es. TMDB può rispondere 200 con un errore incapsulato nel corpo)?

In più, se la risposta include header di rate-limit/quota (`X-RateLimit-*`,
`RateLimit-*`, `Retry-After`), vengono riportati nel riepilogo — a costo
zero, nessuna chiamata in più, nessuna nuova credenziale. **Nessuna delle
API controllate oggi (TMDB, Open-Meteo, sunrise-sunset.org, Yahoo Finance,
SEC EDGAR, GDELT) garantisce di inviarli**: se assenti, il campo resta
vuoto, non è un errore né un FAIL — è solo pronto per il giorno in cui una
di queste API (o una nuova aggiunta in futuro) inizia a mandarli.

## Struttura

```
api-doctor/
  lib/http.mjs              fetch condiviso: timeout, redazione api_key nei log, nessuna valutazione
  endpoints/
    cinetracker.mjs            3 check TMDB, chiave di CineTracker
    spot.mjs                    3 check meteo/mare/alba-tramonto, nessuna chiave
    prova.mjs                   6 check Yahoo Finance (prezzo + storico Tokyo/^SOX)/SEC EDGAR (x2)/GDELT, nessuna chiave
  engine.mjs                  orchestratore: gira i controlli, scrive reports/api-doctor-results.json
  analyze.mjs                  analisi Claude, SOLO sugli endpoint in FAIL
  write-summary.mjs            riepilogo leggibile su GITHUB_STEP_SUMMARY
```

Per aggiungere un'altra app: creare `api-doctor/endpoints/<nome>.mjs` che
esporta `{ label, checks() }`, poi aggiungere una riga in `PROJECTS` in
`api-doctor/engine.mjs`.

## Risultato per app

- **PASS**: tutti gli endpoint controllati rispondono nella forma attesa.
- **FAIL**: almeno un endpoint ha risposto, ma male — HTTP non-2xx, o
  risposta 200 con una forma diversa da quella attesa (incluso l'errore
  incapsulato tipico di TMDB). Fa fallire il job (e quindi notificare su
  Telegram, vedi `full-check.yml`).
- **INFRA_ERROR**: la richiesta non è nemmeno arrivata a destinazione (DNS,
  timeout, connessione rifiutata — dopo un retry silenzioso, vedi
  `lib/http.mjs`). **Non** fa fallire il job: non è un problema dell'API,
  è un blip di rete del runner GitHub Actions — trattarlo come un FAIL
  vero produrrebbe falsi allarmi e farebbe finire per ignorare le notifiche
  reali. Resta comunque visibile nel riepilogo di questo run.

Un check contro una fonte che a volte rifiuta di servirci *in quel momento*
può chiedere in più il retry paziente (`retryWhenRefused: true`): due
tentativi distanziati 5s e 10s su 429, 503 o connessione caduta senza
risposta. Non cambia l'esito di niente, cambia solo quante volte si chiede
prima di scriverlo — se il rifiuto sopravvive ai tentativi il check resta
rosso com'era. Oggi nessun check lo usa (vedi sotto).

### best effort: misurato, ma fuori dallo stato

Un check può dichiararsi `bestEffort: true` (oggi solo **News (GDELT)** in
`endpoints/prova.mjs`): viene eseguito e compare nel report come ogni altro,
ma **non concorre al rollup dell'app** né all'exit code del job.

Serve per una fonte che da un runner GitHub non può passare per ragioni
fuori dal nostro controllo. GDELT limita a **una richiesta ogni 5 secondi
per ip**, gli ip dei runner sono condivisi, e a quota esaurita non risponde
nemmeno 429: lascia cadere la connessione (`UND_ERR_CONNECT_TIMEOUT`). Dal
18 al 25 settembre 2026 questo da solo ha tenuto Prova in INFRA_ERROR in 8
run su 10 — un allarme fisso su cui non c'era niente da correggere, cioè
esattamente il rumore che il resto del modulo è fatto per evitare.

Non è un modo per far sparire i problemi: un check normale continua a
decidere lo stato, un `bestEffort` rotto non ne copre nessuno, e il suo
esito resta scritto nel report e nel riquadro di `status/`, marcato
`[best effort: non incide sullo stato]`. Se GDELT torna raggiungibile, si
vede subito.

Non c'è uno stato WARN qui: un'API esterna o risponde correttamente o no —
INFRA_ERROR non è una via di mezzo, è un tipo di problema diverso (del
runner, non dell'API).

## AI: solo quando serve

Claude viene chiamato **solo** per gli endpoint in FAIL vero, mai su un run
completamente PASS né su un run con solo INFRA_ERROR (costo zero in
entrambi i casi — verificabile nel log del run: "nessuna chiamata a
Claude"; non ha senso chiedere una diagnosi applicativa se il problema è
che il runner non ha raggiunto l'endpoint). Non decide PASS/FAIL/INFRA_ERROR:
quello lo fa `api-doctor/engine.mjs` con codice deterministico, già certo
prima che Claude veda niente. Per ogni FAIL restituisce, in italiano:

- **Probabile causa** (es. chiave scaduta/revocata, rate limit, l'API ha
  cambiato formato risposta, servizio esterno down, timeout di rete);
- **Fix consigliato**: dove guardare o cosa provare per primo.

## Credenziali

La `api_key` TMDB usata qui è la stessa già hardcoded e pubblica nel
bundle JS dell'app (chiunque la trova aprendo gli strumenti sviluppo
del browser): nessun segreto nuovo. Le API di Spot non richiedono
autenticazione.

Nei log e nel JSON di report la query string viene sempre redatta
(`api_key=***`) prima di essere scritta da qualsiasi parte — non per
segretezza (la chiave è comunque pubblica), ma per non ripeterla
inutilmente in un repository pubblico che ogni run aggiorna.

Unico secret riusato: `ANTHROPIC_API_KEY` (già configurato per il QA
Agent, Settings → Secrets and variables → Actions).
