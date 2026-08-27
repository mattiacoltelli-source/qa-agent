#!/usr/bin/env node
// Storico dello Scale Agent: confronta il run di oggi con l'ultimo
// registrato (tempi Home/Libreria/Statistiche), scrive reports/scale-trend.json
// (letto da write-summary.mjs) e accoda la voce di oggi a
// history/data/scale.jsonl. Vedi history/lib/record.mjs per il meccanismo
// condiviso.
//
// L'extra di titoli è scelto al lancio (vedi scale/engine.mjs) e può
// cambiare da un run all'altro (1000 di default, ma anche 15000 a mano):
// confrontare i tempi tra due run con extra diverso darebbe un numero
// fuorviante ("+300%!" quando in realtà è solo un test più severo), quindi
// il confronto scatta SOLO se l'extra è lo stesso della volta precedente.
//
// Non fa mai fallire il run: se qualcosa qui va storto, un avviso e via —
// stesso principio già in uso per analyze.mjs in ogni agente.

import fs from "node:fs";
import { readLastEntry, appendEntry, computeDeltas } from "../history/lib/record.mjs";

const RESULTS_PATH = "reports/scale-results.json";
const TREND_PATH = "reports/scale-trend.json";
const METRIC_KEYS = ["homeReadyMs", "libraryFirstPageMs", "statsReadyMs"];

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nessuno storico da aggiornare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const app = data.apps?.cinefighi;
  if (!app || app.error) {
    console.log("Run in errore: non registrato nello storico (nulla di significativo da confrontare).");
    return;
  }

  const entry = {
    runAt: data.generatedAt,
    result: app.result,
    realCount: app.realCount,
    extraTitles: app.extraTitles,
    targetCount: app.targetCount,
    homeReadyMs: app.metrics?.homeReadyMs,
    libraryFirstPageMs: app.metrics?.libraryFirstPageMs,
    statsReadyMs: app.metrics?.statsReadyMs,
  };

  const previous = readLastEntry("scale");
  const trend = computeDeltas(previous, entry, METRIC_KEYS, {
    thresholdPct: 20,
    sameConditionCheck: (p, c) => p.extraTitles === c.extraTitles,
  });

  fs.writeFileSync(TREND_PATH, JSON.stringify(trend, null, 2));
  appendEntry("scale", entry);

  if (trend.deltas.length > 0) {
    console.log(`Andamento: ${trend.deltas.length} metrica/che oltre soglia rispetto al run precedente.`);
  } else {
    console.log(`Andamento: ${trend.skipped ?? "nessuna variazione significativa"}.`);
  }
}

try {
  main();
} catch (e) {
  console.warn("scale/history.mjs: errore inatteso, proseguo senza aggiornare lo storico:", e.message);
}
