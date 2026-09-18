// Test unitari per il calcolo dell'attesa fra i tentativi sul 429
// (rateLimitWaitMs). La catena di retry vera non è testata qui: farebbe
// aspettare davvero secondi reali ad ogni run dei test unitari, mentre la
// parte con una logica non ovvia — leggere o scartare Retry-After — è
// tutta in questa funzione.

import { test } from "node:test";
import assert from "node:assert/strict";

import { rateLimitWaitMs } from "./http.mjs";

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
