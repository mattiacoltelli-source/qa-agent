// Helper condiviso per interrogare un'API esterna e restituire un esito
// grezzo e normalizzato: status HTTP, corpo (troncato), errore di rete se
// la richiesta non è nemmeno arrivata a destinazione. Nessuna valutazione
// qui — decide se è PASS/FAIL chi chiama, in base alla forma attesa della
// risposta di QUELLA specifica API.
//
// `headers` opzionale: nessuna delle API di CineTracker/Spot ne ha mai
// avuto bisogno, ma SEC EDGAR (Prova) richiede uno User-Agent con un
// contatto reale per policy — vedi api-doctor/endpoints/prova.mjs.

const TIMEOUT_MS = 15_000;
const BODY_SNIPPET_MAX = 500;
// Un solo retry silenzioso, SOLO su errore di rete (la richiesta non è
// nemmeno arrivata a destinazione) — mai su una risposta HTTP vera, quella
// è già un esito definitivo. Stesso identico principio già usato in
// health/lib/supabase-rest.mjs: un blip di rete isolato non deve bastare a
// far scattare un FAIL (qui, a valle in engine.mjs, un INFRA_ERROR).
const NETWORK_ERROR_MAX_RETRIES = 1;

// Retry paziente, opt-in per singolo check: serve dove l'host tipicamente
// non si rifiuta perché c'è un problema suo, ma perché in quel momento non
// vuole servire QUESTO ip — quello condiviso del runner GitHub. Di norma
// una risposta arrivata è un esito definitivo, qui no.
//
// Il rifiuto per ip non ha una forma sola, ed è per questo che il retry non
// guarda più il solo 429: sul controllo GDELT di endpoints/prova.mjs lo
// storico di status/api-doctor.json mostra 429 (18 e 19 settembre) e
// connessione caduta senza risposta (dal 21 in poi) come esiti della stessa
// giornata storta, più il 503 "upstream connect error" del gateway GDELT,
// che è la stessa cosa detta da un proxy. Il retry sul solo 429 copriva un
// terzo dei casi, quindi il check restava rosso comunque.
//
// Se il rifiuto non si libera entro i tentativi l'esito resta quello vero e
// il check resta rosso: il retry toglie i falsi allarmi, non li nasconde.
const REFUSED_MAX_RETRIES = 2;
const REFUSED_WAITS_MS = [5_000, 10_000];
// Status con cui un host (o il suo gateway) dice "ora no", non "la tua
// richiesta è sbagliata".
const REFUSED_STATUSES = new Set([429, 503]);
// Tetto all'attesa dichiarata dal server: un Retry-After lunghissimo non
// deve tenere fermo il run.
const REFUSED_MAX_WAIT_MS = 30_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Il messaggio con cui fetch fallisce è sempre e solo "fetch failed": il
 * motivo vero (ENOTFOUND, ECONNRESET, UND_ERR_CONNECT_TIMEOUT...) sta in
 * `cause`, e senza di quello un INFRA_ERROR nel report non dice nulla su
 * cosa sia andato storto — è il caso del check GDELT, rosso per giorni con
 * la sola scritta "Errore di rete: fetch failed". L'unico abort possibile
 * qui è il nostro timeout (il controller lo aborta solo da quel timer),
 * quindi lo diciamo invece di lasciare "This operation was aborted". */
export function networkErrorMessage(e) {
  if (e?.name === "AbortError") return `nessuna risposta entro ${TIMEOUT_MS / 1_000}s`;
  const detail = e?.cause?.code || e?.cause?.message;
  return detail ? `${e.message} (${detail})` : e.message;
}

/** Quanto aspettare prima del tentativo successivo: Retry-After se il
 * server lo manda in secondi (lo sa solo lui), altrimenti l'attesa fissa
 * crescente. Un Retry-After in formato data HTTP viene ignorato. */
export function rateLimitWaitMs(result, attempt) {
  const header = result.rateLimit?.["retry-after"];
  const seconds = header === undefined ? NaN : Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, REFUSED_MAX_WAIT_MS);
  }
  return REFUSED_WAITS_MS[Math.min(attempt, REFUSED_WAITS_MS.length - 1)];
}

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

async function fetchJsonOnce(url, method, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, { method, headers, signal: controller.signal });
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
      networkError: networkErrorMessage(e),
      rateLimit: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** True quando l'host non ci ha servito in quel momento: si è rifiutato con
 * uno status di "ora no", oppure non ha risposto affatto. Le due cose sono
 * lo stesso evento visto da due punti diversi della catena — vedi il
 * commento su REFUSED_MAX_RETRIES. */
export function wasRefused(result) {
  return result.networkError !== null || REFUSED_STATUSES.has(result.status);
}

export async function fetchJson(
  url,
  { method = "GET", headers = {}, retryWhenRefused = false } = {}
) {
  let result = await fetchJsonOnce(url, method, headers);
  for (let attempt = 0; attempt < NETWORK_ERROR_MAX_RETRIES && result.networkError; attempt++) {
    result = await fetchJsonOnce(url, method, headers);
  }

  if (retryWhenRefused) {
    for (let attempt = 0; attempt < REFUSED_MAX_RETRIES && wasRefused(result); attempt++) {
      await sleep(rateLimitWaitMs(result, attempt));
      result = await fetchJsonOnce(url, method, headers);
    }
  }

  return result;
}
