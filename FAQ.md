# FAQ — come usare il QA Agent

Pensata per essere letta senza un assistente AI a fianco: se un giorno ti
ritrovi qui e non ricordi come funziona qualcosa, parti da questa pagina.

## Come lancio i test?

Su GitHub: repo `qa-agent` → tab **Actions** → workflow **"QA Agent — smoke
tests"** → bottone **"Run workflow"** in alto a destra. Si apre un piccolo
modulo con due scelte:

- **Quale app testare**: tutte / CineFighi / CineTracker / Spot.
- **Esegui anche i test @write**: casella da lasciare **deselezionata** per
  un giro normale (vedi sotto per cosa fa quando è attiva).

Conferma con "Run workflow" e il run parte — funziona anche da telefono,
non serve nulla installato.

## Dove trovo l'esito?

Apri il run appena lanciato (compare in cima alla lista). In cima alla
pagina trovi un riepilogo leggibile — quanti test passano/falliscono per
ogni app, e per ogni fallimento il messaggio d'errore, la durata e su quale
progetto (mobile/desktop). Nessun download necessario.

Se un test è fallito e vuoi vedere uno screenshot o il video della sessione:
in fondo alla pagina del run trovi due allegati scaricabili — apri
**`playwright-report`** (va estratto e aperto con `npx playwright
show-report` su un computer con Node installato) per i dettagli visivi.

## Posso testare una sola app invece di tutte e tre?

Sì — è proprio la prima scelta nel modulo "Run workflow" (vedi sopra).
Lanciare una sola app è più veloce (circa 1 minuto contro i 3-4 di tutte e
tre insieme).

## Cosa sono i test "@write"? Sono sicuri?

Sono test che scrivono davvero sui dati reali (aggiungono un titolo, un
voto, ecc.), a differenza di quelli normali che guardano soltanto. Restano
**disattivati di default** — vanno accesi esplicitamente con la casella nel
modulo di lancio — perché toccano:

- **CineFighi**: il database condiviso da tutto il gruppo di amici.
- **CineTracker**: la tua libreria film/serie personale vera.

Ogni test di scrittura ripulisce da solo quello che aggiunge, e in più c'è
una rete di sicurezza automatica (`scripts/cleanup-write-residue.mjs`) che
gira a fine di **ogni** run e ripulisce eventuali residui rimasti se un test
si fosse interrotto a metà (crash del browser, ecc.) — verificata più volte
contro dati reali. Dettagli completi: `apps/cinefighi/README.md` e
`apps/cinetracker/README.md`.

## Chi è "_QA_Agent_"? Perché a volte lo vedo nella lista di CineFighi e a volte no?

È l'utente di test dedicato a CineFighi. Non è più un account permanente:
viene **creato prima** di ogni run che tocca CineFighi e **cancellato alla
fine** dello stesso run — quindi se apri l'app CineFighi mentre un test
sta girando potresti vederlo per qualche secondo/minuto, ma a run finito
sparisce di nuovo. Se lo vedi rimasto lì a lungo dopo un run concluso,
qualcosa è andato storto nel cleanup — puoi cancellarlo a mano dall'app
(icona del cestino accanto al nome) senza problemi, si ricrea da solo al
prossimo test.

## Un test è fallito — è un bug della mia app o un bug nel test?

Guarda il messaggio d'errore nel riepilogo:

- Se parla di un **selettore che non trova un elemento**, un **timeout**, o
  un **testo ambiguo** ("resolved to N elements") — è quasi sempre un bug
  nel *test* (un selettore da aggiustare), non nell'app. È il tipo di
  problema più comune, capitato spesso durante lo sviluppo di questa suite.
- Se il messaggio descrive un comportamento che **non corrisponde a quello
  che l'app dovrebbe fare davvero** (es. un dato sbagliato mostrato
  all'utente, un bottone che non fa nulla) — allora è un bug vero
  nell'app, e vale la pena approfondire con lo screenshot/trace di quel
  test.

