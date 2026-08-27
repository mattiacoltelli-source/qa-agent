#!/usr/bin/env node
// Legge reports/health-results.json (health/engine.mjs) e scrive un
// riepilogo leggibile direttamente nella pagina del run di GitHub Actions
// ($GITHUB_STEP_SUMMARY) — niente da scaricare, leggibile anche da telefono.
// Stesso stile di scripts/write-summary.mjs (QA Agent). Se
// reports/health-ai-analysis.json è presente (scritto da health/analyze.mjs),
// incorpora anche l'analisi Claude sotto ogni app in WARN/FAIL — sempre
// accanto ai dati deterministici, mai al posto loro. Se
// reports/health-trend.json è presente (health/history.mjs), incorpora
// l'andamento (crescita conteggi, issue peggiorate) rispetto al run
// precedente PER QUELLA APP.

import fs from "node:fs";

const RESULTS_PATH = "reports/health-results.json";
const AI_ANALYSIS_PATH = "reports/health-ai-analysis.json";
const TREND_PATH = "reports/health-trend.json";

function loadAiAnalysis() {
  if (!fs.existsSync(AI_ANALYSIS_PATH)) return new Map();
  try {
    const analyses = JSON.parse(fs.readFileSync(AI_ANALYSIS_PATH, "utf-8"));
    return new Map(analyses.map((a) => [a.app, a]));
  } catch {
    return new Map();
  }
}

function loadTrend() {
  if (!fs.existsSync(TREND_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(TREND_PATH, "utf-8"));
  } catch {
    return {};
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
  const trendByApp = loadTrend();

  const lines = ["# Data Health Agent — riepilogo", ""];

  for (const [name, app] of Object.entries(data.apps)) {
    lines.push(`## ${icon(app.result)} ${app.label} — ${app.result}`);
    lines.push("");

    const uptimeDetail = app.uptime.error ? ` — ${app.uptime.error}` : "";
    lines.push(
      `- Uptime: ${app.uptime.ok ? "✅" : "❌"} (HTTP ${app.uptime.status ?? "n/d"}, ${app.uptime.durationMs}ms)${uptimeDetail}`
    );

    if (app.data) {
      const counts = Object.entries(app.data.counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(`- Conteggi: ${counts || "n/d"}`);

      if (app.data.issues.length === 0) {
        lines.push(`- Integrità: ✅ nessuna anomalia`);
      } else {
        lines.push(`- Integrità: ⚠️ ${app.data.issues.length} tipo/i di anomalia rilevati`);
        for (const issue of app.data.issues) {
          lines.push(`  - **${issue.type}** (${issue.severity}): ${issue.count} — es. ${issue.examples.join("; ")}`);
        }
      }

      const trend = trendByApp[name];
      if (trend?.growth?.length > 0 || trend?.issuesWorsened) {
        lines.push("");
        lines.push("📈 **Andamento rispetto al run precedente**:");
        for (const g of trend.growth ?? []) {
          const sign = g.deltaPct > 0 ? "+" : "";
          lines.push(`  - ${g.metric}: ${g.previous} → ${g.current} (${sign}${g.deltaPct}%)`);
        }
        if (trend.issuesWorsened) lines.push(`  - ⚠️ Numero di anomalie aumentato rispetto al run precedente.`);
      }

      const ai = aiByApp.get(name);
      if (ai) {
        lines.push("");
        lines.push(`**AI analysis** _(severity: ${ai.severity})_: ${ai.probable_cause}`);
        lines.push(`Dove guardare: ${ai.where_to_investigate}`);
      }
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
