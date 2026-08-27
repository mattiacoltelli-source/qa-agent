#!/usr/bin/env node
// Legge reports/scale-results.json (scale/engine.mjs) e scrive un riepilogo
// leggibile su $GITHUB_STEP_SUMMARY — stesso stile di
// perf/write-summary.mjs. Se reports/scale-ai-analysis.json è presente,
// incorpora l'analisi Claude in coda — sempre accanto ai tempi misurati,
// mai al posto loro. Se reports/scale-trend.json è presente (scale/history.mjs),
// incorpora l'andamento rispetto al run precedente.

import fs from "node:fs";

const RESULTS_PATH = "reports/scale-results.json";
const AI_ANALYSIS_PATH = "reports/scale-ai-analysis.json";
const TREND_PATH = "reports/scale-trend.json";

function icon(result) {
  if (result === "PASS") return "✅";
  if (result === "WARN") return "⚠️";
  return "❌";
}

const METRIC_LABELS = {
  homeReadyMs: "Home pronta",
  libraryFirstPageMs: "Apertura Libreria (1a pagina)",
  statsReadyMs: "Apertura Statistiche",
};

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da riassumere.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const app = data.apps?.cinefighi;
  const lines = ["# Scale Agent — riepilogo", ""];

  if (!app) {
    lines.push("Nessun dato disponibile.");
  } else {
    lines.push(`## ${icon(app.result)} CineFighi — ${app.result}`);
    lines.push("");
    lines.push(`- Titoli reali in libreria al momento del run: **${app.realCount}**`);
    lines.push(`- Titoli testati (reali + ${app.extraTitles}): **${app.targetCount}**`);
    lines.push("");

    if (app.error) {
      lines.push(`- Errore: ${app.error}`);
    } else {
      for (const check of app.checks ?? []) {
        const mark = check.status === "PASS" ? "✅" : check.status === "WARN" ? "⚠️" : "❌";
        const label = METRIC_LABELS[check.metric] ?? check.metric;
        lines.push(`- ${label}: ${mark} ${check.value}ms (warn ≥${check.warn}ms, fail ≥${check.fail}ms)`);
      }
      lines.push("");
      lines.push(
        `- Righe libreria: ${app.metrics.initialLibraryRows} iniziali → ${app.metrics.libraryRowsAfterScroll} ` +
          `dopo scroll (${app.metrics.scrollMs}ms)`
      );
    }

    if (fs.existsSync(TREND_PATH)) {
      try {
        const trend = JSON.parse(fs.readFileSync(TREND_PATH, "utf-8"));
        if (trend.deltas?.length > 0) {
          lines.push("");
          lines.push("📈 **Andamento rispetto al run precedente** (stesso extra di titoli):");
          for (const d of trend.deltas) {
            const label = METRIC_LABELS[d.metric] ?? d.metric;
            const sign = d.deltaPct > 0 ? "+" : "";
            lines.push(`  - ${label}: ${d.previous}ms → ${d.current}ms (${sign}${d.deltaPct}%)`);
          }
        } else if (trend.skipped === "different-conditions") {
          lines.push("");
          lines.push("📈 Andamento non confrontato: extra di titoli diverso dal run precedente.");
        }
      } catch {
        /* file corrotto o assente: il riepilogo deterministico resta comunque completo */
      }
    }

    if (fs.existsSync(AI_ANALYSIS_PATH)) {
      try {
        const ai = JSON.parse(fs.readFileSync(AI_ANALYSIS_PATH, "utf-8"));
        lines.push("");
        lines.push(`**AI analysis** _(priority: ${ai.priority})_: ${ai.summary}`);
        lines.push(`Primo intervento: ${ai.first_fix}`);
      } catch {
        /* file corrotto o assente: il riepilogo deterministico resta comunque completo */
      }
    }
  }

  lines.push("");
  const summary = lines.join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  }
  console.log(summary);
}

main();
