#!/usr/bin/env node
// Data Health Agent — engine generico: per ogni app configurata in
// health/projects/, verifica che sia raggiungibile e (se ha un backend)
// esegue i controlli di integrità dati definiti in quel modulo. Scrive
// SEMPRE reports/health-results.json, deterministico — nessuna chiamata AI
// qui (vedi health/analyze.mjs).
//
// Stessa filosofia di playwright.config.ts per il QA Agent: per aggiungere
// una quarta app basta un nuovo file in health/projects/ con { label, url,
// checkData? } e una riga qui sotto in PROJECTS — non serve toccare il
// resto del motore.

import fs from "node:fs";
import * as cinefighi from "./projects/cinefighi.mjs";
import * as cinetracker from "./projects/cinetracker.mjs";
import * as vacanza from "./projects/vacanza.mjs";

const PROJECTS = { cinefighi, cinetracker, vacanza };
// "spot" è il nome che conosce l'utente (vedi tests.yml del QA Agent),
// "vacanza" resta il nome storico interno della cartella/progetto.
const ALIASES = { spot: "vacanza" };

const OUTPUT_PATH = "reports/health-results.json";
const UPTIME_TIMEOUT_MS = 15_000;
const UPTIME_MAX_RETRIES = 1;

async function fetchOnce(url) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPTIME_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    return { ok: res.ok, status: res.status, durationMs: Date.now() - started };
  } catch (e) {
    return { ok: false, status: null, durationMs: Date.now() - started, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// Un solo retry silenzioso: un blip di rete isolato non deve bastare a
// dichiarare un'app FAIL (e a far scattare, a valle, una chiamata AI per un
// falso allarme).
async function checkUptime(url) {
  let result = await fetchOnce(url);
  for (let attempt = 0; attempt < UPTIME_MAX_RETRIES && !result.ok; attempt++) {
    result = await fetchOnce(url);
  }
  return { url, ...result };
}

function rollup(uptime, data) {
  if (!uptime.ok) return "FAIL";
  if (!data) return "PASS";
  const severities = data.issues.map((i) => i.severity);
  if (severities.includes("HIGH")) return "FAIL";
  if (severities.length > 0) return "WARN";
  return "PASS";
}

async function checkProject(name, project) {
  const uptime = await checkUptime(project.url);

  let data = null;
  if (project.checkData) {
    try {
      data = await project.checkData();
    } catch (e) {
      data = {
        counts: {},
        issues: [{ type: "check_failed", severity: "HIGH", count: 1, examples: [e.message] }],
      };
    }
  }

  return { label: project.label, uptime, data, result: rollup(uptime, data) };
}

async function main() {
  const requested = process.argv[2] || "tutte";
  const resolved = ALIASES[requested] || requested;
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

  const failed = Object.values(apps).filter((a) => a.result === "FAIL").length;
  const warned = Object.values(apps).filter((a) => a.result === "WARN").length;
  console.log(
    `Data Health: ${Object.keys(apps).length} app controllate — ${failed} FAIL, ${warned} WARN.`
  );
}

main().catch((e) => {
  console.error("health/engine.mjs: errore inatteso:", e.message);
  process.exit(1);
});
