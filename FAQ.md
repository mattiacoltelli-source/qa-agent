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
| `npm run stress:cinefighi -- --counts=3000,8000` | Stress test manuale di CineFighi a conteggi assoluti scelti a mano (lo Scale Agent automatico usa sempre "titoli reali + extra", extra scelto al lancio del workflow) |

## Il workflow non parte da solo, vero?

Lanciati singolarmente (QA Agent, Performance Agent, API Doctor Agent,
Scale Agent, Security Agent), corretto, di proposito: non ci sono run
automatici né ad ogni push. L'unico modo è il bottone "Run workflow" —
così hai sempre il controllo di quando i test girano, specialmente quelli
`@write`.

Due eccezioni, entrambe schedulate:
- Data Health Agent gira anche da solo ogni 6 giorni, di notte — vedi la
  domanda sotto per il perché.
- "Controllo Completo" (i sei agenti insieme) gira anche da solo una
  volta a settimana, il lunedì alle 6 UTC — vedi la domanda su "Controllo
  Completo" più sotto.

Entrambi, se trovano un problema vero (FAIL, non un semplice WARN), mandano
un avviso su Telegram — vedi "Come funziona la notifica Telegram?".

## C'è anche un "Data Health Agent": come si usa e cosa fa?

È un secondo workflow, separato da "QA Agent", che non testa il
comportamento delle app ma controlla che siano raggiungibili e che i dati
su Supabase siano integri (righe orfane, duplicati). Si lancia allo stesso
modo (tab Actions → "Run workflow"). Dettagli: **[health/README.md](health/README.md)**.

In più, questo agente gira anche **da solo ogni 6 giorni alle 3 UTC** (le 4
del mattino ora italiana d'inverno, le 5 in ora legale): CineFighi e
CineTracker usano Supabase free tier, che mette in pausa un progetto dopo
7 giorni senza richieste API. Se non apri quelle app per una settimana
(es. in vacanza), Supabase si sospenderebbe da solo — questo giro
automatico, essendo a sola lettura ma con vere query sul database, evita
che succeda senza dover ricordarti di aprire l'app. Se questo giro trova un
FAIL vero, arriva anche un avviso su Telegram (vedi sotto) — altrimenti,
come per un run manuale, l'esito resta comunque nella tab Actions.

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

## E uno "Scale Agent"?

Quinto workflow, solo CineFighi: legge quanti titoli ci sono davvero ora
nella libreria condivisa (sola lettura) e testa il client con quel numero
**+ un extra** di titoli finti mockati — mai scritti sul database vero —
per vedere se Home, Libreria e Statistiche reggono quando la libreria
cresce. L'extra è **1000 di default**, ma lo scegli tu al lancio (campo
"Extra di titoli" quando premi "Run workflow" — puoi mettere anche
15000). Incluso anche in "Controllo Completo" (sotto), sempre con
l'extra di default. Dettagli: **[scale/README.md](scale/README.md)**.

## E un "Security Agent"?

Sesto workflow, non lega a nessuna delle tre app: controlla le
**dipendenze npm di qa-agent stesso** (`npm audit`) — le tre app non hanno
un `package.json` proprio, quindi non c'è nulla da controllare lì con
questo metodo. FAIL su vulnerabilità high/critical, WARN su moderate.
Conta comunque: `qa-agent` gira in CI con accesso a segreti reali (chiave
Anthropic, token Telegram, push su GitHub). Incluso anche in "Controllo
Completo" (sotto). Dettagli: **[security/README.md](security/README.md)**.

## Voglio lanciare tutti gli agenti insieme, senza premere sei bottoni

Settimo workflow, **"Controllo Completo"**: lancia QA Agent, Data Health
Agent, Performance Agent, API Doctor Agent, Scale Agent e Security Agent
in sequenza (mai in parallelo) sulla stessa scelta di app (Scale Agent e
Security Agent girano comunque, non dipendono dalla scelta), con un solo
"Run workflow". I sei riepiloghi compaiono impilati sulla stessa pagina
di run — niente da unire a mano. I workflow restano comunque lanciabili
anche singolarmente come prima, questo è solo una scorciatoia.

Gira anche **da solo una volta a settimana** (lunedì alle 6 UTC, tutte e
tre le app): non serve ricordarsi di lanciarlo a mano. Se, in un run
schedulato, almeno uno dei sei agenti trova un FAIL vero, arriva un
avviso su Telegram — vedi la domanda successiva.

## Come funziona la notifica Telegram?

"Controllo Completo" e Data Health Agent (i due workflow schedulati) hanno
un job `notify` finale: manda un messaggio su Telegram **solo se c'è un FAIL
vero** (mai per un semplice WARN, e mai quando va tutto bene — niente
notifica quando non serve). Il messaggio include quale app e un link diretto
al run.

Serve impostare due secret nel repo (Settings → Secrets and variables →
Actions): `TELEGRAM_BOT_TOKEN` (creato parlando con
[@BotFather](https://t.me/BotFather) su Telegram) e `TELEGRAM_CHAT_ID` (il
tuo ID chat con quel bot). Finché questi due secret non sono impostati, il
job li trova vuoti e salta l'invio senza far fallire il run — l'assenza
della notifica non è quindi, di per sé, garanzia che sia tutto a posto:
finché non li configuri, resta comunque da controllare la tab Actions.

## Cos'è l'AI Incident Analyzer nel messaggio Telegram?

Solo nel job `notify` di "Controllo Completo" (non in Data Health Agent da
solo): prima di mandare la notifica, uno script (`incident/analyze.mjs`)
legge i **sei report insieme** e chiede a Claude di correlarli — non
di ripetere quello che ogni agente ha già detto per conto suo. Se, per
esempio, QA fallisce e API Doctor segnala la stessa API in errore ma Data
Health è pulito, la diagnosi indica l'API come causa probabile, non il
database. Il risultato (causa probabile, gravità, cosa controllare) finisce
in coda al messaggio Telegram. Dettagli: **[incident/README.md](incident/README.md)**.

Stesso principio degli altri `analyze.mjs`: zero chiamate se, nonostante
tutto, risulta tutto PASS; nessun errore qui blocca l'invio della
notifica — è un arricchimento, non un requisito.

## Qualcosa non torna, un test si comporta in modo strano

Prima di tutto: nessuna di queste operazioni tocca mai le app CineFighi,
CineTracker o Spot in produzione — questo repo è solo un osservatore, può
al più scrivere dati di test (sempre riconoscibili e sempre ripuliti). Se un
run si comporta in modo imprevisto, il modo più sicuro per indagare è
guardare la trace del test interessato (vedi sopra) prima di modificare
qualsiasi cosa.
