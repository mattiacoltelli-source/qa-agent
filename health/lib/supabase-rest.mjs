// Lettura paginata via API REST di Supabase (PostgREST) — stesso meccanismo
// HTTP già usato da scripts/cleanup-write-residue.mjs e
// scripts/ensure-cinefighi-qa-user.mjs, qui solo in lettura (nessun DELETE,
// nessun INSERT). Usa la stessa chiave "publishable"/anon già hardcoded nei
// bundle JS delle due app: nessun segreto nuovo, nessun permesso più ampio
// di quello che un client in un browser qualsiasi ha già.
//
// La paginazione è necessaria perché PostgREST limita le righe per singola
// richiesta (di norma 1000): senza il loop con l'header Range, una tabella
// più grande di quel limite verrebbe letta troncata, senza errore visibile.

const PAGE_SIZE = 1000;

export async function fetchAllRows(baseUrl, key, table, { select = "*", extraQuery = "" } = {}) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const qs = [`select=${encodeURIComponent(select)}`, extraQuery].filter(Boolean).join("&");

    const res = await fetch(`${baseUrl}/rest/v1/${table}?${qs}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${to}`,
      },
    });

    if (!res.ok) {
      throw new Error(`GET ${table} fallita (HTTP ${res.status}): ${await res.text()}`);
    }

    const page = await res.json();
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
