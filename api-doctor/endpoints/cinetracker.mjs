// Controlli sull'API esterna reale usata da CineTracker: TMDB, con una
// chiave DIVERSA da quella di CineFighi (verificato sul sorgente reale,
// tmdb.js di Cos90) — le due app non condividono la chiave, quindi vanno
// controllate separatamente: un problema sulla chiave di una non implica
// nulla sull'altra.

import { fetchJson } from "../lib/http.mjs";

export const label = "CineTracker";

const API_KEY = "f8d5e378edf5128176f0d89f49310151";
const BASE_URL = "https://api.themoviedb.org/3";

function checkTmdbShape(result, expectedArrayField) {
  if (result.networkError) {
    return { ok: false, reason: `Errore di rete: ${result.networkError}` };
  }
  if (result.body?.success === false) {
    return { ok: false, reason: `TMDB ha risposto con un errore: ${result.body.status_message ?? "(nessun messaggio)"}` };
  }
  if (!result.ok) {
    return { ok: false, reason: `HTTP ${result.status}` };
  }
  if (expectedArrayField && !Array.isArray(result.body?.[expectedArrayField])) {
    return { ok: false, reason: `Risposta 200 ma manca il campo atteso "${expectedArrayField}"` };
  }
  return { ok: true, reason: null };
}

export async function checks() {
  const results = [];

  const search = await fetchJson(`${BASE_URL}/search/multi?api_key=${API_KEY}&language=it-IT&query=test`);
  results.push({ name: "Ricerca (search/multi)", ...search, ...checkTmdbShape(search, "results") });

  const detail = await fetchJson(`${BASE_URL}/movie/550?api_key=${API_KEY}&language=it-IT`);
  results.push({ name: "Dettaglio titolo (movie/{id})", ...detail, ...checkTmdbShape(detail, null) });

  const discover = await fetchJson(
    `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=it-IT&sort_by=popularity.desc&page=1`
  );
  results.push({ name: "Scoperta titoli (discover/movie)", ...discover, ...checkTmdbShape(discover, "results") });

  return results;
}
