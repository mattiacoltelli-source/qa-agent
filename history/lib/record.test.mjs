import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLastEntry, appendEntry, computeDeltas } from "./record.mjs";

// appendEntry/readLastEntry scrivono in "history/data" relativo alla cwd:
// ogni test lavora in una cartella temporanea propria, così non tocca mai
// il vero history/data del repo né interferisce con gli altri test.
function withTempCwd(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "history-test-"));
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("readLastEntry: null se il file non esiste ancora (primo run in assoluto)", () => {
  withTempCwd(() => {
    assert.equal(readLastEntry("scale"), null);
  });
});

test("appendEntry + readLastEntry: ritorna l'ultima riga scritta", () => {
  withTempCwd(() => {
    appendEntry("scale", { runAt: "2026-08-20", homeReadyMs: 1000 });
    appendEntry("scale", { runAt: "2026-08-27", homeReadyMs: 1200 });
    assert.deepEqual(readLastEntry("scale"), { runAt: "2026-08-27", homeReadyMs: 1200 });
  });
});

test("appendEntry: ogni run produce una riga JSONL indipendente (non un array)", () => {
  withTempCwd(() => {
    appendEntry("scale", { a: 1 });
    appendEntry("scale", { a: 2 });
    const raw = fs.readFileSync("history/data/scale.jsonl", "utf-8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { a: 1 });
    assert.deepEqual(JSON.parse(lines[1]), { a: 2 });
  });
});

test("readLastEntry con filter: trova l'ultima riga di una specifica app, non l'ultima riga del file", () => {
  withTempCwd(() => {
    appendEntry("performance", { app: "cinefighi", performance: 96 });
    appendEntry("performance", { app: "spot", performance: 79 });
    appendEntry("performance", { app: "cinefighi", performance: 94 });
    const last = readLastEntry("performance", (e) => e.app === "spot");
    assert.deepEqual(last, { app: "spot", performance: 79 });
  });
});

test("readLastEntry: una riga corrotta viene saltata, non blocca la lettura", () => {
  withTempCwd(() => {
    fs.mkdirSync("history/data", { recursive: true });
    fs.writeFileSync("history/data/scale.jsonl", '{"a":1}\nQUESTO NON E JSON\n{"a":2}\n');
    assert.deepEqual(readLastEntry("scale"), { a: 2 });
  });
});

test("computeDeltas: nessuna voce precedente -> skipped no-previous-run", () => {
  const { skipped, deltas } = computeDeltas(null, { homeReadyMs: 1000 }, ["homeReadyMs"]);
  assert.equal(skipped, "no-previous-run");
  assert.deepEqual(deltas, []);
});

test("computeDeltas: differenza sotto soglia non viene segnalata", () => {
  const { deltas } = computeDeltas({ homeReadyMs: 1000 }, { homeReadyMs: 1100 }, ["homeReadyMs"], { thresholdPct: 20 });
  assert.deepEqual(deltas, []);
});

test("computeDeltas: differenza sopra soglia viene segnalata con la percentuale corretta", () => {
  const { deltas } = computeDeltas({ homeReadyMs: 1000 }, { homeReadyMs: 1450 }, ["homeReadyMs"], { thresholdPct: 20 });
  assert.equal(deltas.length, 1);
  assert.deepEqual(deltas[0], { metric: "homeReadyMs", previous: 1000, current: 1450, deltaPct: 45 });
});

test("computeDeltas: un miglioramento (percentuale negativa) viene segnalato allo stesso modo di un peggioramento", () => {
  const { deltas } = computeDeltas({ homeReadyMs: 1000 }, { homeReadyMs: 500 }, ["homeReadyMs"], { thresholdPct: 20 });
  assert.equal(deltas[0].deltaPct, -50);
});

test("computeDeltas: sameConditionCheck che fallisce salta il confronto invece di produrre un numero fuorviante", () => {
  const previous = { extraTitles: 1000, homeReadyMs: 1000 };
  const current = { extraTitles: 15000, homeReadyMs: 3000 };
  const { skipped, deltas } = computeDeltas(previous, current, ["homeReadyMs"], {
    sameConditionCheck: (p, c) => p.extraTitles === c.extraTitles,
  });
  assert.equal(skipped, "different-conditions");
  assert.deepEqual(deltas, []);
});

test("computeDeltas: valori mancanti o non numerici vengono ignorati senza errore", () => {
  const { deltas } = computeDeltas({ homeReadyMs: null }, { homeReadyMs: 1000 }, ["homeReadyMs"]);
  assert.deepEqual(deltas, []);
});

test("computeDeltas: divisione per zero (metrica precedente a 0) viene evitata", () => {
  const { deltas } = computeDeltas({ total: 0 }, { total: 5 }, ["total"]);
  assert.deepEqual(deltas, []);
});
