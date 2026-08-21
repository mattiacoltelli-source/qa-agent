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

- **CineFighi**, **CineTracker**: 3 endpoint TMDB ciascuna (ricerca,
  dettaglio titolo, scoperta titoli) — ogni app con la propria `api_key`
  reale, hardcoded nel bundle JS come nell'app stessa (le due chiavi sono
  diverse tra loro, verificato sul sorgente reale `tmdb.js`).
- **Spot**: 3 API keyless (Open-Meteo forecast, Open-Meteo marine,
  sunrise-sunset.org), verificate sul sorgente reale `app.js`, su un punto
  reale (Corfù, Città Vecchia) già presente in `spots.js`.

Per ogni endpoint: raggiungibile? Status HTTP 2xx? Il corpo ha la forma
attesa (es. TMDB può rispondere 200 con un errore incapsulato nel corpo)?

## Struttura

```
api-doctor/
  lib/http.mjs              fetch condiviso: timeout, redazione api_key nei log, nessuna valutazione
  endpoints/
    cinefighi.mjs             3 check TMDB, chiave di CineFighi
    cinetracker.mjs            3 check TMDB, chiave di CineTracker (diversa)
    spot.mjs                    3 check meteo/mare/alba-tramonto, nessuna chiave
  engine.mjs                  orchestratore: gira i controlli, scrive reports/api-doctor-results.json
  analyze.mjs                  analisi Claude, SOLO sugli endpoint in FAIL
  write-summary.mjs            riepilogo leggibile su GITHUB_STEP_SUMMARY
```

Per aggiungere una quarta app: creare `api-doctor/endpoints/<nome>.mjs` che
esporta `{ label, checks() }`, poi aggiungere una riga in `PROJECTS` in
`api-doctor/engine.mjs`.

## Risultato per app

- **PASS**: tutti gli endpoint controllati rispondono nella forma attesa.
- **FAIL**: almeno un endpoint non raggiungibile, HTTP non-2xx, o risposta
  200 ma con una forma diversa da quella attesa (incluso l'errore
  incapsulato tipico di TMDB).

Non c'è uno stato WARN qui: un'API esterna o risponde correttamente o no.

## AI: solo quando serve

Claude viene chiamato **solo** per gli endpoint in FAIL, mai su un run
completamente PASS (costo zero in quel caso — verificabile nel log del
run: "nessuna chiamata a Claude"). Non decide PASS/FAIL: quello lo fa
`api-doctor/engine.mjs` con codice deterministico, già certo prima che
Claude veda niente. Per ogni FAIL restituisce, in italiano:

- **Probabile causa** (es. chiave scaduta/revocata, rate limit, l'API ha
  cambiato formato risposta, servizio esterno down, timeout di rete);
- **Fix consigliato**: dove guardare o cosa provare per primo.

## Credenziali

Le `api_key` TMDB usate qui sono le stesse già hardcoded e pubbliche nei
bundle JS delle due app (chiunque le trova aprendo gli strumenti sviluppo
del browser): nessun segreto nuovo. Le API di Spot non richiedono
autenticazione.

Nei log e nel JSON di report la query string viene sempre redatta
(`api_key=***`) prima di essere scritta da qualsiasi parte — non per
segretezza (la chiave è comunque pubblica), ma per non ripeterla
inutilmente in un repository pubblico che ogni run aggiorna.

Unico secret riusato: `ANTHROPIC_API_KEY` (già configurato per il QA
Agent, Settings → Secrets and variables → Actions).
