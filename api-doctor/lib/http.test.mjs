// Test unitari per le tre funzioni pure di http.mjs: quanto aspettare fra i
// tentativi (rateLimitWaitMs), se vale la pena riprovare (wasRefused) e come
// si legge un errore di rete (networkErrorMessage). La catena di retry vera
// non è testata qui: farebbe aspettare davvero secondi reali ad ogni run dei
// test unitari, mentre le parti con una logica non ovvia sono tutte qui.

import { test } from "node:test";
import assert from "node:assert/strict";

import { networkErrorMessage, rateLimitWaitMs, wasRefused } from "./http.mjs";

const withRetryAfter = (value) => ({ rateLimit: { "retry-after": value } });

test("senza Retry-After usa le attese fisse crescenti", () => {
  assert.equal(rateLimitWaitMs({ rateLimit: null }, 0), 5_000);
  assert.equal(rateLimitWaitMs({ rateLimit: null }, 1), 10_000);
});

test("oltre l'ultima attesa prevista resta sull'ultima, non va fuori array", () => {
  assert.equal(rateLimitWaitMs({ rateLimit: null }, 9), 10_000);
});

test("rispetta un Retry-After in secondi", () => {
  assert.equal(rateLimitWaitMs(withRetryAfter("3"), 0), 3_000);
});

test("tetta un Retry-After enorme", () => {
  assert.equal(rateLimitWaitMs(withRetryAfter("600"), 0), 30_000);
});

test("ignora un Retry-After in formato data HTTP", () => {
  assert.equal(rateLimitWaitMs(withRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"), 0), 5_000);
});

test("un Retry-After a zero è valido: si riprova subito", () => {
  assert.equal(rateLimitWaitMs(withRetryAfter("0"), 0), 0);
});

// wasRefused — "l'host ora non ci serve", nelle forme in cui lo dice.

const risposta = (status) => ({ status, networkError: null });

test("429 e 503 sono un rifiuto: si riprova", () => {
  assert.equal(wasRefused(risposta(429)), true);
  assert.equal(wasRefused(risposta(503)), true);
});

test("una connessione caduta è lo stesso rifiuto, senza status", () => {
  assert.equal(wasRefused({ status: null, networkError: "fetch failed (ECONNRESET)" }), true);
});

test("un 200 o un errore vero dell'API non sono un rifiuto: niente retry", () => {
  assert.equal(wasRefused(risposta(200)), false);
  assert.equal(wasRefused(risposta(404)), false);
  assert.equal(wasRefused(risposta(500)), false);
});

// networkErrorMessage — "fetch failed" da solo non dice niente: il motivo
// sta in cause, ed è quello che finisce nel report.

test("aggancia il codice da cause a fetch failed", () => {
  const e = new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
  assert.equal(networkErrorMessage(e), "fetch failed (ECONNRESET)");
});

test("senza code usa il messaggio di cause", () => {
  const e = new TypeError("fetch failed", { cause: { message: "bad port" } });
  assert.equal(networkErrorMessage(e), "fetch failed (bad port)");
});

test("senza cause resta il messaggio originale", () => {
  assert.equal(networkErrorMessage(new TypeError("fetch failed")), "fetch failed");
});

test("l'abort è il nostro timeout, e lo dice", () => {
  const e = new Error("This operation was aborted");
  e.name = "AbortError";
  assert.equal(networkErrorMessage(e), "nessuna risposta entro 15s");
});
