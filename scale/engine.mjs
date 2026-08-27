#!/usr/bin/env node
// Scale Agent — engine: quarto tipo di controllo automatico, insieme a QA,
// Data Health e Performance/API Doctor. Legge quanti titoli ci sono DAVVERO
// ora nella libreria condivisa di CineFighi (sola lettura, stessa chiave
// "publishable" già usata da health/projects/cinefighi.mjs — nessuna riga
// scritta o cancellata), poi testa il client con quel numero + 1000 titoli
// finti mockati (vedi scale/lib/cinefighi-scale.mjs — mai scritti sul DB
// vero, tutto renderizzato nel browser dallo stesso app.js/ui.js di
// produzione). Confronta i tempi con le soglie in scale/thresholds.mjs.
// Deterministico: nessuna chiamata AI qui (vedi scale/analyze.mjs). Scrive
// SEMPRE reports/scale-results.json.
//
// Solo CineFighi per ora: è l'unica delle tre app con una libreria condivisa
// che può crescere in modo imprevedibile (CineTracker è single-user, Spot
// non ha backend).

import fs from "node:fs";
import { chromium } from "playwright-core";

import { fetchAllRows } from "../health/lib/supabase-rest.mjs";
import { measureScale } from "./lib/cinefighi-scale.mjs";
import { THRESHOLDS } from "./thresholds.mjs";

const OUTPUT_PATH = "reports/scale-results.json";
const EXTRA_TITLES = 1000;

// Stessa chiave "publishable" hardcoded nel bundle JS di CineFighi, già
// riusata da health/projects/cinefighi.mjs e scripts/ensure-cinefighi-qa-user.mjs.
const SUPABASE_URL = "https://dxzukpujouayxlomwryc.supabase.co";
const SUPABASE_KEY = "sb_publishable_6kaInTs-_PDPHUszpj8N5w_Sb1zCXI9";

async function countRealTitles() {
  const rows = await fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "titles", { select: "id" });
  return rows.length;
}

function rollup(metrics) {
  const checks = Object.entries(THRESHOLDS).map(([key, { warn, fail }]) => {
    const value = metrics[key];
    const status = value >= fail ? "FAIL" : value >= warn ? "WARN" : "PASS";
    return { metric: key, value, warn, fail, status };
  });

  const result = checks.some((c) => c.status === "FAIL")
    ? "FAIL"
    : checks.some((c) => c.status === "WARN")
      ? "WARN"
      : "PASS";

  return { checks, result };
}

async function main() {
  const realCount = await countRealTitles();
  const targetCount = realCount + EXTRA_TITLES;

  console.log(`CineFighi: ${realCount} titoli reali ora → test a ${targetCount} titoli.`);

  const browser = await chromium.launch({
    headless: true,
    // Necessari in ambienti sandbox con proxy che ri-termina il TLS in
    // uscita (es. questo container); innocui altrove — il sito colpito è
    // pubblico, nessuna credenziale in gioco.
    args: ["--no-sandbox", "--ignore-certificate-errors"],
  });

  let report;
  try {
    const metrics = await measureScale(browser, targetCount);
    const { checks, result } = rollup(metrics);
    report = { label: "CineFighi", realCount, targetCount, metrics, checks, result };
  } catch (e) {
    report = { label: "CineFighi", realCount, targetCount, error: e.message, result: "FAIL" };
  } finally {
    await browser.close();
  }

  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), apps: { cinefighi: report } }, null, 2)
  );

  console.log(`Scale Agent: ${report.result}.`);

  if (report.result === "FAIL") process.exitCode = 1;
}

main().catch((e) => {
  console.error("scale/engine.mjs: errore inatteso:", e.message);
  process.exit(1);
});
