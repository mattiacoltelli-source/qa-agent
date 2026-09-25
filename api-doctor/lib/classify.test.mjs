import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, rollupApp } from "./classify.mjs";

test("classify: PASS quando ok, FAIL quando ok è false ma senza networkError", () => {
  assert.equal(classify({ ok: true, networkError: null }), "PASS");
  assert.equal(classify({ ok: false, networkError: null }), "FAIL");
});

test("classify: INFRA_ERROR quando la richiesta non è arrivata a destinazione", () => {
  assert.equal(classify({ ok: false, networkError: "fetch failed" }), "INFRA_ERROR");
});

// Un rate limit non è un'API rotta: è l'API che non ci serve in quel
// momento, tipicamente perché l'IP del runner è condiviso. Va visto nel
// report, ma non deve far fallire il job — non c'è nulla da correggere.
test("classify: il 429 è INFRA_ERROR, non FAIL", () => {
  assert.equal(classify({ ok: false, networkError: null, status: 429 }), "INFRA_ERROR");
});

test("classify: gli altri status di errore restano FAIL", () => {
  for (const status of [400, 403, 404, 500, 503]) {
    assert.equal(classify({ ok: false, networkError: null, status }), "FAIL");
  }
});

test("rollupApp: PASS solo se tutti i check sono PASS", () => {
  assert.equal(rollupApp([{ kind: "PASS" }, { kind: "PASS" }]), "PASS");
});

test("rollupApp: un solo INFRA_ERROR (nessun FAIL) risulta INFRA_ERROR, non FAIL", () => {
  assert.equal(rollupApp([{ kind: "PASS" }, { kind: "INFRA_ERROR" }]), "INFRA_ERROR");
});

// Il caso più importante da proteggere: un FAIL vero vince SEMPRE, anche se
// nello stesso run c'è anche un INFRA_ERROR — non deve mai "nascondersi"
// dietro un problema di infrastruttura.
test("rollupApp: un FAIL vero vince sempre, anche insieme a un INFRA_ERROR", () => {
  assert.equal(rollupApp([{ kind: "FAIL" }, { kind: "INFRA_ERROR" }]), "FAIL");
  assert.equal(rollupApp([{ kind: "INFRA_ERROR" }, { kind: "FAIL" }]), "FAIL");
});

test("rollupApp: lista vuota è PASS", () => {
  assert.equal(rollupApp([]), "PASS");
});

// bestEffort — un check che da CI non può passare per ragioni fuori dal
// nostro controllo (GDELT, vedi endpoints/prova.mjs) resta misurato ma non
// decide lo stato dell'app.

test("rollupApp: un check bestEffort rotto non sporca lo stato dell'app", () => {
  assert.equal(rollupApp([{ kind: "PASS" }, { kind: "INFRA_ERROR", bestEffort: true }]), "PASS");
  assert.equal(rollupApp([{ kind: "PASS" }, { kind: "FAIL", bestEffort: true }]), "PASS");
});

// Il rischio di questa scorciatoia è nasconderci dietro qualcos'altro: un
// problema vero su un check normale deve continuare a vincere, e un check
// bestEffort che passa non deve "assolvere" nessuno.
test("rollupApp: bestEffort non copre un problema vero di un altro check", () => {
  assert.equal(rollupApp([{ kind: "FAIL" }, { kind: "PASS", bestEffort: true }]), "FAIL");
  assert.equal(rollupApp([{ kind: "INFRA_ERROR" }, { kind: "PASS", bestEffort: true }]), "INFRA_ERROR");
});

test("rollupApp: solo check bestEffort, tutti rotti, resta PASS", () => {
  assert.equal(rollupApp([{ kind: "FAIL", bestEffort: true }]), "PASS");
});
