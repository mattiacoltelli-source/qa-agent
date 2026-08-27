#!/usr/bin/env node
// Storico del Performance Agent: per ciascuna delle tre app, confronta i
// quattro punteggi Lighthouse di oggi con l'ultimo run registrato PER
// QUELLA APP (non l'ultimo run del file — le tre app si alternano nello
// stesso file, vedi history/lib/record.mjs::readLastEntry con filtro),
// scrive reports/perf-trend.json (letto da write-summary.mjs) e accoda le
// tre voci di oggi a history/data/performance.jsonl.
//
// NON usa il confronto a percentuale generico: i punteggi sono già 0-100,
// dove un calo di qualche punto conta più della percentuale che rappresenta
// (90->85 è solo -5.5% ma è un calo reale; 40->38 è -5% ma quasi ininfluente
// a quel livello già basso). Qui la soglia è un calo assoluto di punti.
//
// Traccia solo i quattro punteggi (già puliti, 0-100), non le cinque
// metriche grezze (FCP/LCP/...): sono stringhe già formattate da Lighthouse
// ("1.2 s"), non numeri puri — estrarle in modo affidabile è un lavoro in
// più che oggi non serve.
//
// Non fa mai fallire il run: se qualcosa qui va storto, un avviso e via.

import fs from "node:fs";
import { readLastEntry, appendEntry } from "../history/lib/record.mjs";

const RESULTS_PATH = "reports/perf-results.json";
const TREND_PATH = "reports/perf-trend.json";
const SCORE_KEYS = ["performance", "accessibility", "best-practices", "seo"];
const POINT_DROP_THRESHOLD = 5;

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nessuno storico da aggiornare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const trendByApp = {};

  for (const [name, app] of Object.entries(data.apps ?? {})) {
    if (app.error || !app.scores) continue; // niente punteggi da registrare su un run in errore

    const entry = { runAt: data.generatedAt, app: name, label: app.label, result: app.result, ...app.scores };
    const previous = readLastEntry("performance", (e) => e.app === name);

    const drops = previous
      ? SCORE_KEYS.filter((k) => typeof previous[k] === "number" && typeof entry[k] === "number")
          .map((k) => ({ metric: k, previous: previous[k], current: entry[k], delta: entry[k] - previous[k] }))
          .filter((d) => d.delta <= -POINT_DROP_THRESHOLD)
      : [];

    trendByApp[name] = { skipped: previous ? null : "no-previous-run", drops };
    appendEntry("performance", entry);
  }

  fs.writeFileSync(TREND_PATH, JSON.stringify(trendByApp, null, 2));

  const totalDrops = Object.values(trendByApp).reduce((n, t) => n + t.drops.length, 0);
  console.log(`Andamento: ${totalDrops} calo/i di punteggio oltre soglia rispetto al run precedente per app.`);
}

try {
  main();
} catch (e) {
  console.warn("perf/history.mjs: errore inatteso, proseguo senza aggiornare lo storico:", e.message);
}
