# AI Predictor / esperimento predittivo sui mercati (repo `Prova`) — test Playwright

Dashboard statica (GitHub Pages) di un agente che genera previsioni AI reali
su NVDA, MSFT, AAPL e AMD (1 giorno, 7 giorni, 1 mese), le salva in modo
immutabile e ne misura l'accuratezza nel tempo. **AMD è il quarto asset dal
2026-10-01** (volatilità quasi doppia del resto del paniere, stesso
benchmark di settore di NVDA). **Cadenza dal 2026-09-30**: solo 1g resta
giornaliero, 7g gira una volta a settimana e 1m due — quindi una cronologia
"tipica" è fatta di tante righe 1g con ogni tanto una 7g o una 1m, non di tre
righe al giorno. **Nessun backend e nessuna
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
  Teradyne, Vertiv e nVent Electric (`NVT`, aggiunto il 2026-09-18), da
  `data/robotics/<asset>/trend.jsonl`. Cadenza mensile (trimestrale solo
  per Vertiv), nessun esito futuro da valutare: non è una previsione
  puntuale, quindi non ha né accuratezza né `pending`.

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

## Un'eccezione: dati finti, dove i dati veri non bastano

Il principio sopra vale per quasi tutto. Fa eccezione ciò che dipende
dall'**età o dalla forma** dei dati, perché i dati veri cambiano ogni giorno
e il caso potrebbe non essere più raggiungibile — con un test che passerebbe
in silenzio senza verificare più niente. In quel caso si risponde noi al file
statico (`mockAssetData()`, `mockSectorSummary()` in `fixtures/prova-page.ts`,
con `fakePrediction()` per costruire le righe):

- una previsione **senza** il blocco "regime di mercato" (le generate prima
  del 2026-09-23) accanto a una **con** — `market-regime.spec.ts`;
- la sintesi del Paniere nel vecchio formato a paragrafo unico e in quello a
  due settori con o senza nota di confronto — `report-page.spec.ts`;
- una cronologia a cadenze diverse (tante 1g, una 7g, una 1m) per il filtro
  orizzonte — `horizon-filter.spec.ts`.

Nessun rischio per i dati: Prova non ha backend né scritture, e
l'intercettazione vale per il solo contesto del test. Ogni test che usa dati
finti ha comunque un gemello su dati veri che ne verifica la **forma** (es.
"se c'è il blocco regime, ha formato e intervalli plausibili"): un campo
rinominato lato Python romperebbe la pagina senza che nessun dato finto se ne
accorga. I test che usano dati finti sono stati controllati anche al
contrario: contro una copia di Prova con il difetto introdotto apposta devono
diventare rossi, altrimenti non provano niente.

## Attendere i dati prima di contare

`gotoFresh()` garantisce solo lo scheletro della pagina: i file JSONL
arrivano dopo, in modo asincrono, e per un istante una tabella ha zero righe
**e nemmeno** il messaggio di tabella vuota. Contare subito con
`rows.count()` legge uno zero che non vuol dire "nessun dato". Misurato: le
righe di NVDA compaiono circa 1,5 secondi dopo lo scheletro su una
connessione lenta. Si usa `settledRowCount()`, che aspetta uno dei due esiti
veri (almeno una riga, oppure il messaggio di tabella vuota). Il difetto
c'era già con tre asset e con quattro si aggrava, perché c'è un file in più
da scaricare.

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
- SPY non compare più nel paniere **Tech** (rimosso il 2026-09-01) — da
  `a83696d`/`cbbd155` (2026-09-18) SPY e Nasdaq (QQQ) sono reali di nuovo,
  ma solo come indici di riferimento nella pagina **Report** (sotto), mai
  nel filtro asset di Tech o nel paniere di Trend strutturali
- Banner di aggiornamento PWA nascosto di default. Il test **non contiene
  nessuna versione del service worker** (verificato: Prova passa da `v26` a
  `v28` senza che niente qui debba cambiare) e non va scritto in modo da
  contenerla: il bump a ogni modifica la renderebbe falsa subito
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
  filtro con i cinque titoli del paniere (THK, Harmonic Drive, Teradyne,
  Vertiv, nVent Electric) una card alla volta, e per ogni card fase del
  ciclo, CAGR su 1/3/5/10 anni, storico correzioni dopo fasi simili, distanza da ATH e da
  massimo 52 settimane, "Storico Letture" richiudibile — oppure la
  dichiarazione "nessuna analisi trend ancora disponibile" per un asset
  appena aggiunto, che è uno stato legittimo e non un errore di
  caricamento. Coperto anche il pannello "Come funziona questa pagina?"
  (paniere, cadenza mensile vs trimestrale per Vertiv, driver `^SOX`)
