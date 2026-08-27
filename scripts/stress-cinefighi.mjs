#!/usr/bin/env node
// Stress test manuale "scala libreria" per CineFighi, a conteggi scelti a
// mano — usa la stessa libreria del sistema automatico che gira insieme
// agli altri agenti (vedi scale/engine.mjs e scale/lib/cinefighi-scale.mjs,
// che testa sempre "titoli reali + 1000" ad ogni run schedulato). Qui invece
// scegli tu N liberamente, per un'indagine ad-hoc.
//
// Uso: node scripts/stress-cinefighi.mjs [--counts=1500,5000,10000]
//   (o via npm: npm run stress:cinefighi -- --counts=10000,15000)
// Default se omesso: 1500.
//
// Mai scritto sul DB condiviso vero: la libreria è interamente mockata via
// page.route (rest/v1/titles|votes|users).
//
// Ogni run viene anche accodato a reports/stress-results.json (cartella
// già in .gitignore) per confrontare run futuri senza doverli ricordare a
// mente.

import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { measureScale } from "../scale/lib/cinefighi-scale.mjs";

const REPORT_PATH = new URL("../reports/stress-results.json", import.meta.url);

function parseCounts(argv) {
  const arg = argv.find((a) => a.startsWith("--counts=") || a.startsWith("--count="));
  if (!arg) return [1500];
  const value = arg.split("=")[1];
  return value
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function appendReport(results) {
  mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
  const existing = existsSync(REPORT_PATH) ? JSON.parse(readFileSync(REPORT_PATH, "utf8")) : [];
  const runAt = new Date().toISOString();
  existing.push(...results.map((r) => ({ runAt, ...r })));
  writeFileSync(REPORT_PATH, JSON.stringify(existing, null, 2));
}

function printTable(results) {
  console.log("\n=== Stress test scala libreria — CineFighi ===\n");
  console.table(
    results.map((r) => ({
      "N titoli": r.count,
      "Home pronta (ms)": r.homeReadyMs,
      "Libreria 1a pagina (ms)": r.libraryFirstPageMs,
      "Righe iniziali": r.initialLibraryRows,
      "Scroll 12x (ms)": r.scrollMs,
      "Righe dopo scroll": r.libraryRowsAfterScroll,
      "Statistiche pronte (ms)": r.statsReadyMs,
    }))
  );
}

async function main() {
  const counts = parseCounts(process.argv.slice(2));
  console.log(`Conteggi da testare: ${counts.join(", ")}`);

  const browser = await chromium.launch({
    headless: true,
    // --no-sandbox e --ignore-certificate-errors servono in ambienti
    // sandbox con proxy che ri-termina il TLS in uscita; innocui altrove —
    // il sito colpito è pubblico, nessuna credenziale in gioco.
    args: ["--no-sandbox", "--ignore-certificate-errors"],
  });

  const results = [];
  try {
    for (const count of counts) {
      console.log(`\n→ N = ${count}…`);
      results.push(await measureScale(browser, count));
    }
  } finally {
    await browser.close();
  }

  printTable(results);
  appendReport(results);
  console.log(`\nRun accodato a reports/stress-results.json (${results.length} righe).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
