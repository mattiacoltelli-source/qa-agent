# AI Predictor / esperimento predittivo sui mercati (repo `Prova`) — test Playwright

Dashboard statica (GitHub Pages) di un agente che genera previsioni AI reali
su NVDA, MSFT e AAPL (1 giorno, 7 giorni, 1 mese), le salva in modo
immutabile e ne misura l'accuratezza nel tempo. **Nessun backend e nessuna
scrittura**: la pagina legge solo file statici del proprio repo
(`data/<asset>/predictions.jsonl`, `outcomes.jsonl`, `pending.json`)
generati da una pipeline Python schedulata con GitHub Actions — le
previsioni vere e proprie non hanno nulla a che fare con questo repo di
test.

## Modello di sicurezza dei dati

Come Spot: **non esiste il rischio "dati reali condivisi"** delle altre
due app — non c'è alcun database dietro né un input utente che scriva
qualcosa, quindi nessun test è taggato `@write`. Non serve nemmeno isolare
lo stato tra un test e l'altro (la pagina non usa `localStorage`): un
browser context Playwright nuovo per test è già sufficiente.

## Dati reali, non mock: cosa questo implica per i test

A differenza delle altre app, qui non mockiamo nulla: le previsioni e gli
esiti che i test vedono sono quelli reali generati dalla pipeline quel
giorno, e cambiano nel tempo (nuove previsioni ogni giorno lavorativo,
nuovi esiti quando un orizzonte scade). I test verificano quindi
**comportamento e forma**, mai contenuti specifici:

- quante card asset ci sono e che si popolino, non quale sia oggi
  l'accuratezza o la classe predetta di una previsione;
- che un grafico mostri un canvas Chart.js O un messaggio "nessun dato" a
  seconda di quanti esiti esistono già, non quale dei due sia il caso oggi;
- che una riga di tabella, se esiste, si espanda mostrando la motivazione
  del modello — se in quel momento non esiste ancora nessuna previsione o
  nessun esito valutato per un asset, il test relativo si salta (`test.skip`)
  invece di fallire, dopo aver comunque verificato il messaggio placeholder
  corretto ("Nessuna predizione registrata." / "Nessuna valutazione
  ancora.").

## Id stabili sui contenitori dei grafici

I `<canvas>` di Chart.js vengono sostituiti (non solo nascosti) da un div
`.chart-empty` quando non ci sono ancora dati — il canvas perde quindi il
suo id. Per questo `index.html` mette l'id sul CONTENITORE
(`accuracy-wrap-<ASSET>`, `chart-wrap-<ASSET>[-1d|-7d|-1m]`), che
sopravvive alla sostituzione: i test puntano sempre al contenitore, mai al
canvas direttamente.

## Variabili d'ambiente

| Variabile | Default |
|---|---|
| `PROVA_BASE_URL` | `https://mattiacoltelli-source.github.io/Prova/` |

## Cosa copre questa prima fase

- Caricamento dashboard: header, statistiche riassuntive, le tre card asset
- SPY non compare più (rimosso dal paniere attivo il 2026-09-01)
- Banner di aggiornamento PWA nascosto di default
- Pannello "che dati analizza l'AI": chiuso di default, si apre al click sul
  summary (regressione mirata: un `<button>` annidato dentro `<summary>`
  aveva rotto il click diretto), contiene tutte le fonti dati
- Grafico accuratezza sempre visibile; sezione grafici prezzo dettagliati
  collassata di default e apribile; i tre mini-grafici per orizzonte
- Dettaglio on-tap di previsioni ed esiti (motivazione del modello, dati
  usati, confronto di prezzo per gli esiti), apertura/chiusura al click

## Backlog (non ancora coperto)

- Verifica che il pulsante "🔄 Aggiorna" nell'header ricarichi la pagina
- Contenuto del manifest.json (nome, icone, `display: standalone`)
- Un secondo browser tab/reload non duplica i chart instance (memory leak)
- Filtro per orizzonte (Tutti/1g/7g/1m, aggiunto il 2026-09-02): che
  ricalcoli davvero accuratezza/grafici/tabelle quando cambiato, non solo
  che i bottoni esistano
- Range di prezzo FLAT nel dettaglio previsione ("Resta FLAT se il
  prezzo è tra $X e $Y..."): valore coerente con price_at_generation e
  volatility_threshold_pct del record
- Nota "dati mancanti" sotto il nome asset quando l'ultimo segnale aveva
  una fonte opzionale non disponibile
- Orario della previsione in ora italiana nel pannello info (calcolato
  dinamicamente, non un valore fisso da confrontare)
