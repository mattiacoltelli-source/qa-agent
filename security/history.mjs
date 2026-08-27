#!/usr/bin/env node
// Storico del Security Agent: confronta il run di oggi con l'ultimo
// registrato, scrive reports/security-trend.json (letto da
// write-summary.mjs) e accoda la voce di oggi a
// history/data/security.jsonl. Vedi history/lib/record.mjs per il
// meccanismo condiviso.
//
// NON usa il confronto a percentuale generico (computeDeltas): i conteggi
// di vulnerabilità sono quasi sempre vicini allo zero, dove una percentuale
// è priva di senso (0 -> 1 è "+Infinity%"). Qui la regola è più semplice e
// più corretta per il caso: segnala se critical o high sono aumentati
// rispetto all'ultima volta, punto.
//
// Non fa mai fallire il run: se qualcosa qui va storto, un avviso e via.

import fs from "node:fs";
import { readLastEntry, appendEntry } from "../history/lib/record.mjs";

const RESULTS_PATH = "reports/security-results.json";
const TREND_PATH = "reports/security-trend.json";

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nessuno storico da aggiornare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const app = data.apps?.["qa-agent"];
  if (!app || app.error) {
    console.log("Run in errore: non registrato nello storico (nulla di significativo da confrontare).");
    return;
  }

  const counts = app.counts ?? {};
  const entry = {
    runAt: data.generatedAt,
    result: app.result,
    critical: counts.critical ?? 0,
    high: counts.high ?? 0,
    moderate: counts.moderate ?? 0,
    low: counts.low ?? 0,
    total: counts.total ?? 0,
  };

  const previous = readLastEntry("security");
  const worsened = previous && (entry.critical > previous.critical || entry.high > previous.high);
  const trend = { skipped: previous ? null : "no-previous-run", worsened: !!worsened, previous, current: entry };

  fs.writeFileSync(TREND_PATH, JSON.stringify(trend, null, 2));
  appendEntry("security", entry);

  console.log(worsened ? "Andamento: vulnerabilità critical/high aumentate rispetto al run precedente." : "Andamento: nessun peggioramento su critical/high.");
}

try {
  main();
} catch (e) {
  console.warn("security/history.mjs: errore inatteso, proseguo senza aggiornare lo storico:", e.message);
}
