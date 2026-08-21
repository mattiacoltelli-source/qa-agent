// Controlli sull'API esterna reale usata da CineFighi: TMDB. Stessa chiave
// e stessi endpoint hardcoded nel bundle dell'app (tmdb.js) — verificato sul
// sorgente reale, non dedotto.

import { fetchJson } from "../lib/http.mjs";

export const label = "CineFighi";

const API_KEY = "c9ebaca404bbc26bad39cce1c3aa9677";
const BASE_URL = "https://api.themoviedb.org/3";

// Una risposta TMDB è valida se ha status 2xx E non ha la forma d'errore di
// TMDB stesso ({ success: false, status_code, status_message }) — TMDB
// risponde 401 su chiave non valida/scaduta, 429 su rate limit, ma a volte
// incapsula l'errore nel corpo con uno status comunque 200.
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
