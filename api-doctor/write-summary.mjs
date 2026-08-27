#!/usr/bin/env node
// Legge reports/api-doctor-results.json (api-doctor/engine.mjs) e scrive un
// riepilogo leggibile su $GITHUB_STEP_SUMMARY — stesso stile di
// health/write-summary.mjs e perf/write-summary.mjs. Se
// reports/api-doctor-ai-analysis.json è presente, incorpora Probabile causa
// e Fix consigliato sotto ogni endpoint in FAIL — sempre accanto ai dati
// deterministici, mai al posto loro.

import fs from "node:fs";

const RESULTS_PATH = "reports/api-doctor-results.json";
const AI_ANALYSIS_PATH = "reports/api-doctor-ai-analysis.json";

function loadAiAnalysis() {
  if (!fs.existsSync(AI_ANALYSIS_PATH)) return new Map();
  try {
    const analyses = JSON.parse(fs.readFileSync(AI_ANALYSIS_PATH, "utf-8"));
    return new Map(analyses.map((a) => [a.key, a]));
  } catch {
    return new Map();
  }
}

function icon(result) {
  if (result === "PASS") return "✅";
  if (result === "INFRA_ERROR") return "🌐";
  return "❌";
}

// Solo se l'API ha inviato header di rate-limit (mai garantito, vedi
// lib/http.mjs) — una riga compatta "nome=valore", non un'interpretazione:
// il significato esatto dipende dal provider, non proviamo a indovinarlo.
function formatRateLimit(rateLimit) {
  if (!rateLimit) return null;
  return Object.entries(rateLimit)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da riassumere.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const aiByKey = loadAiAnalysis();

  const lines = ["# API Doctor Agent — riepilogo", ""];

  for (const [name, app] of Object.entries(data.apps)) {
    lines.push(`## ${icon(app.result)} ${app.label} — ${app.result}`);
    lines.push("");

    for (const check of app.checks) {
      const rateLimit = formatRateLimit(check.rateLimit);

      if (check.ok) {
        const quota = rateLimit ? ` — quota: ${rateLimit}` : "";
        lines.push(`- ✅ **${check.name}** — PASS (HTTP ${check.status}, ${check.durationMs}ms)${quota}`);
        continue;
      }

      if (check.kind === "INFRA_ERROR") {
        lines.push(`- 🌐 **${check.name}** — INFRA_ERROR (richiesta mai arrivata a destinazione, non un problema dell'API)`);
        lines.push(`  - Dettaglio: ${check.reason}`);
        lines.push(`  - Endpoint: \`${check.endpoint}\``);
        continue;
      }

      lines.push(`- ❌ **${check.name}** — FAIL`);
      lines.push(`  - Problema: ${check.reason}`);
      lines.push(`  - Endpoint: \`${check.endpoint}\` (HTTP ${check.status ?? "n/d"})`);
      if (rateLimit) lines.push(`  - Quota: ${rateLimit}`);

      const ai = aiByKey.get(`${name}::${check.name}`);
      if (ai) {
        lines.push(`  - Probabile causa: ${ai.probable_cause}`);
        lines.push(`  - Fix consigliato: ${ai.suggested_fix}`);
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
