// Controlli sul backend di VoiceBrief (funzione Supabase `voicebrief`, che
// poi parla con OpenAI). Costo zero per costruzione: niente audio e niente
// testo, quindi la funzione risponde PRIMA di chiamare OpenAI e senza
// toccare il tetto di spesa mensile.
//
//  - OPTIONS (preflight CORS): è ciò che il browser chiede prima di ogni
//    chiamata dell'app; se manca l'header giusto l'app non parla più col
//    backend pur essendo "online".
//  - POST senza corpo: la funzione deve rispondere 400 "bad_mode". Il
//    controllo della chiave OpenAI viene PRIMA di quello sulla modalità,
//    quindi un 400 prova anche che il secret OPENAI_API_KEY c'è (se
//    mancasse risponderebbe 500 "server_misconfigured").

import { fetchJson } from "../lib/http.mjs";

export const label = "VoiceBrief";

const API_URL = process.env.VOICEBRIEF_API_URL ?? "https://quwkqaovjxczuahjcmmh.supabase.co/functions/v1/voicebrief";
const ORIGIN = "https://mattiacoltelli-source.github.io";
// Una funzione "fredda" può metterci un po'; oltre questa soglia il check segnala lentezza (non fallisce).
const SLOW_MS = 3_000;

export async function checks() {
  const results = [];

  const preflight = await fetchJson(API_URL, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
  });
  results.push({
    name: "Backend raggiungibile (preflight CORS)",
    ...preflight,
    ok: !preflight.networkError && preflight.status === 204,
    reason: preflight.networkError
      ? `Errore di rete: ${preflight.networkError}`
      : preflight.status !== 204
        ? `HTTP ${preflight.status} (atteso 204)`
        : null,
  });

  const probe = await fetchJson(API_URL, { method: "POST", headers: { Origin: ORIGIN } });
  const okShape = probe.status === 400 && probe.body?.error === "bad_mode";
  results.push({
    name: "Funzione attiva e chiave OpenAI configurata (POST vuoto → bad_mode)",
    ...probe,
    ok: !probe.networkError && okShape,
    reason: probe.networkError
      ? `Errore di rete: ${probe.networkError}`
      : probe.status === 500 && probe.body?.error === "server_misconfigured"
        ? "La funzione risponde ma manca il secret OPENAI_API_KEY"
        : probe.status === 429
          ? "HTTP 429 (limite di richieste del gateway)"
          : !okShape
            ? `Risposta inattesa: HTTP ${probe.status}, corpo ${JSON.stringify(probe.body)?.slice(0, 120)}`
            : null,
  });

  results.push({
    name: `Tempo di risposta sotto ${SLOW_MS / 1000}s`,
    ...probe,
    ok: !probe.networkError && probe.durationMs < SLOW_MS,
    reason: probe.networkError
      ? `Errore di rete: ${probe.networkError}`
      : probe.durationMs >= SLOW_MS
        ? `Risposta in ${probe.durationMs} ms`
        : null,
  });

  return results;
}
