---
name: sicurezza-dati
description: Checklist di sicurezza da attraversare esplicitamente PRIMA di qualunque operazione che tocchi i dati reali di CineFighi, CineTracker o Spot — sia lettura (script/test contro il vero Supabase) sia scrittura. CineFighi in particolare è il database condiviso di un gruppo reale di ~15 amici, non un ambiente di test. Usa questo Skill prima di lanciare qualunque script/test che parli col vero backend di una di queste app, o prima di dire all'utente che una modifica è "sicura".
---

# Sicurezza dei dati reali — CineFighi / CineTracker / Spot

Prima di eseguire QUALUNQUE cosa che parli col vero Supabase di una di
queste app (uno script one-off, un test Playwright non mockato, una
verifica manuale), rispondi esplicitamente — a te stesso, o nella
risposta all'utente se la situazione è ambigua — a queste domande. Non è
una formalità: è il controllo che, se saltato per fretta, può scrivere o
cancellare qualcosa nei dati di persone reali.

## Le tre app hanno modelli di dati diversi

- **CineFighi**: Supabase **condiviso da un gruppo reale** (~15 amici,
  vedi `CLAUDE.md` del repo). Non esiste un ambiente di test separato:
  ogni scrittura, se non pulita, resta visibile a tutti per sempre.
- **CineTracker (repo Cos90)**: Supabase **personale, single-user**
  reale — stesso principio, un solo proprietario invece di un gruppo, ma
  è comunque il suo account vero, non un sandbox.
- **Spot (repo Vacanza)**: nessun backend, solo `localStorage` — nessuna
  di queste regole si applica, il rischio non esiste.

## Le domande obbligatorie

1. **Quale app, e quindi quale modello di dati** (vedi sopra)?
2. **Sola lettura o scrittura?**
   - Sola lettura (es. leggere conteggi/voti per un mockup o una
     verifica) → sicura sempre, nessuna pulizia richiesta. Preferiscila
     ogni volta che è sufficiente (vedi lo Skill **verifica-locale** per
     come usarla per verificare comportamento senza mai scrivere).
   - Scrittura → continua sotto, NON procedere senza rispondere alle
     domande successive.
3. **Se scrittura: sto usando l'account/utente dedicato giusto?**
   CineFighi ha `_QA_Agent_` (stesso nome usato dalla suite Playwright in
   `apps/cinefighi/fixtures/cinefighi-page.ts` e dagli script
   `scripts/ensure-cinefighi-qa-user.mjs` /
   `scripts/cleanup-write-residue.mjs`). **Mai inventare un nome nuovo**
   (es. "TestUser") — resterebbe visibile per sempre nella lista utenti
   reale del gruppo. Se un giorno serve un account dedicato anche per
   CineTracker, stesso principio: un nome fisso e riconoscibile, mai
   improvvisato lì per lì.
4. **Qual è il piano di pulizia, PRIMA di scrivere?**
   Non "poi ripulisco" in astratto: quali righe verranno create (titoli,
   voti, utenti), con quale comando/azione verranno rimosse a fine
   sessione, e come verifichi che la pulizia sia riuscita (es. una query
   di conferma "zero righe con `user_name = _QA_Agent_`", non solo "ho
   lanciato lo script di cleanup e mi fido").

## Se la scrittura è inevitabile

Capita (es. verificare che un voto scritto davvero triggeri il
comportamento giusto in produzione, non solo in un mock). In quel caso:

1. Dichiara le 4 risposte sopra esplicitamente prima di procedere.
2. Esegui la scrittura minima necessaria — non "tanto che ci sono aggiungo
   altri dati di prova".
3. Subito dopo, esegui la pulizia dichiarata al punto 4.
4. Verifica concretamente che la pulizia sia riuscita (una lettura di
   conferma), non darlo per scontato.
5. Se qualcosa nella pulizia fallisce, fermati e dillo esplicitamente
   all'utente — non lasciare un residuo silenzioso nei dati di persone
   vere sperando che nessuno se ne accorga.

## Nota per gli agenti automatici (qa-agent)

Gli agenti che girano da soli su GitHub Actions (Data Health, QA Agent
con `@write`) hanno già reti di sicurezza indipendenti per la pulizia
(`scripts/cleanup-write-residue.mjs`, eseguito sia subito dopo ogni test
`@write` sia come secondo controllo indipendente dentro Data Health).
Questo Skill riguarda soprattutto le verifiche MANUALI fatte durante una
sessione di sviluppo, dove non c'è una rete di sicurezza automatica a
coprire un errore.
