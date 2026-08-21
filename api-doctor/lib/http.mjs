// Helper condiviso per interrogare un'API esterna e restituire un esito
// grezzo e normalizzato: status HTTP, corpo (troncato), errore di rete se
// la richiesta non è nemmeno arrivata a destinazione. Nessuna valutazione
// qui — decide se è PASS/FAIL chi chiama, in base alla forma attesa della
// risposta di QUELLA specifica API.

const TIMEOUT_MS = 15_000;
const BODY_SNIPPET_MAX = 500;

// Non stampiamo mai una api_key per intero nei log/report — anche se sono
// già pubbliche nei bundle delle app, non serve ripeterle inutilmente in un
// repo pubblico che ogni run aggiorna.
export function redact(url) {
  return url.replace(/([?&](?:api_key|key|token)=)[^&]+/gi, "$1***");
}

export async function fetchJson(url, { method = "GET" } = {}) {
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
    };
  } finally {
    clearTimeout(timer);
  }
}
