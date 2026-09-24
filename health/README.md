# Data Health Agent

Modulo indipendente dal QA Agent, nello stesso repository. Non testa il
*comportamento* delle app (quello lo fa il QA Agent con Playwright): guarda
lo *stato* dei dati e la raggiungibilità, in un momento qualsiasi, senza
aprire un browser.

**Uso quotidiano**: tab **Actions** → workflow **"Data Health Agent"** →
**"Run workflow"** → scegli quale app controllare. Funziona anche da
telefono, come il QA Agent — vedi [../FAQ.md](../FAQ.md) per la guida
generale al repository.

**Non lanciarlo insieme a un run "QA Agent" con `@write` attivo**: se un
titolo/voto di CineTracker è a metà scrittura, Data Health potrebbe
leggere quello stato transitorio e segnalarlo come un'anomalia — un falso
allarme, non un bug reale. Aspetta che l'altro run sia finito.

**Unico agente con un run automatico**: a differenza degli altri tre, gira
anche da solo ogni 6 giorni alle 03:00 UTC (`schedule` in
`.github/workflows/data-health.yml`) — orario scelto apposta per essere
notte fonda anche in Italia, per ridurre la probabilità di sovrapporsi a
un test `@write` lanciato a mano. Motivo: CineTracker è su Supabase free
tier, che sospende un progetto dopo 7 giorni senza richieste API — questo
giro automatico, facendo comunque query REST reali sul database (vedi
"Cosa controlla" sotto), evita la pausa anche se non apri l'app per un
po'. Nessuna notifica collegata: l'esito resta nella tab Actions come per
un run manuale.

## Cosa controlla

- **Uptime**: le app rispondono (GitHub Pages).
- **Integrità dati** (solo CineTracker, ha un backend Supabase — Spot no,
  solo `localStorage`): righe orfane, duplicati, incoerenze tra colonne.
  Sola lettura: questo modulo non scrive né cancella mai nulla su
  Supabase.

Subito dopo questi controlli, il workflow (non questo modulo) rilancia
`scripts/cleanup-write-residue.mjs` — la stessa rete di sicurezza già
usata da `tests.yml`, qui come secondo giro indipendente: rimuove
eventuali voti CineTracker rimasti marcati da un test `@write` il cui
try/finally non fosse arrivato in fondo.

Lo schema delle tabelle usato nei controlli (`health/projects/*.mjs`) è
stato verificato sul sorgente reale dell'app (`storage.js`), non dedotto:
se lo schema cambia là, questi file vanno aggiornati a mano.

## Struttura

```
health/
  lib/supabase-rest.mjs   lettura paginata via REST Supabase — generico
  projects/
    cinetracker.mjs         config + checkData() per CineTracker
    vacanza.mjs              idem per Spot (solo uptime, nessun checkData)
  engine.mjs                orchestratore: gira i controlli, scrive reports/health-results.json
  analyze.mjs                analisi Claude, SOLO se qualcosa non è PASS
  history.mjs                 confronta con l'ultimo run, scrive reports/health-trend.json
  write-summary.mjs          riepilogo leggibile su GITHUB_STEP_SUMMARY
```

## Storico

`health/history.mjs` gira dopo `analyze.mjs` e prima del riepilogo:
confronta i conteggi di oggi (utenti/titoli/voti, per app) con l'ultimo run
registrato PER QUELLA APP, e segnala se il numero di anomalie è aumentato.
Ogni run accoda una riga compatta a `history/data/data-health.jsonl`
(committata direttamente nel repo dal workflow — vedi `history/lib/record.mjs`
per il meccanismo condiviso a tutti e tre gli agenti che ne dispongono).
Nessun database: solo un file JSONL in Git, letto/scritto in modo
arithmetic-only (nessuna IA coinvolta). Non fa mai fallire il run.

Per aggiungere una quarta app: creare `health/projects/<nome>.mjs` che
esporta `{ label, url, checkData? }`, poi aggiungere una riga in
`PROJECTS` in `health/engine.mjs`. Non serve toccare il resto del motore
né il QA Agent.

## Risultato per app

- **PASS**: uptime ok, nessuna anomalia.
- **WARN**: uptime ok, anomalie rilevate ma tutte di severity LOW/MEDIUM
  (es. un voto orfano dopo la rimozione di un utente — atteso, non un bug).
- **FAIL**: sito irraggiungibile, oppure almeno un'anomalia HIGH (dati
  duplicati o orfani che non dovrebbero poter esistere).

## AI: solo quando serve

Claude viene chiamato **solo** per le app in WARN/FAIL, mai su un run
completamente PASS (costo zero in quel caso — verificabile nel log del
run: "nessuna chiamata a Claude"). Non ricalcola conteggi né decide
PASS/FAIL: quello lo fa `health/engine.mjs` con codice deterministico.
Interpreta soltanto le anomalie già trovate — causa probabile, severity,
dove guardare — in italiano.

## Credenziali

Stessa chiave `sb_publishable_...` già hardcoded nel bundle JS dell'app
(la trovi anche in `scripts/cleanup-write-residue.mjs`): nessun segreto
nuovo, nessun permesso più ampio del client che gira in un browser
qualsiasi. Nessuna `service_role key`, nessuna connection string Postgres.
`health/engine.mjs` (i controlli veri e propri) fa solo `GET` via REST,
mai scritture — il workflow, subito dopo, fa anche un `DELETE`, ma tramite
lo stesso script già in uso da `tests.yml`, scoperto in modo inequivocabile
solo su righe marcate col commento di test (vedi
`scripts/cleanup-write-residue.mjs` per il dettaglio).

Unico secret riusato: `ANTHROPIC_API_KEY` (già configurato per il QA
Agent, Settings → Secrets and variables → Actions).
