# AI Predictor / esperimento predittivo sui mercati (repo `Prova`) — test Playwright

Dashboard statica (GitHub Pages) di un agente che genera previsioni AI reali
su NVDA, MSFT e AAPL (1 giorno, 7 giorni, 1 mese), le salva in modo
immutabile e ne misura l'accuratezza nel tempo. **Nessun backend e nessuna
scrittura**: la pagina legge solo file statici del proprio repo
(`data/<asset>/predictions.jsonl`, `outcomes.jsonl`, `pending.json`)
generati da una pipeline Python schedulata con GitHub Actions — le
previsioni vere e proprie non hanno nulla a che fare con questo repo di
test.

La stessa pagina ospita **due sistemi diversi**, su due tab alternativi
(`switchPage()`: nessuna navigazione, solo `display:none`):

- **Tech (breve termine)** — il paniere sopra, con previsioni a 1g/7g/1m e
  la loro accuratezza misurata.
- **Trend strutturali** (ex "Robotica", rietichettata con `1fcb9c4`) — una
  lettura del regime di trend a 1-10 anni su THK, Harmonic Drive Systems,
  Teradyne e Vertiv, da `data/robotics/<asset>/trend.jsonl`. Cadenza
  mensile (trimestrale per Vertiv), nessun esito futuro da valutare: non è
  una previsione puntuale, quindi non ha né accuratezza né `pending`.

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

- Caricamento dashboard: header, statistiche riassuntive, la card asset
  selezionata — la pagina Tech mostra **una card alla volta** (filtro asset
  in cima, default `ASSETS[0]`): le altre restano nel DOM con
  `display:none`, quindi ogni verifica su un asset diverso passa per il
  filtro (`selectAsset` nella fixture)
- Filtro asset: un bottone per asset, uno solo attivo, il click cambia la
  card in vista
- SPY non compare più (rimosso dal paniere attivo il 2026-09-01)
- Banner di aggiornamento PWA nascosto di default
- Pannello "che dati analizza l'AI": chiuso di default, si apre al click sul
  summary (regressione mirata: un `<button>` annidato dentro `<summary>`
  aveva rotto il click diretto), contiene tutte le fonti dati
- Grafico accuratezza sempre visibile; sezione grafici prezzo dettagliati
  collassata di default e apribile; i tre mini-grafici per orizzonte
- Dettaglio on-tap di previsioni ed esiti (motivazione del modello, dati
  usati, confronto di prezzo per gli esiti), apertura/chiusura al click
- Filtro per orizzonte (Tutti/1g/7g/1m): "Tutti" attivo di default con un
  solo bottone attivo alla volta, il click sposta lo stato attivo e
  aggiorna il suffisso `(1g)`/`(7g)`/`(1m)` sull'etichetta accuratezza, il
  filtro sta su una riga sola senza andare a capo (viewport mobile)
- Range di prezzo FLAT nel dettaglio previsione: il messaggio "Resta FLAT
  se il prezzo è tra $X e $Y..." compare con entrambi i valori nel formato
  atteso
- Nota "dati mancanti" sotto il nome asset: se visibile mostra l'icona di
  warning (SVG) e contiene "mancavano", altrimenti resta nascosta
- Orario della previsione in ora italiana nel pannello info: formato
  `HH:MM` (calcolato dinamicamente lato client, non un valore fisso)
- Prezzo di riferimento accanto al ticker: formato `$X.XX` quando presente
- Istantanea prezzo (3x/giorno): se visibile mostra orario e prezzo, ed
  eventualmente il confronto con la previsione 1g — dato reale, non un
  valore fisso
- Tabelle richiudibili (`23dc826`): "Ultimi Risultati Valutati" e "Ultimi
  Segnali Generati" partono **chiuse**, si aprono toccandone
  l'intestazione, e mostrano al massimo 6 righe con "Mostra tutto (N)" /
  "Mostra solo le recenti" (`4020d3f`); espandere una tabella non espande
  l'altra. Nota: "chiuso" è `max-height:0` + `overflow:hidden`, non
  `display:none` — per Playwright le righe restano "visible" (è il click a
  mancare il bersaglio), quindi lo stato chiuso si verifica sull'altezza
  resa, non con `toBeHidden()`
- Tendina "Info azienda" per card (`c5dd80a`): chiusa di default, mostra
  sede/fondazione/settore/borsa da `COMPANY_INFO`, e per gli asset del
  paniere trend anche i fondamentali letti da
  `data/tradingview/fundamentals.json` (`df8b040`) — o la dichiarazione
  esplicita che sono nascosti perché lo snapshot ha più di 6 mesi
  (`17802cb`) o non è raggiungibile
- Pagina **"Trend strutturali"** (ex Robotica, rietichettata con
  `1fcb9c4`): i due tab sono alternativi (Tech attiva al caricamento),
  filtro con i quattro titoli del paniere (THK, Harmonic Drive, Teradyne,
  Vertiv) una card alla volta, e per ogni card fase del ciclo, CAGR su
  1/3/5/10 anni, storico correzioni dopo fasi simili, distanza da ATH e da
  massimo 52 settimane, "Storico Letture" richiudibile — oppure la
  dichiarazione "nessuna analisi trend ancora disponibile" per un asset
  appena aggiunto, che è uno stato legittimo e non un errore di
  caricamento. Coperto anche il pannello "Come funziona questa pagina?"
  (paniere, cadenza mensile vs trimestrale per Vertiv, driver `^SOX`)

## Backlog (non ancora coperto)

- Verifica che il pulsante "🔄 Aggiorna" nell'header ricarichi la pagina
- Contenuto del manifest.json (nome, icone, `display: standalone`)
- Un secondo browser tab/reload non duplica i chart instance (memory leak)
- Filtro per orizzonte: che cambiandolo ricalcoli davvero i grafici e le
  tabelle sottostanti (oggi si verifica solo lo stato attivo dei bottoni e
  il suffisso sull'etichetta accuratezza, non il contenuto di grafici/righe)
- Range di prezzo FLAT: che i due valori $X/$Y nel messaggio siano
  numericamente coerenti con `price_at_generation` e
  `volatility_threshold_pct` del record (oggi si verifica solo il formato
  del messaggio, non i valori)
- Grafico "Prezzo vs media mobile" delle card trend: oggi si verifica il
  contenuto testuale della card, non il canvas (che dipende da
  `price_series.json` e da Chart.js)
- La baseline "classe più frequente" (`data/baseline.json`) e lo studio
  eventi CPI (`data/event_study.json`): vivono solo lato pipeline Python,
  con i loro test nel repo `Prova` (`tests/test_baseline.py`,
  `tests/test_event_study.py`) — la dashboard non li mostra ancora, quindi
  non c'è nulla da verificare da qui
