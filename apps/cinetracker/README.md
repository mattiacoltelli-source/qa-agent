# CineTracker (repo `Cos90`) — test Playwright

App single-user (nessuno user picker: `user_id` fisso `"default"`), ma con
un backend Supabase proprio (tabella `Coltel`) e un layer offline-first
molto più complesso di CineFighi: cache locale, sync in background con
retry, realtime multi-dispositivo, mirror-delete. Le credenziali sono
hardcoded nel bundle JS, come in CineFighi.

## Modello di sicurezza dei dati

- Test di sola lettura (ricerca, banner offline, navigazione) girano sempre.
- Test che **scrivono** sono nei file `*.write.spec.ts`, taggati `@write`,
  disattivati di default (`RUN_WRITE_TESTS=true` / `npm run test:write`).
- **Non esiste un "utente di test" separabile**: essendo single-user,
  scrivere qui significa scrivere nella libreria reale — quella vera, tua.
  Ogni test di scrittura rimuove il titolo che ha aggiunto in un blocco
  `finally`; il test di import backup sovrascrive temporaneamente la
  libreria con un file che ha appena esportato (round-trip), non con dati
  arbitrari.
- Se un cleanup fallisce a metà, il residuo è un titolo con voto/commento
  riconoscibile (es. `vote: "7,5"` aggiunto durante `vote-formats.write`) —
  va rimosso a mano dall'app.
- **Rete di sicurezza automatica**: `vote-formats.write.spec.ts` scrive nel
  commento un marcatore fisso (`CINETRACKER_MARKER` in
  `scripts/cleanup-write-residue.mjs`). In CI, dopo la suite `@write`
  (sempre, anche se un test fallisce o va in timeout), uno step con
  `if: always()` esegue quello script: ripulisce su Supabase solo le voci
  che portano quel marcatore, mai altro — non può toccare un tuo voto vero
  per coincidenza di valore. `backup-roundtrip.write.spec.ts` non scrive
  marcatori (non passa dal campo voto/commento), quindi il suo eventuale
  residuo resta da rimuovere a mano come prima. Lanciabile anche a mano con
  `npm run cleanup:write-residue`.

## Variabili d'ambiente

| Variabile | Default | Note |
|---|---|---|
| `CINETRACKER_BASE_URL` | `https://mattiacoltelli-source.github.io/Cos90/` | override per un fork/ambiente diverso |
| `RUN_WRITE_TESTS` | non impostata (test di scrittura skippati) | `true` per abilitarli |

## Cosa copre questa prima fase

- Avvio single-user (nessun picker), bottom nav a 4 sezioni
- Ricerca TMDB (risultati, stato vuoto, menu azioni a comparsa su mobile)
- **Formati voto** (`7`, `7,5`, `7.5`→`7,5`, `8-`, `8+`, clamp a 10, input non valido) —
  la logica più a rischio bug dell'app, verificata end-to-end
- Backup: export produce JSON valido, import round-trip ripristina la libreria
- Banner offline/online, ricerca rifiutata subito se offline

## Backlog (dalla proposta originale, non ancora implementato)

- Collisione `tmdb_id` film/serie nella stessa lista (dedup lato client prima dell'upsert)
- Retry con backoff esponenziale sul push Supabase (richiede intercettare e far fallire 2 tentativi su 3)
- Sync realtime multi-dispositivo (`queueRealtimeSync` / `mergeRemoteIntoLocal`) — richiede due contesti Playwright in parallelo
- "Stasera cosa guardo" e "Scopri qualcosa di nuovo" (stessa logica di CineFighi, da adattare alla UI qui: `#genreSelect`, `#recommendBtn`, `#discoverBtn`, `#classicBtn`)
- Statistiche e classifica (podio, toggle Film/Serie)
