import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExtraTitles, rollup } from "./rollup.mjs";

test("parseExtraTitles: usa il valore passato quando è un intero positivo valido", () => {
  assert.equal(parseExtraTitles("15000"), 15000);
  assert.equal(parseExtraTitles("3000"), 3000);
});

test("parseExtraTitles: ricade su 1000 per input assente, non numerico, zero o negativo", () => {
  assert.equal(parseExtraTitles(undefined), 1000);
  assert.equal(parseExtraTitles(""), 1000);
  assert.equal(parseExtraTitles("abc"), 1000);
  assert.equal(parseExtraTitles("0"), 1000);
  assert.equal(parseExtraTitles("-500"), 1000);
});

test("rollup: PASS quando ogni metrica è sotto la soglia warn", () => {
  const { result, checks } = rollup({ homeReadyMs: 1000, libraryFirstPageMs: 100, statsReadyMs: 300 });
  assert.equal(result, "PASS");
  assert.ok(checks.every((c) => c.status === "PASS"));
});

test("rollup: WARN quando una metrica è tra warn e fail (nessuna oltre fail)", () => {
  // homeReadyMs: warn 3000, fail 6000 (vedi scale/thresholds.mjs)
  const { result } = rollup({ homeReadyMs: 4000, libraryFirstPageMs: 100, statsReadyMs: 300 });
  assert.equal(result, "WARN");
});

// Il caso più importante da proteggere: FAIL vince sempre su WARN, anche se
// nello stesso run altre metriche sono solo in WARN — non deve mai
// "annacquarsi" a WARN quando c'è un vero superamento della soglia fail.
test("rollup: FAIL vince sempre, anche insieme a metriche in WARN", () => {
  const { result } = rollup({ homeReadyMs: 7000, libraryFirstPageMs: 900, statsReadyMs: 300 });
  assert.equal(result, "FAIL");
});

test("rollup: il valore esattamente uguale alla soglia conta già come superato", () => {
  const { checks } = rollup({ homeReadyMs: 3000, libraryFirstPageMs: 100, statsReadyMs: 300 });
  const home = checks.find((c) => c.metric === "homeReadyMs");
  assert.equal(home.status, "WARN");
});
