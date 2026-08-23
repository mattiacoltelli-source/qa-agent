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

function formatBytes(bytes) {
  return typeof bytes === "number" ? `${Math.round(bytes / 1024)} KB` : null;
}

// Preferisce i numeri espliciti di risparmio (byte/ms) quando l'audit li
// fornisce; altrimenti ricade sul displayValue che Lighthouse genera da
// solo (es. audit di accessibilità, che non hanno un risparmio in byte).
function formatSavings(audit) {
  const parts = [];
  const kb = formatBytes(audit.savingsBytes);
  if (kb) parts.push(`~${kb} risparmiabili`);
  if (typeof audit.savingsMs === "number") parts.push(`~${Math.round(audit.savingsMs)}ms risparmiabili`);
  if (parts.length > 0) return parts.join(", ");
  return audit.displayValue ?? null;
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
      if (app.metrics) {
        const m = app.metrics;
        lines.push(
          `- Metriche performance: FCP ${m["first-contentful-paint"]}, LCP ${m["largest-contentful-paint"]}, ` +
            `TBT ${m["total-blocking-time"]}, CLS ${m["cumulative-layout-shift"]}, SI ${m["speed-index"]}`
        );
      }
      if (app.topAudits?.length > 0) {
        lines.push(`- Principali punti deboli (da Lighthouse):`);
        for (const audit of app.topAudits) {
          const savings = formatSavings(audit);
          lines.push(`  - ${audit.title}${savings ? ` — ${savings}` : ""}`);
          for (const item of audit.items ?? []) {
            const kb = formatBytes(item.wastedBytes ?? item.totalBytes);
            lines.push(`    - \`${item.url}\`${kb ? ` (${kb})` : ""}`);
          }
        }
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
