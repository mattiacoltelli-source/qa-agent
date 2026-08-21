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
//
// Ogni pagina ha un timeout esplicito (altrimenti una risposta che resta
// appesa blocca il job fino al timeout del workflow, 10 minuti, invece di
// fallire in modo pulito) e un solo retry silenzioso (un blip di rete
// isolato non deve bastare a far scattare un FAIL — e con esso, a valle,
// una chiamata AI per un falso allarme).

const PAGE_SIZE = 1000;
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;

async function fetchPage(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`GET ${url} fallita (HTTP ${res.status}): ${await res.text()}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPageWithRetry(url, headers) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchPage(url, headers);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export async function fetchAllRows(baseUrl, key, table, { select = "*", extraQuery = "" } = {}) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const qs = [`select=${encodeURIComponent(select)}`, extraQuery].filter(Boolean).join("&");

    const page = await fetchPageWithRetry(`${baseUrl}/rest/v1/${table}?${qs}`, {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `${from}-${to}`,
    });

    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}
