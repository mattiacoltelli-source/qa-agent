# CineFighi — test Playwright

App multiutente (fino a 15 persone, nessuna autenticazione — chiunque può
scegliere il profilo di chiunque altro: è comportamento previsto, non un
bug). Il client parla direttamente a un progetto **Supabase condiviso dal
gruppo** (`titles`, `users`, `votes`); le credenziali sono hardcoded nel
bundle JS dell'app, quindi **non esiste un modo di puntare l'app a un
backend di test diverso da qui** — è un vincolo dell'app, non della suite.

## Modello di sicurezza dei dati

- Tutti i test che **non scrivono nulla** (ricerca, navigazione, stati
  vuoti, "Stasera cosa guardo" in sola lettura) girano sempre, in ogni CI
  run: non toccano il database condiviso.
- I test che **scrivono** (aggiungere un titolo, votare, ecc.) sono nei file
  `*.write.spec.ts`, taggati `@write`, e **disattivati di default**. Vanno
  eseguiti esplicitamente con `RUN_WRITE_TESTS=true` (`npm run test:write`).
- Usano tutti un utente di test dedicato, **`_QA_Agent_`**
  (`fixtures/cinefighi-page.ts`). Non è più un account permanente: in CI,
  `scripts/ensure-cinefighi-qa-user.mjs` lo crea (se non c'è già) **prima**
  di ogni run, così anche i test di sola lettura che lo *selezionano*
  (`user-picker.spec.ts`) lo trovano davvero già lì. `addUser()` lato app è
  comunque idempotente (case-insensitive), quindi è sicuro anche in locale
  se capita di lanciarlo più volte.
- Ogni test di scrittura ripulisce il titolo che ha aggiunto in un blocco
  `finally`. Se un cleanup dovesse fallire a metà (es. crash del browser),
  il residuo è riconoscibile: aggiunto da `_QA_Agent_`, spesso con il
  commento `"Voto di test automatico (QA)"`.
- **Rete di sicurezza automatica**: in CI, a fine run (sempre, letture o
  scritture, passato o fallito), uno step con `if: always()` esegue
  `scripts/cleanup-write-residue.mjs`: ripulisce su Supabase tutti i voti e
  i titoli legati a `_QA_Agent_`, e infine **cancella l'account stesso** —
  così non resta visibile per sempre nella lista condivisa che vedono gli
  amici veri del gruppo. È sicuro farlo sempre perché nessun membro reale
  del gruppo può avere quel nome. Lanciabile anche a mano con
  `npm run cleanup:write-residue` (e la creazione con
  `npm run setup:cinefighi-qa-user`).
- **Se il gruppo è già al completo (15/15)** e `_QA_Agent_` non ne fa
  ancora parte, il setup fallisce con un errore esplicito: va aggiunto
  manualmente una volta (aprendo l'app e scegliendo "Entra" con quel nome)
  prima di far girare la suite.

## Variabili d'ambiente

| Variabile | Default | Note |
|---|---|---|
| `CINEFIGHI_BASE_URL` | `https://mattiacoltelli-source.github.io/CineFighi/` | override per puntare a un fork/ambiente diverso |
| `RUN_WRITE_TESTS` | non impostata (test di scrittura skippati) | `true` per abilitarli |

## Cosa copre questa prima fase

- Selezione/creazione utente, comportamento "chiunque sceglie chiunque"
- Ricerca TMDB (risultati, stato vuoto, filtro per tipo)
- "Stasera cosa guardo" (sola lettura, robusto sia a profilo vuoto che popolato)
- Aggiunta titolo + voto + rimozione voto + rimozione titolo (`@write`)

## Backlog (dalla proposta originale, non ancora implementato)

- Eliminazione utente dal gruppo e persistenza del suo voto storico dopo l'eliminazione
- Rilevamento duplicato (`reason: "duplicate"`) — richiede due contesti/sessioni
  che scrivono in corsa sullo stesso titolo, non banale da rendere deterministico
- Filtri libreria per genere/stato nella schermata "Vedi tutto"
- Toggle statistiche Io/Gruppo e podio classifica
- Percorsi di errore di rete (fetch Supabase fallita → dati precedenti non svuotati)
