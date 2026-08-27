#!/usr/bin/env node
// Legge reports/security-results.json (security/engine.mjs) e scrive un
// riepilogo leggibile su $GITHUB_STEP_SUMMARY — stesso stile di
// perf/write-summary.mjs e scale/write-summary.mjs. Se
// reports/security-ai-analysis.json è presente, incorpora l'analisi
// Claude in coda — sempre accanto all'elenco delle vulnerabilità, mai al
// posto loro.

import fs from "node:fs";

const RESULTS_PATH = "reports/security-results.json";
const AI_ANALYSIS_PATH = "reports/security-ai-analysis.json";

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
  const app = data.apps?.["qa-agent"];
  const lines = ["# Security Agent — riepilogo", ""];

  if (!app) {
    lines.push("Nessun dato disponibile.");
  } else {
    lines.push(`## ${icon(app.result)} qa-agent (dipendenze npm) — ${app.result}`);
    lines.push("");

    if (app.error) {
      lines.push(`- Errore: ${app.error}`);
    } else {
      const c = app.counts ?? {};
      lines.push(
        `- Vulnerabilità: ${c.total ?? 0} totali (critical ${c.critical ?? 0}, high ${c.high ?? 0}, ` +
          `moderate ${c.moderate ?? 0}, low ${c.low ?? 0}, info ${c.info ?? 0})`
      );
      if (app.dependencies) {
        lines.push(
          `- Dipendenze analizzate: ${app.dependencies.total} (prod ${app.dependencies.prod}, dev ${app.dependencies.dev})`
        );
      }
      if (app.vulnerabilities?.length > 0) {
        lines.push(`- Pacchetti coinvolti:`);
        for (const v of app.vulnerabilities) {
          const direct = v.isDirect ? "diretta" : "transitiva";
          const fix = v.fixAvailable ? `fix disponibile (${v.fixAvailable === true ? "npm audit fix" : v.fixAvailable})` : "nessun fix disponibile";
          lines.push(`  - \`${v.name}\` — ${v.severity}, dipendenza ${direct}, ${fix}`);
          for (const adv of v.advisories ?? []) {
            lines.push(`    - ${adv.title ?? "advisory"}${adv.url ? ` (${adv.url})` : ""}`);
          }
        }
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
