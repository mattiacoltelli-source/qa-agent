# VoiceBrief (repo `voicebrief`) — test Playwright

PWA che trascrive e riassume i vocali di WhatsApp: si condividono all'app e
si ottiene testo o riassunto. Frontend statico (GitHub Pages) + una funzione
Supabase (`voicebrief`) che usa OpenAI.

## Modello di sicurezza dei dati e dei costi

- **Nessun dato condiviso**: non c'è un database con dati di altri; l'audio
  vive solo in IndexedDB del browser. Nessun test è taggato `@write`.
- **Backend sempre mockato** (`fixtures/voicebrief-page.ts`, `mockApi`):
  nessuna richiesta esce verso Supabase/OpenAI, quindi i test non consumano
  il tetto di spesa mensile (~1 €) del backend reale. Il vocale di prova è
  un WAV di 1 secondo di silenzio generato nel test.
- Il backend reale è controllato a costo zero dall'API Doctor
  (`api-doctor/endpoints/voicebrief.mjs`): preflight CORS e POST vuoto, la
  funzione risponde prima di chiamare OpenAI.

## Cosa coprono i test

- `app-loads`: avvio senza errori JS, manifest con share target, apertura
  offline dalla cache del service worker.
- `process-flow`: vocale condiviso → scelta modalità → risultato; modalità
  ricordata; elimina audio.
- `error-handling`: un errore transitorio (503, rete caduta) viene
  ritentato una volta; servizio giù o tetto di spesa mostrano un errore
  chiaro, senza perdere l'audio e senza ritentare all'infinito.

I test `error-handling` descrivono il comportamento dalla v37 in poi (retry
del client): contro una versione pubblicata precedente falliscono.

## Cosa NON è coperto (volutamente)

- Registrazione dal microfono e vera condivisione da WhatsApp (richiedono
  permessi/OS che Playwright non simula in modo affidabile).
- La qualità di trascrizione e riassunto: è AI, non deterministica; i
  controlli anti-invenzioni stanno nel repo voicebrief
  (`supabase/functions/voicebrief/verify.test.mjs`).
- Data Health e Performance Agent: non registrati (nessun database da
  controllare; Lighthouse si può aggiungere come per le altre app).

## Eseguire

```
npm run test:voicebrief
VOICEBRIEF_BASE_URL=http://localhost:8766/ npm run test:voicebrief   # contro una copia locale
```