- Pagina **"Report"** (`a83696d`, 2026-09-18): terzo tab, alternativo agli
  altri due. Toggle "Paniere"/"S&P 500"/"Nasdaq" (`Paniere` attivo di
  default), un blocco alla volta:
  - **Paniere**: sintesi mensile a livello di paniere (`c97a487`) che
    confronta i 5 titoli di Trend strutturali tra loro (nVent Electric
    incluso da quando è nel paniere) — badge di direzione (RIALZISTA/
    RIBASSISTA/LATERALE), narrativa **divisa per settore** dal `3c1403e`
    (2026-09-18: `ROBOTICS_SECTOR` in `src/config.py` — "Robotica /
    meccanica di precisione" e "Infrastruttura elettrica per data center
    AI", due temi distinti dentro lo stesso paniere), più un'eventuale
    nota di confronto fra i due, elenco dei titoli su cui si basa — o la
    dichiarazione che non è ancora stata generata
  - **S&P 500 / Nasdaq**: stessa identica lettura di ciclo delle card di
    Trend strutturali (stesso motore, `renderRoboticsAssetCard()` riusata
    com'è), MA senza la tendina "Info azienda" (un indice non ha
    fondamentali/sede) — coperta anche la stessa regressione Chart.js-CDN-
    bloccato di Trend strutturali (`f97653f`), perché passa dallo stesso
    codice
  - Pannello "Come funziona questa pagina?" proprio, distinto da quello di
    Trend strutturali
- **Quarto asset Tech, AMD** (`561233a`): quattro bottoni nel filtro nell'ordine
  NVDA/MSFT/AAPL/AMD, quattro card, la sua tendina "Info azienda" coi dati
  statici verificati (nome, sede, 1969, settore) senza il copia-incolla di
  NVDA, e lo stato di un asset **appena aggiunto**: previsioni ma nessun esito
  valutato (gli orizzonti non sono scaduti) e nessuna istantanea prezzo — la
  card deve caricarsi comunque, con "Nessuna valutazione ancora."
- Pannello info Tech: dichiara la **cadenza** per orizzonte (1g ogni giorno di
  borsa, 7g 1 volta a settimana, 1m 2 volte a settimana) e **non** promette più
  tutti e tre ogni giorno; dice quale benchmark di settore usa quale asset
  (SMH per NVDA/AMD, XLK per MSFT/AAPL)
- Blocco **"regime di mercato"** nel dettaglio previsione (dal 2026-09-23):
  rendimenti SPY/QQQ a 1/5/20 giorni, VIX con percentile, modalità
  (risk-on/neutro/risk-off). Presente solo sulle previsioni recenti: le vecchie
  non si rompono e non lasciano righe vuote (`<br><br>`), anche dietro "Mostra
  tutto"; un regime parziale (senza VIX, o senza SPY/QQQ) non stampa
  "undefined". Su dati veri: formato e intervalli plausibili (percentile 0-100)
- Sintesi del **Paniere**, ridisegnata: un titolo e un paragrafo per settore,
  la nota di confronto in fondo (opzionale: senza, nessun paragrafo vuoto), il
  ripiego sul vecchio formato a paragrafo unico, e l'elenco dei titoli con
  `NVT` mostrato come "nVent Electric"
- Filtro orizzonte sul **contenuto** della tabella con la cronologia a
  cadenze diverse (una sola 7g fra molte 1g) e con un orizzonte senza righe
- Riga "Probabilità: UP/DOWN/FLAT" nel dettaglio previsione (`3a962b3`,
  2026-09-18): quando presente (assente sulle previsioni salvate prima di
  quella modifica), formato e plausibilità (0-100%, le tre percentuali
  sommano a ~100) — mai un valore fisso

## Comportamento noto dell'app (non un difetto dei test)

Un asset appena aggiunto non ha ancora esiti valutati, quindi nemmeno
`data/<asset>/outcomes.jsonl`. `parseJsonl()` in `index.html` tratta **ogni**
risposta non ok come `ok:false`, un 404 compreso, e la tabella "Ultimi
Risultati Valutati" scrive "Dati non raggiungibili al momento. Riprova più
tardi." — un messaggio di errore per quella che è un'assenza normale. Visto su
AMD il 2026-10-01 (file 404, card in produzione col messaggio d'errore).

I test non lo irrigidiscono né lo mascherano: `outcomesFileMissing()` chiede il
file direttamente. 404 → il test si salta dichiarando il motivo; il file c'è ma
la pagina non lo legge → è un'interruzione vera e il test **fallisce**. Il caso
si esaurisce da solo quando la pipeline crea il primo esito. Lato app la
correzione sarebbe distinguere il 404 (`ok:true, data:[]`) dagli altri errori.

## Backlog (non ancora coperto)

- Verifica che il pulsante "🔄 Aggiorna" nell'header ricarichi la pagina
- Contenuto del manifest.json (nome, icone, `display: standalone`)
- Un secondo browser tab/reload non duplica i chart instance (memory leak)
- Filtro per orizzonte: che cambiandolo ricalcoli davvero i **grafici** (le
  tabelle sono coperte, con dati finti; il suffisso sull'etichetta
  accuratezza anche — restano fuori solo i grafici)
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
