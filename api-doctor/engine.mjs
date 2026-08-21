#!/usr/bin/env node
// API Doctor — engine: per ogni app, interroga le API esterne reali che usa
// davvero (TMDB per CineFighi/CineTracker, meteo/mare/alba-tramonto per
// Spot — verificate sul sorgente reale, non dedotte) e verifica che
// rispondano nella forma attesa. Deterministico: nessuna chiamata AI qui
// (vedi api-doctor/analyze.mjs). Scrive SEMPRE reports/api-doctor-results.json.

import fs from "node:fs";
import * as cinefighi from "./endpoints/cinefighi.mjs";
import * as cinetracker from "./endpoints/cinetracker.mjs";
import * as spot from "./endpoints/spot.mjs";

const PROJECTS = { cinefighi, cinetracker, spot };

const OUTPUT_PATH = "reports/api-doctor-results.json";

async function checkProject(name, project) {
  const checks = await project.checks();
  const failed = checks.filter((c) => !c.ok);
  return {
    label: project.label,
    checks: checks.map((c) => ({
      name: c.name,
      endpoint: c.url,
      method: c.method,
      status: c.status,
      ok: c.ok,
      durationMs: c.durationMs,
      reason: c.reason,
      bodySnippet: c.ok ? null : c.bodySnippet, // il corpo grezzo serve solo per diagnosticare un fallimento
    })),
    result: failed.length === 0 ? "PASS" : "FAIL",
  };
}

async function main() {
  const requested = process.argv[2] || "tutte";
  const resolved = requested === "tutte" ? "tutte" : requested;
  const names = resolved === "tutte" ? Object.keys(PROJECTS) : [resolved];

  const apps = {};
  for (const name of names) {
    const project = PROJECTS[name];
    if (!project) {
      console.warn(`Progetto sconosciuto: "${name}", salto.`);
      continue;
    }
    apps[name] = await checkProject(name, project);
  }

  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), apps }, null, 2));

  const totalChecks = Object.values(apps).reduce((n, a) => n + a.checks.length, 0);
  const failedChecks = Object.values(apps).reduce((n, a) => n + a.checks.filter((c) => !c.ok).length, 0);
  console.log(`API Doctor: ${totalChecks} endpoint controllati — ${failedChecks} FAIL.`);
}

main().catch((e) => {
  console.error("api-doctor/engine.mjs: errore inatteso:", e.message);
  process.exit(1);
});
