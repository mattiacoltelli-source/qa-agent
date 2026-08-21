# QA Agent

Suite di test Playwright per tre app personali: **CineFighi** (cinema
multiutente), **CineTracker** (repo `Cos90`, cinema single-user) e **Spot**
(guida di viaggio Ionio in barca a vela). Repository separato, dedicato solo
al testing — non entra in nessuna delle app in produzione.

**Uso quotidiano**: si lancia da GitHub Actions (tab **Actions** → "Run
workflow"), non serve nulla installato — vedi **[FAQ.md](FAQ.md)** per la
guida pratica (dove trovare l'esito, come testare una sola app, cosa sono i
test `@write`, ecc.). Il resto di questo file è la documentazione tecnica
del repository.

Nello stesso repository c'è anche un secondo modulo indipendente, **Data
Health Agent**: non testa il comportamento delle app (quello lo fa il QA
Agent), controlla che siano raggiungibili e che i dati su Supabase siano
integri (righe orfane, duplicati). Workflow separato ("Data Health Agent"),
stessa logica AI-solo-se-serve. Vedi **[health/README.md](health/README.md)**.

## Struttura

```
core/                    utility generiche (rete, viewport, storage) — non sanno nulla di una app specifica
apps/
  cinefighi/
    fixtures/            helper e selettori specifici di CineFighi
    tests/smoke/         test (*.spec.ts sola lettura, *.write.spec.ts scrittura, gate @write)
    README.md            modello di sicurezza dati, env var, backlog
  cinetracker/            (stessa struttura, per il repo Cos90)
  vacanza/                (stessa struttura, per il repo Spot)
playwright.config.ts      un project mobile + uno desktop per app, baseURL da env var
```

Per aggiungere una quarta app: creare `apps/<nome>/tests`, aggiungere due
`projects` (mobile + desktop) in `playwright.config.ts` con il suo
`baseURL`. Non serve toccare `/core` né le altre app.

## Esecuzione

```bash
npm install
npx playwright install --with-deps chromium

npm test                  # tutta la suite, sola lettura (default)
npm run test:cinefighi    # solo CineFighi (mobile + desktop)
npm run test:cinetracker  # solo CineTracker
npm run test:vacanza      # solo Spot

npm run test:write        # ANCHE i test che scrivono su dati reali — leggi prima i README di ogni app
npm run report             # apre l'ultimo report HTML
```

I test girano contro gli URL live GitHub Pages delle tre app (override con
`CINEFIGHI_BASE_URL` / `CINETRACKER_BASE_URL` / `VACANZA_BASE_URL`), sia in
viewport mobile che desktop (le app sono PWA usate principalmente da
telefono). Pensati per girare in GitHub Actions
(`.github/workflows/tests.yml`): report salvati come JSON (`reports/results.json`)
e HTML (`reports/html/`), caricati come artifact — pensati per essere letti
da una dashboard statica in un secondo momento, non per un DB dedicato.

## Modello di sicurezza dei dati (leggi prima di eseguire `test:write`)

- **CineFighi**: Supabase condiviso dal gruppo. Le credenziali sono
  hardcoded nel bundle dell'app — non esiste un backend di test separato.
  I test di scrittura usano sempre l'utente dedicato `_QA_Agent_` e puliscono
  ogni titolo aggiunto in un blocco `finally`. Dettagli: `apps/cinefighi/README.md`.
- **CineTracker**: Supabase personale (single-user). I test di scrittura
  toccano la libreria vera dell'utente, con lo stesso pattern di cleanup.
  Dettagli: `apps/cinetracker/README.md`.
- **Spot**: nessun backend, solo `localStorage` isolato per test — nessun
  test è taggato `@write`, girano tutti sempre. Il meteo live è sempre
  mockato (mai chiamato davvero) per restare deterministico. Dettagli:
  `apps/vacanza/README.md`.

## Determinismo

La suite non decide da sola cosa testare ad ogni run: l'elenco dei test è
fisso finché non viene aggiornato esplicitamente. Le uniche fonti di
non-determinismo esterne (TMDB per ricerche in sola lettura, meteo per Spot)
sono gestite così: TMDB è chiamato dal vivo solo per verifiche di forma
("ci sono risultati", "il tipo è coerente"), mai per assert su contenuti
specifici che potrebbero cambiare; il meteo è sempre mockato con fixture
fisse (`apps/vacanza/fixtures/weather-mock.ts`).

