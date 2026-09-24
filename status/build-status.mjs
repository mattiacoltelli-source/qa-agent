#!/usr/bin/env node
// Pubblica l'esito dell'ultimo run di UN agente in `status/<agente>.json`,
// un file piccolo e committato nel repo — leggibile da una pagina statica
// via raw.githubusercontent senza token, a differenza degli artifact di
// GitHub Actions (che richiedono autenticazione e scadono dopo 14/30 giorni).
//
// Perché esiste, visto che quattro agenti hanno già uno storico in
// `history/data/*.jsonl`: quello storico serve a confrontare un run col
// precedente ed esiste solo per Data Health, Performance, Scale e Security.
// QA Agent e API Doctor — i due che dicono se le app funzionano davvero —
// non lasciano oggi nessuna traccia leggibile fuori dal run. Questo script
// copre tutti e sei con la stessa forma, così chi legge non deve conoscere
// sei formati diversi.
//
// NON esegue controlli e non decide PASS/FAIL: legge il report che
// l'agente ha già scritto in `reports/` e lo riduce all'essenziale.
// Il giudizio resta dell'agente, qui si traduce soltanto.
//
// Uso: node status/build-status.mjs <agente>
//   agente ∈ qa | data-health | performance | api-doctor | security
//
// Solo I/O: la logica sta in status/lib/normalize.mjs (funzioni pure,
// testate in status/lib/normalize.test.mjs) — stessa divisione già in uso
// in api-doctor/lib, scale/lib, security/lib.
//
// Non fa mai fallire il run: se qualcosa qui va storto, un avviso e via —
// stesso principio di analyze.mjs e history.mjs in ogni agente.

import fs from "node:fs";
import { AGENTS, mergeStatus } from "./lib/normalize.mjs";

const STATUS_DIR = "status";

const REPORT_PATHS = {
  qa: "reports/results.json",
  "data-health": "reports/health-results.json",
  performance: "reports/perf-results.json",
  "api-doctor": "reports/api-doctor-results.json",
  security: "reports/security-results.json",
};

// Un run di GitHub Actions è raggiungibile solo se conosciamo repo e id:
// in locale queste variabili non ci sono e il campo resta null, invece di
// inventare un link che porterebbe a una pagina inesistente.
function runUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  const id = process.env.GITHUB_RUN_ID;
  return repo && id ? `https://github.com/${repo}/actions/runs/${id}` : null;
}

function readJson(path) {
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch (e) {
    console.warn(`${path} illeggibile (${e.message}): ignorato.`);
    return null;
  }
}

function main() {
  const agent = process.argv[2];
  const def = AGENTS[agent];
  if (!def) {
    console.warn(`Agente sconosciuto: "${agent}". Attesi: ${Object.keys(AGENTS).join(", ")}.`);
    return;
  }

  const raw = readJson(REPORT_PATHS[agent]);
  if (!raw) {
    console.log(`Nessun ${REPORT_PATHS[agent]} trovato: nulla da pubblicare.`);
    return;
  }

  const report = def.read(raw);
  if (!report) {
    console.log(`${REPORT_PATHS[agent]} non contiene nulla di pubblicabile: nessuno stato scritto.`);
    return;
  }

  const path = `${STATUS_DIR}/${agent}.json`;
  const merged = mergeStatus({
    agent,
    label: def.label,
    previous: readJson(path),
    report,
    runUrl: runUrl(),
  });

  fs.mkdirSync(STATUS_DIR, { recursive: true });
  fs.writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(`${path} aggiornato: ${Object.keys(report.apps).join(", ")}.`);
}

try {
  main();
} catch (e) {
  console.warn("status/build-status.mjs: errore inatteso, proseguo senza pubblicare lo stato:", e.message);
}
