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
