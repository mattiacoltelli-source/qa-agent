---
name: verifica-locale
description: Verifica in locale una modifica a CineFighi, CineTracker o Spot prima di spedirla in produzione — server statico locale, dati reali mockati nel browser (mai chiamate di rete vere da Chromium, che in alcuni ambienti sandbox falliscono su HTTPS anche quando curl/node funzionano), bump della cache-busting version, screenshot di conferma, suite di test esistente. Usalo ogni volta che stai per implementare per davvero (non un mockup/artifact) un cambiamento a una di queste tre app, prima di commit/push.
---

# Verifica locale di una modifica a CineFighi / CineTracker / Spot

Procedura per verificare che una modifica reale funzioni prima di
spedirla — sempre in locale, mai scrivendo sul Supabase condiviso vero
solo per "vedere se funziona".

## 0. Prima di cominciare

Se la modifica tocca dati veri in lettura o scrittura (non solo file
locali), leggi prima lo Skill **sicurezza-dati** — questa procedura
copre SOLO la verifica tecnica, non le regole di sicurezza dei dati.

## 1. Avvia un server statico locale

Nella cartella dell'app (CineFighi, CineTracker/Cos90, o Spot — qualunque
sia già clonata in questa sessione, altrimenti clonala prima):

```bash
python3 -m http.server 8123 &
```

Qualsiasi porta libera va bene, tienila a mente per i passi dopo.

## 2. Il problema noto del sandbox: Chromium e l'HTTPS reale

In alcuni ambienti (incluso il container di sviluppo usato per questo
progetto) Chromium lanciato da Playwright può fallire con
`net::ERR_CONNECTION_RESET` su qualunque destinazione HTTPS reale
(Supabase, TMDB, Google Fonts, persino la pagina di produzione su GitHub
Pages) — **anche quando `curl` e il `fetch` nativo di Node funzionano
perfettamente sulla stessa richiesta, nello stesso momento**. Prima di
concludere che è un problema nel tuo codice, verifica isolando il
sintomo:

```bash
node -e '
import("playwright-core").then(async ({chromium}) => {
  const browser = await chromium.launch({ args: ["--no-sandbox", "--ignore-certificate-errors"] });
  const page = await browser.newPage();
  try { console.log("status:", (await page.goto("https://example.com")).status()); }
  catch (e) { console.log("ERRORE:", e.message); }
  await browser.close();
});'
```

Se anche questa richiesta minima fallisce, non è il tuo codice: è
l'ambiente. La soluzione **non è debuggare il proxy** (tempo perso, già
provato: proxy espliciti, `--proxy-server`, `--disable-quic`, niente ha
funzionato in modo affidabile) — è **non far mai dipendere la verifica
da una vera richiesta HTTPS del browser**. Vedi il punto 3.

## 3. Mocka SEMPRE i dati nel browser, usa dati REALI presi da Node

Il fetch nativo di Node funziona anche quando Chromium no — quindi leggi
i dati reali (sola lettura) con Node/qa-agent, poi passali al browser
via `page.route()`:

```js
import { chromium } from "playwright-core";
import { fetchAllRows } from "./health/lib/supabase-rest.mjs"; // da qa-agent

const SUPABASE_URL = "..."; // stessa chiave pubblica già hardcoded nell'app
const SUPABASE_KEY = "...";

const [users, titles, votes] = await Promise.all([
  fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "users", { select: "name" }),
  fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "titles", { select: "*" }),
  fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "votes", { select: "*" }),
]);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--ignore-certificate-errors"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.route(/rest\/v1\/users/, r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(users) }));
await page.route(/rest\/v1\/titles/, r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(titles) }));
await page.route(/rest\/v1\/votes/, r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(votes) }));
await page.route(/fonts\.googleapis\.com/, r => r.abort()); // non serve per verificare il comportamento

await page.goto("http://localhost:8123/index.html", { waitUntil: "domcontentloaded" }); // MAI "networkidle": il service worker tiene la rete "occupata" all'infinito
```

Questo è sola lettura sul vero Supabase (sicuro, vedi lo Skill
sicurezza-dati) e zero dipendenza da HTTPS nel browser: il risultato è
identico a quello che vedrebbe un utente vero, con dati veri.

## 4. Bump della versione cache-busting

Ogni file dell'app importa gli altri con `?v=NN` (es.
`./ui.js?v=23"`), e `index.html` referenzia `styles.css?v=NN` e
`app.js?v=NN` allo stesso modo — è così che il service worker capisce che
c'è una versione nuova. Trova il numero attuale e incrementalo di 1
OVUNQUE compaia nel repo, in un solo colpo:

```bash
grep -rn "v=[0-9]*\"" --include="*.js" --include="*.html" . | grep -v node_modules
sed -i 's/v=NN/v=NN+1/g' app.js ui.js index.html tmdb.js   # adatta l'elenco file al repo specifico
```

## 5. Screenshot di conferma

Viewport mobile (390×844, le app sono PWA usate principalmente da
telefono). Naviga allo schermo interessato, aspetta le animazioni
(`waitForTimeout` breve, 500-1000ms, i numeri/barre si animano), poi
`page.screenshot()`. Se il contenuto è più lungo del viewport, MAI
`fullPage: true` su liste potenzialmente enormi (centinaia di righe) —
usa `scrollIntoViewIfNeeded()` sull'elemento che ti interessa e uno
screenshot normale.

## 6. Esegui la suite di test esistente (in qa-agent)

```bash
cd qa-agent
CINEFIGHI_BASE_URL=http://localhost:8123/ npx playwright test apps/cinefighi/tests/smoke/<file>.spec.ts --project=cinefighi-mobile
```

(sostituisci `CINEFIGHI_BASE_URL`/`cinefighi` con l'equivalente per
CineTracker/Spot). Se lanci l'intera suite di un'app in parallelo contro
un `python3 -m http.server` locale, può comparire un flake da
concorrenza (il server singolo-thread non regge bene 2+ worker insieme)
— se un test che prima passava fallisce solo in parallelo, riprova con
`--workers=1` prima di sospettare una regressione vera.

**Aspettati che falliscano** i test che dipendono da rete HTTPS live dal
browser (ricerca TMDB, user-picker senza mock, ecc.) per lo stesso motivo
del punto 2 — non è una regressione se tocca codice che non hai
modificato: verificalo isolando lo stesso identico sintomo di rete anche
su un branch/commit precedente, o confrontando quali test falliscono con
quelli che il tuo cambiamento tocca davvero.

## 7. Pulizia prima di commit

```bash
pkill -f "http.server 8123"
rm -rf test-results playwright-report
git status --short   # conferma che non resti nulla di superfluo
```
