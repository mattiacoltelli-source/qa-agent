# Scale Agent

Quarto modulo indipendente nello stesso repository, insieme a QA Agent,
Data Health Agent e Performance/API Doctor Agent. Non misura le prestazioni
di rete reali (quello è compito del Performance Agent, con Lighthouse) ma
la **tenuta del rendering client-side** di CineFighi quando la libreria
condivisa cresce — l'unico rischio che gli altri tre non coprono, perché
oggi la libreria reale è nell'ordine delle centinaia di titoli e nessuno degli altri
controlli la mette mai sotto stress.

**Uso quotidiano**: tab **Actions** → workflow **"Scale Agent"** →
**"Run workflow"**. Vedi [../FAQ.md](../FAQ.md) per la guida generale al
repository.

## Come funziona

Solo CineFighi: è l'unica delle tre app con una libreria condivisa che può
crescere in modo imprevedibile (CineTracker è single-user, Spot non ha
backend).

1. Legge quanti titoli ci sono **davvero ora** nella libreria condivisa
   (una sola richiesta di sola lettura a Supabase, stessa chiave
   "publishable" già usata da Data Health — nessuna riga scritta o
   cancellata).
2. Lancia un Chromium headless (lo stesso già installato per QA Agent e
   Performance Agent) su una pagina fresca dell'app reale, e intercetta le
   risposte Supabase (`rest/v1/titles|votes|users`) restituendo **titoli
   reali + un extra** (di default 1000, scelto al lancio — vedi sotto)
   titoli finti generati al volo (generi/voti vari) — mai scritti sul
   database vero, tutto renderizzato nel browser dallo stesso `app.js`/
   `ui.js` di produzione. Stessa logica di `scripts/stress-cinefighi.mjs`
   (uso manuale, a conteggi assoluti scelti a mano), condivisa in
   `scale/lib/cinefighi-scale.mjs`.
3. Misura tre tempi: apertura Home, apertura Libreria ("Vedi tutto", prima
   pagina), apertura Statistiche — più il numero di righe caricate prima e
   dopo alcuni scroll nella Libreria.
4. Confronta ciascun tempo con le soglie in `scale/thresholds.mjs`.

Perché "reali + extra" e non un numero fisso: così il test resta rilevante
anche se la libreria reale cresce nel tempo — misura sempre "quanto
margine c'è oltre lo stato attuale", non un singolo scenario che diventa
via via meno rappresentativo.

## Scegliere l'extra al lancio

Da GitHub Actions, il campo **"Extra di titoli finti da aggiungere a
quelli reali"** accetta qualunque intero positivo (default `1000` se
lasciato vuoto) — per un test più aggressivo basta mettere, ad esempio,
`15000`. Le soglie sotto restano comunque tarate sull'uso tipico (~1000):
un extra molto più grande può far scattare legittimamente un WARN/FAIL su
"Statistiche" senza che sia una regressione reale, solo un test a una
scala diversa.

## Soglie

Tarate il 27/08/2026 sui run manuali dello stesso test a scale vicine
(N=1500: Home 1276ms, Libreria 70ms, Statistiche 297ms) — ogni soglia resta
ben sopra i valori osservati, non al filo. Statistiche cresce linearmente
col numero di titoli (ricalcola le medie su tutta la libreria ad ogni
apertura), le altre due restano piatte grazie a paginazione/slice — è
normale che Statistiche sia la più vicina alla soglia WARN quando la
libreria reale sarà cresciuta molto, o quando si sceglie un extra grande.

## Risultato

- **PASS**: tutti e tre i tempi sotto soglia WARN.
- **WARN**: almeno un tempo sopra WARN ma sotto FAIL.
- **FAIL**: almeno un tempo sopra FAIL, oppure il browser non è riuscito a
  completare la sequenza (es. selettore DOM cambiato).

## AI: solo quando serve

Claude viene chiamato **solo** se il run è in WARN/FAIL, mai su un run
PASS. Riceve i tempi e le soglie già confrontate (mai ricalcolati da
Claude) e li traduce in una spiegazione breve, una priorità, e un primo
intervento concreto da provare.

## Credenziali

Nessuna nuova. Stessa chiave "publishable"/anon già hardcoded nei bundle JS
dell'app e già riusata da Data Health Agent — sola lettura, nessuna
scrittura da nessuna parte. Unico secret riusato: `ANTHROPIC_API_KEY` (già
configurato per gli altri moduli).
