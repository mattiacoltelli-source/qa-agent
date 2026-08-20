#!/usr/bin/env node
// Legge reports/results.json (prodotto dal reporter "json" di Playwright, vedi
// playwright.config.ts) e scrive un riepilogo leggibile direttamente nella
// pagina del run di GitHub Actions ($GITHUB_STEP_SUMMARY) — niente da
// scaricare, si vede in cima al run anche da telefono.
//
// Deterministico: usa solo dati già raccolti da Playwright (nome test,
// stato, durata, messaggio d'errore). Nessuna chiamata esterna, nessuna AI.

import fs from "node:fs";

const RESULTS_PATH = "reports/results.json";
const MAX_ERROR_CHARS = 600;

const APP_LABELS = {
  cinefighi: "CineFighi",
  cinetracker: "CineTracker",
  vacanza: "Spot",
};

function appNameFromProject(projectName) {
  const prefix = projectName.split("-")[0];
  return APP_LABELS[prefix] || projectName;
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

function cleanError(text, max) {
  if (!text) return "(nessun messaggio d'errore)";
  const plain = text.replace(ANSI_ESCAPE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

// I risultati sono annidati in un albero di suite (una per file, a volte per
// progetto). Attraversiamo tutto ricorsivamente per arrivare a spec/test.
function collectTests(suites, out = []) {
  for (const suite of suites) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        out.push({ spec, test });
      }
    }
    if (suite.suites) collectTests(suite.suites, out);
  }
  return out;
}

function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da riassumere.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const { stats } = data;
  const allTests = collectTests(data.suites || []);

  // Raggruppa per app (CineFighi/CineTracker/Spot), non per progetto
  // mobile/desktop separato — combacia con come l'utente pensa alle app.
  const byApp = new Map();
  for (const { spec, test } of allTests) {
    const app = appNameFromProject(test.projectName);
    if (!byApp.has(app)) byApp.set(app, { passed: 0, failed: 0, flaky: 0, skipped: 0, failures: [] });
    const bucket = byApp.get(app);

    if (test.status === "expected") bucket.passed++;
    else if (test.status === "skipped") bucket.skipped++;
    else if (test.status === "flaky") {
      bucket.flaky++;
      bucket.passed++; // un flaky è comunque passato al retry
    } else if (test.status === "unexpected") {
      bucket.failed++;
      const lastResult = test.results[test.results.length - 1];
      const errorMsg = lastResult?.errors?.[0]?.message;
      bucket.failures.push({
        title: spec.title,
        file: spec.file,
        project: test.projectName,
        duration: lastResult?.duration ?? 0,
        error: cleanError(errorMsg, MAX_ERROR_CHARS),
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
    lines.push(
      `✅ ${bucket.passed} PASS` +
        (bucket.failed ? `  ❌ ${bucket.failed} FAIL` : "") +
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
    for (const f of allFailures) {
      lines.push(`**${f.title}** \`(${f.project}, ${(f.duration / 1000).toFixed(1)}s)\``);
      lines.push(`<sub>${f.file}</sub>`);
      lines.push("");
      lines.push("```");
      lines.push(f.error);
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("---");
  lines.push(
    "📎 Screenshot, video e trace dei fallimenti: artifact **playwright-report** in fondo a questa pagina " +
      "(`npx playwright show-trace <file>.zip` per aprire una trace)."
  );

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