Nel dubbio, apri la trace del test fallito (`playwright-report` in fondo
alla pagina del run) — mostra passo per passo cosa ha visto il browser.

## Posso lanciare i test anche dal mio computer, non solo da GitHub?

Sì, se hai Node.js installato:

```bash
git clone https://github.com/mattiacoltelli-source/qa-agent
cd qa-agent
npm install
npx playwright install --with-deps chromium

npm test                  # tutta la suite, sola lettura
npm run test:cinefighi    # solo una app
npm run test:write        # ANCHE i test di scrittura — leggi prima i README delle app
npm run report             # apre l'ultimo report HTML
```

Ma per l'uso normale non ne hai bisogno: il bottone su GitHub basta.

## Altri comandi utili (per chi tocca il codice del repo)

| Comando | Cosa fa |
|---|---|
| `npm run cleanup:write-residue` | Lancia a mano la pulizia dei residui (normalmente gira da sola a fine run) |
| `npm run setup:cinefighi-qa-user` | Crea a mano l'utente `_QA_Agent_` (normalmente gira da solo a inizio run) |
| `npm run summary` | Rigenera il riepilogo leggibile da un `reports/results.json` già presente |

## Il workflow non parte da solo, vero?

Corretto, di proposito: non ci sono run automatici (né ad ogni push, né
schedulati). L'unico modo per lanciarlo è il bottone "Run workflow" — così
hai sempre il controllo di quando i test girano, specialmente quelli
`@write`.

## C'è anche un "Data Health Agent": come si usa e cosa fa?

È un secondo workflow, separato da "QA Agent", che non testa il
comportamento delle app ma controlla che siano raggiungibili e che i dati
su Supabase siano integri (righe orfane, duplicati). Si lancia allo stesso
modo (tab Actions → "Run workflow"). Dettagli: **[health/README.md](health/README.md)**.

Non lanciarlo insieme a un run "QA Agent" con i test `@write` attivi:
potrebbe leggere dati a metà scrittura e segnalarli come un'anomalia che
in realtà non lo è. Aspetta che l'altro run sia finito.

## E un "Performance Agent"?

Terzo workflow: punteggi Lighthouse (performance, accessibilità, best
practices, SEO) sulle tre app, incluso Spot. Le soglie di partenza sono
volutamente permissive (si stringono più avanti, dopo aver visto i
punteggi reali). Dettagli: **[perf/README.md](perf/README.md)**.

## E un "API Doctor Agent"?

Quarto workflow: controlla, per ognuna delle tre app, che le API esterne da
cui dipende davvero (TMDB per CineFighi/CineTracker — chiavi diverse tra le
due app —, meteo/mare/alba-tramonto per Spot) rispondano, e nella forma
attesa. Non c'è stato WARN: un endpoint o risponde correttamente o è FAIL.
Dettagli: **[api-doctor/README.md](api-doctor/README.md)**.

## Voglio lanciare tutti gli agenti insieme, senza premere quattro bottoni

Quinto workflow, **"Controllo Completo"**: lancia QA Agent, Data Health
Agent, Performance Agent e API Doctor Agent in sequenza (mai in parallelo)
sulla stessa scelta di app, con un solo "Run workflow". I quattro riepiloghi
compaiono impilati sulla stessa pagina di run — niente da unire a mano. I
workflow restano comunque lanciabili anche singolarmente come prima, questo
è solo una scorciatoia.

## Qualcosa non torna, un test si comporta in modo strano

Prima di tutto: nessuna di queste operazioni tocca mai le app CineFighi,
CineTracker o Spot in produzione — questo repo è solo un osservatore, può
al più scrivere dati di test (sempre riconoscibili e sempre ripuliti). Se un
run si comporta in modo imprevisto, il modo più sicuro per indagare è
guardare la trace del test interessato (vedi sopra) prima di modificare
qualsiasi cosa.
