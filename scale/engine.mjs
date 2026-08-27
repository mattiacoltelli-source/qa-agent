#!/usr/bin/env node
// Scale Agent — engine: quarto tipo di controllo automatico, insieme a QA,
// Data Health e Performance/API Doctor. Legge quanti titoli ci sono DAVVERO
// ora nella libreria condivisa di CineFighi (sola lettura, stessa chiave
// "publishable" già usata da health/projects/cinefighi.mjs — nessuna riga
// scritta o cancellata), poi testa il client con quel numero + un extra di
// titoli finti mockati (default 1000, configurabile — vedi sotto; mai
// scritti sul DB vero, tutto renderizzato nel browser dallo stesso
// app.js/ui.js di produzione, vedi scale/lib/cinefighi-scale.mjs).
// Confronta i tempi con le soglie in scale/thresholds.mjs.
// Deterministico: nessuna chiamata AI qui (vedi scale/analyze.mjs). Scrive
// SEMPRE reports/scale-results.json.
//
// Solo CineFighi per ora: è l'unica delle tre app con una libreria condivisa
// che può crescere in modo imprevedibile (CineTracker è single-user, Spot
// non ha backend).
//
// L'extra di titoli è scelto al lancio (workflow_dispatch.inputs.extra_titles
// in .github/workflows/scale.yml, passato come argv[2]) — default 1000 se
// omesso o non un intero positivo valido. Le soglie in scale/thresholds.mjs
// restano tarate sull'uso tipico (~1000): un extra molto più grande può
// legittimamente finire in WARN/FAIL senza essere una regressione reale.

import fs from "node:fs";
import { chromium } from "playwright-core";

import { fetchAllRows } from "../health/lib/supabase-rest.mjs";
import { measureScale } from "./lib/cinefighi-scale.mjs";
import { parseExtraTitles, rollup } from "./lib/rollup.mjs";

const OUTPUT_PATH = "reports/scale-results.json";

// Stessa chiave "publishable" hardcoded nel bundle JS di CineFighi, già
// riusata da health/projects/cinefighi.mjs e scripts/ensure-cinefighi-qa-user.mjs.
const SUPABASE_URL = "https://dxzukpujouayxlomwryc.supabase.co";
const SUPABASE_KEY = "sb_publishable_6kaInTs-_PDPHUszpj8N5w_Sb1zCXI9";

async function countRealTitles() {
  const rows = await fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "titles", { select: "id" });
  return rows.length;
}

async function main() {
  const extraTitles = parseExtraTitles(process.argv[2]);
  const realCount = await countRealTitles();
  const targetCount = realCount + extraTitles;

  console.log(`CineFighi: ${realCount} titoli reali ora + ${extraTitles} → test a ${targetCount} titoli.`);

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
    report = { label: "CineFighi", realCount, extraTitles, targetCount, metrics, checks, result };
  } catch (e) {
    report = { label: "CineFighi", realCount, extraTitles, targetCount, error: e.message, result: "FAIL" };
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
