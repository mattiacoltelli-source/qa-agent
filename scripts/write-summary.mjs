#!/usr/bin/env node
// Legge reports/results.json (prodotto dal reporter "json" di Playwright, vedi
// playwright.config.ts) e scrive un riepilogo leggibile direttamente nella
// pagina del run di GitHub Actions ($GITHUB_STEP_SUMMARY) — niente da
// scaricare, si vede in cima al run anche da telefono.
//
// Deterministico nei dati Playwright: usa solo ciò che Playwright ha già
// raccolto (nome test, stato, durata, messaggio d'errore). Se
// reports/ai-analysis.json è presente (scritto da analyze-failures.mjs),
// incorpora anche l'analisi Claude sotto ogni fallimento — sempre accanto
// al messaggio d'errore originale, mai al posto suo.

import fs from "node:fs";
import { collectTests, appNameFromProject, cleanError, classifyFailure } from "./lib/results.mjs";

const RESULTS_PATH = "reports/results.json";
const AI_ANALYSIS_PATH = "reports/ai-analysis.json";
const MAX_ERROR_CHARS = 600;

function loadAiAnalysis() {
  if (!fs.existsSync(AI_ANALYSIS_PATH)) return new Map();
  try {
    const analyses = JSON.parse(fs.readFileSync(AI_ANALYSIS_PATH, "utf-8"));
    return new Map(analyses.map((a) => [a.key, a]));
  } catch {
    return new Map();
  }
}

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da riassumere.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const { stats } = data;
  const allTests = collectTests(data.suites || []);
  const aiByKey = loadAiAnalysis();

  // Raggruppa per app (CineFighi/CineTracker/Spot), non per progetto
  // mobile/desktop separato — combacia con come l'utente pensa alle app.
  const byApp = new Map();
  for (const { spec, test } of allTests) {
    const app = appNameFromProject(test.projectName);
    if (!byApp.has(app)) byApp.set(app, { passed: 0, failed: 0, infra: 0, flaky: 0, skipped: 0, failures: [] });
    const bucket = byApp.get(app);

    if (test.status === "expected") bucket.passed++;
    else if (test.status === "skipped") bucket.skipped++;
    else if (test.status === "flaky") {
      bucket.flaky++;
      bucket.passed++; // un flaky è comunque passato al retry
    } else if (test.status === "unexpected") {
      bucket.failed++;
      const lastResult = test.results[test.results.length - 1];
      const errorMessage = lastResult?.errors?.[0]?.message;
      const kind = classifyFailure(errorMessage);
      if (kind === "INFRA_ERROR") bucket.infra++;
      const key = `${test.projectName}::${spec.file}::${spec.title}`;
      bucket.failures.push({
        title: spec.title,
        file: spec.file,
        project: test.projectName,
        duration: lastResult?.duration ?? 0,
        error: cleanError(errorMessage, MAX_ERROR_CHARS),
        kind,
        ai: aiByKey.get(key),
      });
    }
  }

  const lines = [];
  lines.push("## 🧪 QA Agent — Esito test");
  lines.push("");
  lines.push(
    `**Totale**: ${stats.expected} passati · ${stats.unexpected} falliti · ${stats.flaky} flaky · ${stats.skipped} skippati` +
      ` _(${(stats.duration / 1000).toFixed(1)}s)_`
  );
  lines.push("");

  for (const [app, bucket] of byApp) {
    lines.push(`### ${app}`);
    // bucket.failed include anche gli eventuali bucket.infra (Playwright li
    // conta comunque come "unexpected"): mostrarli separati aiuta a capire a
    // colpo d'occhio quanti sono probabilmente un blip di infrastruttura
    // (browser/rete del runner) invece che un bug reale dell'app.
    lines.push(
      `✅ ${bucket.passed} PASS` +
        (bucket.failed ? `  ❌ ${bucket.failed - bucket.infra} FAIL` : "") +
        (bucket.infra ? `  🌐 ${bucket.infra} INFRA_ERROR` : "") +
        (bucket.flaky ? `  🔁 ${bucket.flaky} FLAKY` : "") +
        (bucket.skipped ? `  ⏭️ ${bucket.skipped} SKIP` : "")
    );
    lines.push("");
  }

  const allFailures = [...byApp.values()].flatMap((b) => b.failures);
  if (allFailures.length > 0) {
    lines.push("---");
    lines.push("");
    lines.push("## ❌ Fallimenti");
    lines.push("");

    // Le pattern_group condivise tra più fallimenti valgono la pena di
    // essere segnalate esplicitamente, non solo ripetute su ogni riga.
    const groupCounts = new Map();
    for (const f of allFailures) {
      if (f.ai?.pattern_group) {
        groupCounts.set(f.ai.pattern_group, (groupCounts.get(f.ai.pattern_group) || 0) + 1);
      }
    }

    for (const f of allFailures) {
      const infraTag = f.kind === "INFRA_ERROR" ? " 🌐 _probabile INFRA_ERROR, non un bug dell'app_" : "";
      lines.push(`**${f.title}**${infraTag} \`(${f.project}, ${(f.duration / 1000).toFixed(1)}s)\``);
      lines.push(`<sub>${f.file}</sub>`);
      lines.push("");
      lines.push("```");
      lines.push(f.error);
      lines.push("```");
      if (f.ai) {
        const severityIcon = { HIGH: "🔴", MEDIUM: "🟡", LOW: "🟢" }[f.ai.severity] || "";
        lines.push(
          `🤖 **Causa probabile**: ${f.ai.probable_cause} · **Confidence**: ${f.ai.confidence}% · ` +
            `**Severity**: ${severityIcon} ${f.ai.severity}`
        );
        if (f.ai.pattern_group && groupCounts.get(f.ai.pattern_group) > 1) {
          lines.push(
            `   ↳ Pattern comune "${f.ai.pattern_group}": altri ${groupCounts.get(f.ai.pattern_group) - 1} fallimenti nello stesso run.`
          );
        }
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(
    "📎 Screenshot, video e trace dei fallimenti: artifact **playwright-report** in fondo a questa pagina " +
      "(`npx playwright show-trace <file>.zip` per aprire una trace)."
  );
  if (allFailures.length > 0 && aiByKey.size === 0) {
    lines.push("");
    lines.push(
      "_Nessuna analisi Claude in questo run (chiave API non impostata, o chiamata non riuscita — vedi il log dello step \"Analizza i fallimenti\")._"
    );
  }

  const summary = lines.join("\n") + "\n";

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(summaryPath, summary);
  } else {
    // Fuori da GitHub Actions (es. lanciato in locale): stampa e basta.
    console.log(summary);
  }
}

main();
