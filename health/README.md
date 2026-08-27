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
titolo/voto è a metà scrittura, o l'utente `_QA_Agent_` è nel mezzo della
creazione/cancellazione automatica, Data Health potrebbe leggere quello
stato transitorio e segnalarlo come un'anomalia — un falso allarme, non un
bug reale. Aspetta che l'altro run sia finito.

**Unico agente con un run automatico**: a differenza degli altri tre, gira
anche da solo ogni 6 giorni alle 03:00 UTC (`schedule` in
`.github/workflows/data-health.yml`) — orario scelto apposta per essere
notte fonda anche in Italia, per ridurre la probabilità di sovrapporsi a
un test `@write` lanciato a mano. Motivo: CineFighi e CineTracker sono su
Supabase free tier, che sospende un progetto dopo 7 giorni senza richieste
API — questo giro automatico, facendo comunque query REST reali sui due
database (vedi "Cosa controlla" sotto), evita la pausa anche se non apri
le app per un po'. Nessuna notifica collegata: l'esito resta nella tab
Actions come per un run manuale.

## Cosa controlla

- **Uptime**: le tre app rispondono (GitHub Pages).
- **Integrità dati** (solo CineFighi e CineTracker, hanno un backend
  Supabase — Spot no, solo `localStorage`): righe orfane, duplicati,
  incoerenze tra colonne. Sola lettura: questo modulo non scrive né
  cancella mai nulla su Supabase.
- **Residui di test rimasti indietro** (solo CineFighi): un utente
  `_QA_Agent_` o un titolo aggiunto da lui più vecchio di qualche ora non
  può essere un test `@write` in corso — solo un cleanup che non è
  arrivato in fondo (il cleanup immediato in `tests.yml` gira sempre a
  fine run, l'unico modo per cui questo può succedere è che l'intero
  job/runner sia morto prima: raro, ma possibile). Severity LOW: non è mai
  un bug dell'app.

Subito dopo questi controlli, il workflow (non questo modulo) rilancia
`scripts/cleanup-write-residue.mjs` — la stessa rete di sicurezza già
usata da `tests.yml`, qui come secondo giro indipendente. Va DOPO i
controlli sopra, non prima, altrimenti l'eventuale segnalazione andrebbe
persa prima ancora di comparire nel report.

Lo schema delle tabelle usato nei controlli (`health/projects/*.mjs`) è
stato verificato sul sorgente reale delle due app (`storage.js`), non
dedotto: se lo schema cambia là, questi file vanno aggiornati a mano.

## Struttura

```
health/
  lib/supabase-rest.mjs   lettura paginata via REST Supabase — generico
  projects/
    cinefighi.mjs          config + checkData() per CineFighi
    cinetracker.mjs         idem per CineTracker
    vacanza.mjs              idem per Spot (solo uptime, nessun checkData)
  engine.mjs                orchestratore: gira i controlli, scrive reports/health-results.json
  analyze.mjs                analisi Claude, SOLO se qualcosa non è PASS
  write-summary.mjs          riepilogo leggibile su GITHUB_STEP_SUMMARY
```

Per aggiungere una quarta app: creare `health/projects/<nome>.mjs` che
esporta `{ label, url, checkData? }`, poi aggiungere una riga in
`PROJECTS` in `health/engine.mjs`. Non serve toccare il resto del motore
né il QA Agent.

## Risultato per app

- **PASS**: uptime ok, nessuna anomalia.
- **WARN**: uptime ok, anomalie rilevate ma tutte di severity LOW/MEDIUM
  (es. un voto orfano dopo la rimozione di un utente — atteso, non un bug;
  oppure un residuo di test rimasto indietro, vedi sopra — si autorisolve
  al passo di cleanup subito dopo).
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

Stessa chiave `sb_publishable_...` già hardcoded nei bundle JS delle due
app (la trovi anche in `scripts/cleanup-write-residue.mjs`): nessun
segreto nuovo, nessun permesso più ampio del client che gira in un browser
qualsiasi. Nessuna `service_role key`, nessuna connection string Postgres.
`health/engine.mjs` (i controlli veri e propri) fa solo `GET` via REST,
mai scritture — il workflow, subito dopo, fa anche un `DELETE`, ma tramite
lo stesso script già in uso da `tests.yml`, scoperto in modo inequivocabile
solo su righe riconducibili a `_QA_Agent_` (vedi
`scripts/cleanup-write-residue.mjs` per il dettaglio).

Unico secret riusato: `ANTHROPIC_API_KEY` (già configurato per il QA
Agent, Settings → Secrets and variables → Actions).
