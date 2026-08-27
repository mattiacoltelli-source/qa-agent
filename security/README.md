# Security Agent

Sesto modulo indipendente nello stesso repository, insieme a QA Agent,
Data Health Agent, Performance Agent, API Doctor Agent e Scale Agent.
Controlla le **dipendenze npm di `qa-agent` stesso** (`npm audit`) — non
delle tre app web (CineFighi, CineTracker, Spot), che non hanno un
`package.json` proprio: vendorizzano gli SDK come file JS già pronti (es.
`supabase-sdk.js`), senza un numero di versione affidabile da leggere per
un controllo di vulnerabilità sensato.

Perché le dipendenze di questo tool contano comunque: `qa-agent` gira in
CI con accesso a `ANTHROPIC_API_KEY`, ai secret Telegram e a push su
GitHub — una dipendenza compromessa qui è un rischio reale, diverso da una
libreria vendorizzata in un'app statica senza segreti.

**Uso quotidiano**: tab **Actions** → workflow **"Security Agent"** →
**"Run workflow"**. Vedi [../FAQ.md](../FAQ.md) per la guida generale al
repository.

## Come funziona

1. Lancia `npm audit --json` nella root del repository.
2. Estrae, per ogni vulnerabilità trovata: pacchetto, severity, se è una
   dipendenza diretta o transitiva, se un fix automatico è già disponibile
   (`npm audit fix`), e gli advisory (titolo/URL) quando `npm audit` li
   fornisce.
3. Confronta i conteggi per severity con le soglie in
   `security/thresholds.mjs`.

## Soglie

A differenza di Performance/Scale Agent, qui non c'è nulla da tarare sui
dati osservati: `npm audit` classifica già ogni vulnerabilità in una
scala fissa a 5 livelli (critical/high/moderate/low/info). La scelta è
solo su quale livello far scattare cosa — vedi
`security/thresholds.mjs` per il perché di ogni soglia.

## Risultato

- **PASS**: nessuna vulnerabilità high/critical/moderate (low/info non
  contano: troppo comuni e spesso non sfruttabili in uno script CLI
  locale, non un server esposto).
- **WARN**: almeno una vulnerabilità moderate.
- **FAIL**: almeno una vulnerabilità high o critical, oppure `npm audit`
  non è riuscito a produrre un output valido.

## AI: solo quando serve

Claude viene chiamato **solo** se il run è in WARN/FAIL, mai su un run
PASS. Riceve l'elenco delle vulnerabilità già estratte da `npm audit`
(mai inventate o ricalcolate) e le traduce in una spiegazione breve, una
priorità, e il primo intervento concreto — tipicamente `npm audit fix`
quando un fix automatico è già disponibile.

## Storico

`security/history.mjs` gira dopo `analyze.mjs` e prima del riepilogo:
confronta i conteggi di oggi con l'ultimo run registrato. Non usa una
percentuale (i conteggi sono quasi sempre vicini allo zero, dove 0→1 è
"+Infinity%" e non dice niente) — segnala semplicemente se critical o high
sono aumentati rispetto all'ultima volta. Ogni run accoda una riga
compatta a `history/data/security.jsonl` (committata direttamente nel repo
dal workflow — vedi `history/lib/record.mjs` per il meccanismo condiviso a
tutti e quattro gli agenti che ne dispongono). Nessun database: solo un
file JSONL in Git, letto/scritto in modo arithmetic-only (nessuna IA
coinvolta). Non fa mai fallire il run.

## Credenziali

Nessuna nuova. `npm audit` legge solo `package-lock.json` e interroga il
registro pubblico npm — nessun accesso a segreti, nessuna scrittura da
nessuna parte. Unico secret riusato: `ANTHROPIC_API_KEY` (già configurato
per gli altri moduli).
