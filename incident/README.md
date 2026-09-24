# AI Incident Analyzer

Sesto modulo, diverso dagli altri cinque per un motivo preciso: QA
Agent, Data Health Agent, Performance Agent, API Doctor Agent e Security
Agent hanno ciascuno il proprio `analyze.mjs`, ma ognuno interpreta
**solo i propri dati**. Questo modulo legge i **cinque report insieme**
e cerca una correlazione tra loro — qualcosa che nessuno dei cinque
agenti, da solo, può vedere.

Esempio concreto: QA Agent fallisce con un errore HTTP 500 sul salvataggio
di un voto, API Doctor segnala un tasso di errore alto sulla stessa API,
ma Data Health è PASS su quella stessa app. Da solo, ognuno di questi tre
segnali è ambiguo. Messi insieme: il problema è probabilmente nell'API,
non nel database — anche se il sintomo iniziale (il test QA fallito)
sembrava un problema dell'app. Security Agent (solo le dipendenze npm di
qa-agent, non un'app) è invece un segnale a sé: un suo FAIL riguarda una
vulnerabilità nella toolchain CI — non la rete o i dati delle app
monitorate — il prompt lo sa e non lo correla agli altri.

**Non è raggiungibile da solo**: gira come step del job `notify` di
`full-check.yml`, dopo tutti e cinque gli agenti e prima dell'invio della
notifica Telegram — vedi quel workflow per come vengono scaricati i
cinque report (ogni agente li carica come artifact separato, in job
diversi).

## Cosa riceve

Lo stato di tutte le app per tutti e cinque gli agenti in questo run
(Security Agent non è per-app) — **non solo quelle fallite**: un "PASS"
è un segnale utile quanto un "FAIL", perché aiuta a escludere delle
cause. Per le app PASS non viene inviato altro dettaglio (tiene il
prompt compatto); per le app non-PASS, un riassunto compatto della cosa
(errori QA troncati a 300 caratteri, issue di Data Health, punteggi di
Performance, check falliti di API Doctor, vulnerabilità npm) — mai il
JSON grezzo per intero.

Riceve anche, quando presente, un campo `trends`: i confronti col run
PRECEDENTE già calcolati da `perf/history.mjs` e `security/history.mjs`
(stessi file `reports/*-trend.json` letti da `write-summary.mjs` per il
riepilogo leggibile del singolo agente — qui arrivano nello stesso
artifact dei risultati, vedi il commento nei rispettivi workflow). Solo
le voci con qualcosa di notabile (un calo Lighthouse, vulnerabilità
critical/high aumentate) — se `trends` manca del tutto, non vuol dire
"tutto stabile da sempre", solo che nessuno dei due non ha avuto un
calo/peggioramento sopra soglia rispetto all'ultima volta. Serve a
distinguere un problema isolato di oggi da un peggioramento già in corso
da più run — QA Agent, Data Health e API Doctor non hanno un equivalente
oggi (nessuno storico proprio).

## Cosa produce

- `reports/incident-analysis.json`: l'analisi strutturata completa
  (summary, severity, causa probabile, cosa controllare, confidence).
- `reports/incident-summary.txt`: 4-5 righe di testo semplice, già
  escapate per HTML, pronte da accodare al messaggio Telegram esistente.

Se la confidence della diagnosi è bassa, è voluto: il prompt chiede
esplicitamente di dirlo onestamente invece di inventare una causa
plausibile ma non supportata dai dati disponibili.

## AI: solo quando serve

Stesso principio degli altri `analyze.mjs`: zero chiamate a Claude se,
nonostante tutto, tutti e cinque i report risultano PASS (può succedere
con `test_notify`, che forza comunque l'invio della notifica). Nessun
errore qui blocca l'invio della notifica Telegram sottostante — l'analisi
AI è un arricchimento, mai un requisito.

## Credenziali

Stesso secret `ANTHROPIC_API_KEY` già usato dagli altri quattro `analyze.mjs`
(già configurato, nessun permesso più ampio).
