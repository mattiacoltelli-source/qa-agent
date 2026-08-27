#!/usr/bin/env node
// Security Agent — engine: sesto tipo di controllo automatico, insieme a
// QA, Data Health, Performance, API Doctor e Scale. Controlla le dipendenze
// npm di qa-agent stesso (`npm audit`) — non delle tre app web, che non
// hanno un package.json proprio: vendorizzano gli SDK come file JS già
// pronti (es. supabase-sdk.js), senza un numero di versione affidabile da
// leggere per un controllo di vulnerabilità sensato.
//
// Perché le dipendenze DI QUESTO TOOL contano: gira in CI con accesso a
// ANTHROPIC_API_KEY, ai secret Telegram e a push su GitHub — una
// dipendenza compromessa qui è un rischio reale, diverso da una libreria
// vendorizzata in un'app statica senza segreti.
//
// Deterministico: nessuna chiamata AI qui (vedi security/analyze.mjs).
// Scrive SEMPRE reports/security-results.json.

import fs from "node:fs";
import { spawnSync } from "node:child_process";

import { summarizeVulnerabilities, rollup } from "./lib/rollup.mjs";

const OUTPUT_PATH = "reports/security-results.json";

// `npm audit` esce con codice diverso da zero se trova vulnerabilità: non è
// un errore da rilanciare, è il risultato stesso del comando — l'output
// JSON su stdout resta valido in entrambi i casi.
function runNpmAudit() {
  const result = spawnSync("npm", ["audit", "--json"], { encoding: "utf-8" });
  if (!result.stdout) {
    throw new Error(`npm audit non ha prodotto output (stderr: ${result.stderr || "vuoto"})`);
  }
  return JSON.parse(result.stdout);
}

async function main() {
  let report;
  try {
    const audit = runNpmAudit();
    const counts = audit.metadata?.vulnerabilities ?? {};
    const vulnerabilities = summarizeVulnerabilities(audit);
    const result = rollup(counts);
    report = {
      label: "qa-agent (dipendenze npm)",
      counts,
      dependencies: audit.metadata?.dependencies ?? null,
      vulnerabilities,
      result,
    };
  } catch (e) {
    report = { label: "qa-agent (dipendenze npm)", error: e.message, result: "FAIL" };
  }

  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), apps: { "qa-agent": report } }, null, 2)
  );

  console.log(`Security Agent: ${report.result}.`);

  if (report.result === "FAIL") process.exitCode = 1;
}

main().catch((e) => {
  console.error("security/engine.mjs: errore inatteso:", e.message);
  process.exit(1);
});
