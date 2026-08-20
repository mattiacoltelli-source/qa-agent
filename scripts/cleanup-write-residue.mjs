#!/usr/bin/env node
// Rete di sicurezza indipendente dalla sessione del browser: ripulisce
// eventuali residui lasciati dai test @write nel caso il loro try/finally
// non sia arrivato in fondo (crash del browser, pagina bloccata, timeout).
//
// Usa le stesse chiavi "publishable"/anon già hardcoded nei bundle JS delle
// due app (nessun segreto nuovo, nessun permesso più ampio di quello che il
// client in un browser qualsiasi ha già) via l'API REST di PostgREST.
//
// Agisce SOLO su righe riconducibili in modo inequivocabile ai test:
// - CineFighi ha un utente di test dedicato ("_QA_Agent_"): nessun membro
//   reale del gruppo può avere quel nome, quindi ripulire tutto ciò che gli
//   appartiene è sempre sicuro.
// - CineTracker è single-user: non esiste un "utente di test" separabile, e
//   i voti scritti dai test ("7", "8+", ...) sono valori plausibili che
//   potrebbero coincidere con un voto vero. Per questo i test aggiungono un
//   marcatore nel campo commento (vedi vote-formats.write.spec.ts): qui si
//   ripulisce solo ciò che porta quel marcatore, mai altro.

const CINEFIGHI_URL = "https://dxzukpujouayxlomwryc.supabase.co";
const CINEFIGHI_KEY = "sb_publishable_6kaInTs-_PDPHUszpj8N5w_Sb1zCXI9";
const QA_USER = "_QA_Agent_";

const CINETRACKER_URL = "https://quwkqaovjxczuahjcmmh.supabase.co";
const CINETRACKER_KEY = "sb_publishable_1FWxC_BAnvblEtpTdUXrEg_iLKZDb6d";
export const CINETRACKER_MARKER = "QA_AGENT_TEST_MARKER";

async function restDelete(baseUrl, key, table, query) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "return=representation",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DELETE ${table} fallita (HTTP ${res.status}): ${text}`);
  }

  let rows = [];
  try {
    rows = JSON.parse(text);
  } catch {
    /* return=representation dovrebbe sempre dare JSON; se non lo dà, non è comunque un errore */
  }
  return Array.isArray(rows) ? rows : [];
}

async function cleanupCineFighi() {
  const deletedVotes = await restDelete(
    CINEFIGHI_URL,
    CINEFIGHI_KEY,
    "votes",
    `user_name=eq.${encodeURIComponent(QA_USER)}`
  );
  const deletedTitles = await restDelete(
    CINEFIGHI_URL,
    CINEFIGHI_KEY,
    "titles",
    `added_by=eq.${encodeURIComponent(QA_USER)}`
  );
  console.log(
    `CineFighi: rimossi ${deletedVotes.length} voto/i e ${deletedTitles.length} titolo/i residui di "${QA_USER}".`
  );
}

async function cleanupCineTracker() {
  // data->>comment fa una query PostgREST sul campo "comment" dentro la
  // colonna jsonb "data". ilike è case-insensitive; "*" è il wildcard di
  // PostgREST per gli operatori pattern (equivalente a "%" in SQL).
  const filter = [
    `data->>comment=ilike.*${CINETRACKER_MARKER}*`,
    `user_id=eq.default`,
  ].join("&");

  const deleted = await restDelete(CINETRACKER_URL, CINETRACKER_KEY, "Coltel", filter);
  console.log(`CineTracker: rimosse ${deleted.length} voce/i residua/e marcata/e "${CINETRACKER_MARKER}".`);
}

async function main() {
  const target = process.argv[2];
  if (!target || target === "cinefighi") await cleanupCineFighi();
  if (!target || target === "cinetracker") await cleanupCineTracker();
}

main().catch((e) => {
  console.error("Cleanup residui @write fallito:", e.message);
  process.exit(1);
});
