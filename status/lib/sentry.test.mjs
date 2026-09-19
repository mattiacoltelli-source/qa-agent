// Test della traduzione delle issue Sentry. Nessuna rete.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PROGETTI, riassumiProgetto } from "./sentry.mjs";

const issue = (over = {}) => ({ title: "TypeError: x is not a function", culprit: "app.js", level: "error", count: "3", userCount: 1, permalink: "https://sentry.test/1", ...over });

test("nessuna issue è PASS, non 'sconosciuto'", () => {
  const r = riassumiProgetto([]);
  assert.equal(r.result, "PASS");
  assert.equal(r.summary, "Nessun errore in 24h");
  assert.deepEqual(r.problems, []);
});

test("una issue è WARN: un errore va guardato, non è un incendio", () => {
  const r = riassumiProgetto([issue()]);
  assert.equal(r.result, "WARN");
  assert.equal(r.problems[0].severity, "MEDIUM");
  assert.match(r.problems[0].message, /TypeError/);
  assert.match(r.problems[0].message, /3 volte/);
  assert.equal(r.problems[0].url, "https://sentry.test/1");
});

test("una issue fatal è FAIL", () => {
  const r = riassumiProgetto([issue({ level: "fatal" })]);
  assert.equal(r.result, "FAIL");
  assert.equal(r.problems[0].severity, "HIGH");
});

test("count arriva come stringa e va confrontato come numero", () => {
  // Senza conversione "9" > "10" e l'ordinamento sarebbe sbagliato proprio
  // dove conta: la issue più rumorosa deve stare in cima.
  const r = riassumiProgetto([issue({ title: "nove", count: "9" }), issue({ title: "dieci", count: "10" })]);
  assert.match(r.problems[0].message, /dieci/);
  assert.equal(r.metrics.eventi, 19);
});

test("il riassunto conta issue ed eventi, che sono cose diverse", () => {
  const r = riassumiProgetto([issue({ count: "5" }), issue({ count: "2" })]);
  assert.equal(r.metrics.issues, 2);
  assert.equal(r.metrics.eventi, 7);
  assert.match(r.summary, /2 errori · 7 eventi in 24h/);
});

test("singolare e plurale in italiano", () => {
  const r = riassumiProgetto([issue({ count: "1", userCount: 1 })]);
  assert.match(r.summary, /1 errore · 1 evento in 24h/);
  assert.match(r.problems[0].message, /1 volta/);
  assert.match(r.problems[0].message, /1 utente/);
});

test("al massimo tre problemi elencati: è un riassunto, non un export", () => {
  const r = riassumiProgetto(Array.from({ length: 10 }, (_, i) => issue({ title: `e${i}`, count: String(i) })));
  assert.equal(r.problems.length, 3);
  assert.equal(r.metrics.issues, 10);
});

test("una risposta non valida non produce uno stato inventato", () => {
  assert.equal(riassumiProgetto(null), null);
  assert.equal(riassumiProgetto({ detail: "forbidden" }), null);
});

test("i progetti Sentry mappano sulle chiavi app del contratto status/", () => {
  // I nomi divergono di proposito: i progetti Sentry seguono il repo
  // (cos90), il contratto segue l'app (cinetracker).
  assert.equal(PROGETTI.cos90, "cinetracker");
  assert.equal(PROGETTI.predict, "prova");
  assert.equal(PROGETTI.spot, "spot");
});
