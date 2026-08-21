#!/usr/bin/env node
// Legge reports/perf-results.json (perf/engine.mjs) e scrive un riepilogo
// leggibile su $GITHUB_STEP_SUMMARY — stesso stile di
// health/write-summary.mjs e scripts/write-summary.mjs. Se
// reports/perf-ai-analysis.json è presente, incorpora l'analisi Claude
// sotto ogni app in WARN/FAIL — sempre accanto ai punteggi, mai al posto
// loro.

import fs from "node:fs";

const RESULTS_PATH = "reports/perf-results.json";
const AI_ANALYSIS_PATH = "reports/perf-ai-analysis.json";

function loadAiAnalysis() {
  if (!fs.existsSync(AI_ANALYSIS_PATH)) return new Map();
  try {
    const analyses = JSON.parse(fs.readFileSync(AI_ANALYSIS_PATH, "utf-8"));
    return new Map(analyses.map((a) => [a.app, a]));
  } catch {
    return new Map();
  }
}

function icon(result) {
  if (result === "PASS") return "✅";
  if (result === "WARN") return "⚠️";
  return "❌";
}

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da riassumere.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const aiByApp = loadAiAnalysis();

  const lines = ["# Performance Agent — riepilogo", ""];

  for (const [name, app] of Object.entries(data.apps)) {
    lines.push(`## ${icon(app.result)} ${app.label} — ${app.result}`);
    lines.push("");

    if (app.error) {
      lines.push(`- Errore: ${app.error}`);
    } else {
      for (const [cat, score] of Object.entries(app.scores)) {
        const threshold = app.thresholds[cat];
        const mark = score >= threshold ? "✅" : "⚠️";
        lines.push(`- ${cat}: ${mark} ${score}/100 (soglia ${threshold})`);
      }
      if (app.topAudits?.length > 0) {
        lines.push(`- Principali punti deboli (da Lighthouse): ${app.topAudits.join("; ")}`);
      }
    }

    const ai = aiByApp.get(name);
    if (ai) {
      lines.push("");
      lines.push(`**AI analysis** _(priority: ${ai.priority})_: ${ai.summary}`);
      lines.push(`Primo intervento: ${ai.first_fix}`);
    }

    lines.push("");
  }

  const summary = lines.join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  }
  console.log(summary);
}

main();
