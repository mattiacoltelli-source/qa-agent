# AI Incident Analyzer

Settimo modulo, diverso dagli altri sei per un motivo preciso: QA
Agent, Data Health Agent, Performance Agent, API Doctor Agent, Scale
Agent e Security Agent hanno ciascuno il proprio `analyze.mjs`, ma
ognuno interpreta **solo i propri dati**. Questo modulo legge i **sei
report insieme** e cerca una correlazione tra loro — qualcosa che
nessuno dei sei agenti, da solo, può vedere.

Esempio concreto: QA Agent fallisce con un errore HTTP 500 sul salvataggio
di un voto, API Doctor segnala un tasso di errore alto sulla stessa API,
ma Data Health è PASS su quella stessa app. Da solo, ognuno di questi tre
segnali è ambiguo. Messi insieme: il problema è probabilmente nell'API,
non nel database — anche se il sintomo iniziale (il test QA fallito)
sembrava un problema dell'app. Scale Agent (solo CineFighi) e Security
Agent (solo le dipendenze npm di qa-agent, non un'app) sono invece
segnali a sé: un loro FAIL riguarda rispettivamente la tenuta del
rendering client-side a scala e una vulnerabilità nella toolchain CI —
non la rete o i dati delle app monitorate — il prompt lo sa e non li
correla agli altri a meno che i dati non lo suggeriscano davvero.

**Non è raggiungibile da solo**: gira come step del job `notify` di
`full-check.yml`, dopo tutti e sei gli agenti e prima dell'invio della
notifica Telegram — vedi quel workflow per come vengono scaricati i
sei report (ogni agente li carica come artifact separato, in job
diversi).

## Cosa riceve

Lo stato di tutte le app per tutti e sei gli agenti in questo run
(Scale Agent solo per CineFighi, Security Agent non è per-app) — **non
solo quelle fallite**: un "PASS" è un segnale utile quanto un "FAIL",
perché aiuta a escludere delle cause. Per le app PASS non viene inviato
altro dettaglio (tiene il prompt compatto); per le app non-PASS, un
riassunto compatto della cosa (errori QA troncati a 300 caratteri, issue
di Data Health, punteggi di Performance, check falliti di API Doctor,
check di scala falliti, vulnerabilità npm) — mai il JSON grezzo per
intero.

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
nonostante tutto, tutti e sei i report risultano PASS (può succedere
con `test_notify`, che forza comunque l'invio della notifica). Nessun
errore qui blocca l'invio della notifica Telegram sottostante — l'analisi
AI è un arricchimento, mai un requisito.

## Credenziali

Stesso secret `ANTHROPIC_API_KEY` già usato dagli altri cinque `analyze.mjs`
(già configurato, nessun permesso più ampio).
