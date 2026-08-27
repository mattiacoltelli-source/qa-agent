// Helper condiviso per interrogare un'API esterna e restituire un esito
// grezzo e normalizzato: status HTTP, corpo (troncato), errore di rete se
// la richiesta non è nemmeno arrivata a destinazione. Nessuna valutazione
// qui — decide se è PASS/FAIL chi chiama, in base alla forma attesa della
// risposta di QUELLA specifica API.

const TIMEOUT_MS = 15_000;
const BODY_SNIPPET_MAX = 500;
// Un solo retry silenzioso, SOLO su errore di rete (la richiesta non è
// nemmeno arrivata a destinazione) — mai su una risposta HTTP vera, quella
// è già un esito definitivo. Stesso identico principio già usato in
// health/lib/supabase-rest.mjs: un blip di rete isolato non deve bastare a
// far scattare un FAIL (qui, a valle in engine.mjs, un INFRA_ERROR).
const NETWORK_ERROR_MAX_RETRIES = 1;

// Header di rate-limit standard o comunemente usati (nomi diversi a seconda
// del provider — mai garantiti). Raccolti "a costo zero" quando un'API li
// invia: nessuna chiamata in più, nessuna nuova credenziale. Nessuna delle
// API controllate oggi (TMDB, Open-Meteo, sunrise-sunset.org) garantisce di
// inviarli — se assenti, rateLimit resta null, non è un errore né un FAIL.
const RATE_LIMIT_HEADER_NAMES = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "retry-after",
];

function extractRateLimitHeaders(headers) {
  const found = {};
  for (const name of RATE_LIMIT_HEADER_NAMES) {
    const value = headers.get(name);
    if (value !== null) found[name] = value;
  }
  return Object.keys(found).length > 0 ? found : null;
}

// Non stampiamo mai una api_key per intero nei log/report — anche se sono
// già pubbliche nei bundle delle app, non serve ripeterle inutilmente in un
// repo pubblico che ogni run aggiorna.
export function redact(url) {
  return url.replace(/([?&](?:api_key|key|token)=)[^&]+/gi, "$1***");
}

async function fetchJsonOnce(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, { method, signal: controller.signal });
    const durationMs = Date.now() - startedAt;
    const text = await res.text();

    let body = null;
    let parseError = null;
    try {
      body = JSON.parse(text);
    } catch (e) {
      parseError = e.message;
    }

    return {
      url: redact(url),
      method,
      status: res.status,
      ok: res.ok,
      durationMs,
      body,
      bodySnippet: text.slice(0, BODY_SNIPPET_MAX),
      parseError,
      networkError: null,
      rateLimit: extractRateLimitHeaders(res.headers),
    };
  } catch (e) {
    return {
      url: redact(url),
      method,
      status: null,
      ok: false,
      durationMs: Date.now() - startedAt,
      body: null,
      bodySnippet: null,
      parseError: null,
      networkError: e.message,
      rateLimit: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, { method = "GET" } = {}) {
  let result = await fetchJsonOnce(url, method);
  for (let attempt = 0; attempt < NETWORK_ERROR_MAX_RETRIES && result.networkError; attempt++) {
    result = await fetchJsonOnce(url, method);
  }
  return result;
}
