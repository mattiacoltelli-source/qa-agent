// Controlli di integrità dati per CineTracker (Supabase personale,
// single-user: tabella "Coltel" — schema verificato sul sorgente reale
// dell'app, storage.js, non dedotto). Sola lettura: nessuna riga viene mai
// scritta o cancellata da questo modulo.

import { fetchAllRows } from "../lib/supabase-rest.mjs";

export const label = "CineTracker";
export const url = process.env.CINETRACKER_BASE_URL ?? "https://mattiacoltelli-source.github.io/Cos90/";

const SUPABASE_URL = "https://quwkqaovjxczuahjcmmh.supabase.co";
const SUPABASE_KEY = "sb_publishable_1FWxC_BAnvblEtpTdUXrEg_iLKZDb6d";
const USER_ID = "default";

export async function checkData() {
  const rows = await fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "Coltel", {
    select: "tmdb_id,media_type,list,data",
    extraQuery: `user_id=eq.${USER_ID}`,
  });

  const issues = [];

  // Più righe sulla stessa (tmdb_id, list): il vincolo unique
  // (user_id, tmdb_id, list) lato Supabase dovrebbe impedirlo (l'app usa
  // upsert con onConflict, con un fix client-side apposito per le
  // collisioni film/serie sullo stesso id TMDB — vedi storage.js) — se
  // compare comunque, il vincolo è saltato.
  const keyCounts = new Map();
  for (const r of rows) {
    const key = `${r.tmdb_id}::${r.list}`;
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
  }
  const dupRows = [...keyCounts.entries()].filter(([, n]) => n > 1);
  if (dupRows.length > 0) {
    issues.push({
      type: "duplicate_entry",
      severity: "HIGH",
      count: dupRows.length,
      examples: dupRows.slice(0, 5).map(([k, n]) => `${k} x${n}`),
    });
  }

  // "data" (jsonb) incoerente con le colonne dedicate: storage.js scrive
  // sempre data: item con item.id === tmdb_id e item.media_type ===
  // media_type (la colonna li duplica per poter fare query senza aprire il
  // jsonb) — se divergono, il layer di sync ha scritto qualcosa di rotto.
  const malformed = rows.filter(
    (r) => !r.data || typeof r.data !== "object" || r.data.id !== r.tmdb_id || r.data.media_type !== r.media_type
  );
  if (malformed.length > 0) {
    issues.push({
      type: "malformed_data",
      severity: "MEDIUM",
      count: malformed.length,
      examples: malformed.slice(0, 5).map((r) => `tmdb_id=${r.tmdb_id} list=${r.list}`),
    });
  }

  return {
    counts: { entries: rows.length },
    issues,
  };
}
