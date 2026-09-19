# Stato pubblicato (`status/`)

Ogni agente, a fine run, scrive qui **l'essenziale del proprio esito** in un
file JSON committato nel repo: `status/<agente>.json`.

Serve a una cosa sola: rendere leggibile l'esito **senza token e senza
scadenza**. Gli artifact di GitHub Actions (`reports/*.json`) richiedono
autenticazione e spariscono dopo 14/30 giorni; `history/data/*.jsonl` esiste
solo per quattro agenti su sei e serve a confrontare due run, non a dire
"com'è adesso". Il consumatore previsto è la dashboard **App Control
Center** (repo `Default`), che è una pagina statica senza backend e legge
questi file via `raw.githubusercontent.com`.

**Questo modulo non controlla niente.** `build-status.mjs` legge il report
che l'agente ha già scritto e lo traduce. Il giudizio PASS/WARN/FAIL resta
di chi il controllo l'ha fatto davvero.

## Forma del file

```jsonc
{
  "agent": "data-health",
  "label": "Data Health Agent",
  "updatedAt": "2026-09-18T19:26:02.827Z", // ultimo run che ha toccato questo file
  "apps": {
    "cinefighi": {
      "result": "PASS",                     // PASS | WARN | FAIL | INFRA_ERROR
      "summary": "Online · 0 anomalie",     // una riga, già leggibile
      "metrics": { "users": 7, "titles": 565, "votes": 961 },
      "problems": [                          // al massimo 5, già in italiano
        { "severity": "HIGH", "message": "Sito irraggiungibile: HTTP 503" }
      ],
      "runAt": "2026-09-18T19:26:02.827Z",  // quando è stata controllata QUESTA app
      "runUrl": "https://github.com/…/actions/runs/123"
    }
  }
}
```

Chiavi app canoniche: `cinefighi`, `cinetracker`, `spot`, `prova`. Dentro il
repo Spot è storicamente `vacanza` (cartella `apps/vacanza`): la traduzione
avviene una volta sola in `lib/normalize.mjs`, il contratto pubblico non la
eredita. Il Security Agent usa la chiave `qa-agent`: riguarda la toolchain,
non una delle quattro app.

## `runAt` per app, non solo per file

Un run parziale ("controlla solo cinefighi") **aggiorna solo quell'app** e
lascia le altre com'erano, ciascuna con la propria data. Sovrascrivere il
file intero le farebbe sparire, e chi legge le vedrebbe come "mai
controllate" invece che "controllate una settimana fa".

Quel `runAt` vecchio è il segnale più importante che questo modulo produce:
è ciò che permette alla dashboard di dire *"il controllo è scaduto"* invece
di mostrare un verde stantio. Per questo `result` non viene mai inventato
quando un report manca: si preferisce non scrivere nulla.

## `sentry.json`: l'unico che non viene da un agente

Stesso formato, fonte diversa: le issue aperte su Sentry nelle ultime 24
ore per tutte e cinque le app (le quattro monitorate più il Control Center
stesso). Lo scrive `sentry-status.mjs`, in un job a parte di
`full-check.yml` che gira sempre — anche quando qualche agente fallisce,
perché è lì che gli errori degli utenti servono di più.

**Perché sta qui e non nella dashboard**: leggere le issue richiede un
token Sentry in lettura, e la dashboard è una pagina statica pubblica dove
un token sarebbe leggibile da chiunque. Qui il token è un secret di
GitHub Actions e sul repo resta solo il risultato — nessuna credenziale
attraversa il confine. È lo stesso schema di tutto il resto: chi ha le
credenziali produce un file, chi non le ha lo legge.

Richiede il secret **`SENTRY_AUTH_TOKEN`** (scope `project:read` e
`event:read`). Finché manca, lo script lo rileva, lo dice nel log ed esce
senza fallire: a valle la dashboard mostra "sconosciuto" per gli errori,
che è la verità.

Severità volutamente mite — sono app personali, un errore JavaScript va
guardato ma non è un incendio:

| Situazione | Esito |
|---|---|
| nessuna issue aperta in 24h | PASS |
| almeno una issue | WARN |
| almeno una issue di livello `fatal` | FAIL |

Se ogni errore facesse diventare rossa una card, in una settimana la
dashboard sarebbe permanentemente rossa e smetteresti di guardarla.

## Struttura

```
build-status.mjs        solo I/O: legge reports/, fonde, scrive status/<agente>.json
sentry-status.mjs       solo I/O: interroga Sentry, scrive status/sentry.json
lib/normalize.mjs       logica pura: sei lettori (uno per agente) + merge
lib/normalize.test.mjs  test della logica pura (node --test, nessuna rete)
lib/sentry.mjs          logica pura: issue Sentry -> forma comune
lib/sentry.test.mjs     test della logica pura
```

## Uso

```bash
npm run status -- data-health   # dopo aver eseguito quell'agente
```

Nei workflow gira sempre (`if: always()`) subito prima dello step che fa
commit+push, così anche un run fallito lascia il suo esito leggibile.

## Aggiungere un agente

Aggiungere una voce in `AGENTS` in `lib/normalize.mjs` (label + funzione che
traduce il suo report), una riga in `REPORT_PATHS` in `build-status.mjs`, e
i due step nel workflow di quell'agente. Nessun altro file da toccare.
