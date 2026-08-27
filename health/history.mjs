#!/usr/bin/env node
// Storico del Data Health Agent: per CineFighi e CineTracker (le uniche due
// con un backend da contare — Spot ha solo localStorage, niente
// checkData), confronta i conteggi di oggi (utenti/titoli/voti) con
// l'ultimo run registrato PER QUELLA APP, scrive reports/health-trend.json
// (letto da write-summary.mjs) e accoda le voci di oggi a
// history/data/data-health.jsonl.
//
// Due segnali distinti, non uno solo:
// - crescita dei conteggi: percentuale (computeDeltas condiviso — qui ha
//   senso, sono numeri che crescono gradualmente, non vicini allo zero);
// - issue che aumentano: come per il Security Agent, un conteggio vicino
//   allo zero dove la percentuale non aiuta — segnalato se il numero di
//   issue è maggiore dell'ultima volta, punto.
//
// Non fa mai fallire il run: se qualcosa qui va storto, un avviso e via.

import fs from "node:fs";
import { readLastEntry, appendEntry, computeDeltas } from "../history/lib/record.mjs";

const RESULTS_PATH = "reports/health-results.json";
const TREND_PATH = "reports/health-trend.json";
const COUNT_KEYS = ["users", "titles", "votes"];

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nessuno storico da aggiornare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const trendByApp = {};

  for (const [name, app] of Object.entries(data.apps ?? {})) {
    if (!app.data) continue; // Spot: nessun backend, nulla da contare

    const counts = app.data.counts ?? {};
    const issueCount = app.data.issues?.length ?? 0;
    const entry = {
      runAt: data.generatedAt,
      app: name,
      label: app.label,
      result: app.result,
      users: counts.users,
      titles: counts.titles,
      votes: counts.votes,
      issueCount,
    };

    const previous = readLastEntry("data-health", (e) => e.app === name);
    const growth = computeDeltas(previous, entry, COUNT_KEYS, { thresholdPct: 20 });
    const issuesWorsened = previous != null && issueCount > previous.issueCount;

    trendByApp[name] = { skipped: growth.skipped, growth: growth.deltas, issuesWorsened };
    appendEntry("data-health", entry);
  }

  fs.writeFileSync(TREND_PATH, JSON.stringify(trendByApp, null, 2));

  const totalGrowth = Object.values(trendByApp).reduce((n, t) => n + t.growth.length, 0);
  const anyIssuesWorsened = Object.values(trendByApp).some((t) => t.issuesWorsened);
  console.log(`Andamento: ${totalGrowth} variazione/i di crescita segnalate; issue peggiorate: ${anyIssuesWorsened ? "sì" : "no"}.`);
}

try {
  main();
} catch (e) {
  console.warn("health/history.mjs: errore inatteso, proseguo senza aggiornare lo storico:", e.message);
}
