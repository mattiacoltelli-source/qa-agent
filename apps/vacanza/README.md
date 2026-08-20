# Spot / Ionio in barca a vela (repo `Spot`) — test Playwright

App di viaggio senza login e **senza alcun backend**: tutto lo stato
(preferiti, itinerario del giorno, spot visitati, cache meteo, modalità
sail/travel) vive in `localStorage`, per dispositivo. Tre API esterne live:
`api.open-meteo.com` (meteo), `marine-api.open-meteo.com` (mare, opzionale),
`api.sunrise-sunset.org` (alba/tramonto).

## Modello di sicurezza dei dati

Qui **non esiste il rischio "dati reali condivisi"** delle altre due app:
non c'è un database dietro, quindi nessun test è taggato `@write` — girano
tutti sempre. L'isolamento è garantito da `gotoFresh()` (clear localStorage
+ reload prima di ogni test) e dal fatto che ogni test Playwright parte
comunque da un browser context nuovo.

## Meteo: sempre mockato

Le 3 API meteo determinano ranking, headline e punteggi Sail Mode — se
lasciate live, gli stessi test darebbero esiti diversi ogni giorno. Tutti i
test che dipendono da meteo/luce/vento passano da
`fixtures/weather-mock.ts::mockWeatherApis()` con uno dei profili fissi
(`WEATHER_PROFILES.clear/rainy/windy`, scelti per attraversare le soglie
reali nel codice, non numeri a caso). `mockWeatherOutage()` simula invece
le 3 API giù, per verificare il degrado grazioso (nessun crash, nessun dato
inventato).

Il mock va installato **prima** di `gotoFresh()`, non dopo: `page.route()`
deve essere attivo già al primo caricamento.

## Geolocalizzazione

`fixtures/vacanza-page.ts::grantGeolocation(context, lat, lon)` concede il
permesso e fissa una posizione nota prima della navigazione. Se un test non
la chiama, `navigator.geolocation.getCurrentPosition()` fallisce (permesso
negato) — usato deliberatamente per testare il fallback "GPS non
disponibile" (comportamento PREVISTO, non un bug).

## Variabili d'ambiente

| Variabile | Default |
|---|---|
| `VACANZA_BASE_URL` | `https://mattiacoltelli-source.github.io/Spot/` |

## Cosa copre questa prima fase

- Pannello meteo (3 profili + interruzione API) su Home
- Sail Mode / Travel Mode: cambio filtri, statistiche, persistenza
- "Cosa vedo ora": con GPS, senza GPS (fallback), cambio finestra temporale
- "Pianifica itinerario": 5 slot senza duplicati, persistenza, svuotamento
- Preferiti (filtro "Solo preferiti", persistenza) e visitati (badge in lista)

## Backlog (dalla proposta originale, non ancora implementato)

- Ricerca smart (`smartSearchMatch`) su più campi
- Filtri combinati zona+attività+livello+luce nella pagina Spot
- Marker mappa colorati per stato/livello e apertura dettaglio da mappa
- Punteggio Sail Mode (`sail.js::scoreSpot`) con vento/onde/direzione mockati nel dettaglio
- Countdown tramonto e logica "periodo del giorno" (richiede mockare anche `Date`, non solo le API)
