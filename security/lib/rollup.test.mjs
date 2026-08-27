import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAdvisories, summarizeVulnerabilities, rollup } from "./rollup.mjs";

test("extractAdvisories: tiene solo gli oggetti (dettagli veri), scarta le stringhe (catena transitiva)", () => {
  const via = ["nome-pacchetto-a-monte", { title: "Prototype Pollution", url: "https://example.com/1", severity: "high", range: "<2.0.0" }];
  assert.deepEqual(extractAdvisories(via), [
    { title: "Prototype Pollution", url: "https://example.com/1", severity: "high", range: "<2.0.0" },
  ]);
});

test("extractAdvisories: array vuoto/assente non esplode", () => {
  assert.deepEqual(extractAdvisories([]), []);
  assert.deepEqual(extractAdvisories(undefined), []);
});

test("summarizeVulnerabilities: normalizza fixAvailable a booleano o al nome del pacchetto fix", () => {
  const audit = {
    vulnerabilities: {
      a: { name: "a", severity: "high", isDirect: true, range: "<2.0.0", fixAvailable: true, via: [] },
      b: { name: "b", severity: "moderate", isDirect: false, range: "<1.0.0", fixAvailable: { name: "b-fixed" }, via: [] },
      c: { name: "c", severity: "low", isDirect: false, range: "<1.0.0", fixAvailable: false, via: [] },
    },
  };
  const out = summarizeVulnerabilities(audit);
  assert.equal(out.find((v) => v.name === "a").fixAvailable, true);
  assert.equal(out.find((v) => v.name === "b").fixAvailable, "b-fixed");
  assert.equal(out.find((v) => v.name === "c").fixAvailable, false);
});

test("rollup: PASS quando tutti i conteggi sono zero", () => {
  assert.equal(rollup({ info: 0, low: 0, moderate: 0, high: 0, critical: 0 }), "PASS");
});

test("rollup: WARN su moderate, FAIL su high/critical", () => {
  assert.equal(rollup({ info: 0, low: 0, moderate: 1, high: 0, critical: 0 }), "WARN");
  assert.equal(rollup({ info: 0, low: 0, moderate: 0, high: 1, critical: 0 }), "FAIL");
  assert.equal(rollup({ info: 0, low: 0, moderate: 0, high: 0, critical: 1 }), "FAIL");
});

// Il caso più importante da proteggere: FAIL vince sempre su WARN, anche se
// nello stesso run ci sono ANCHE vulnerabilità moderate.
test("rollup: FAIL vince sempre, anche insieme a moderate", () => {
  assert.equal(rollup({ info: 0, low: 0, moderate: 3, high: 1, critical: 0 }), "FAIL");
});

test("rollup: low e info da soli non contano mai (né WARN né FAIL)", () => {
  assert.equal(rollup({ info: 5, low: 10, moderate: 0, high: 0, critical: 0 }), "PASS");
});
