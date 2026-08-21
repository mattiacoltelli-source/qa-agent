#!/usr/bin/env node
// Performance Agent — engine: per ogni app, lancia Lighthouse (headless,
// via lo stesso Chromium già installato per il QA Agent — nessun browser
// nuovo da scaricare) contro l'URL live e confronta i punteggi con le
// soglie in perf/thresholds.mjs. Deterministico: nessuna chiamata AI qui
// (vedi perf/analyze.mjs). Scrive SEMPRE reports/perf-results.json.
//
// URL e label delle app sono importati da health/projects/ (non
// duplicati): sono pure config, condivise dai due moduli.
//
// Lighthouse gira in modalità mobile di default (le tre app sono PWA usate
// principalmente da telefono, stessa premessa del QA Agent).

import fs from "node:fs";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright-core";

import * as cinefighi from "../health/projects/cinefighi.mjs";
import * as cinetracker from "../health/projects/cinetracker.mjs";
import * as vacanza from "../health/projects/vacanza.mjs";
import { THRESHOLDS } from "./thresholds.mjs";

const PROJECTS = { cinefighi, cinetracker, vacanza };
const ALIASES = { spot: "vacanza" };

const OUTPUT_PATH = "reports/perf-results.json";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

// Le 5 metriche "Core Web Vitals" che compongono davvero il punteggio
// performance (pesi in playwright.config.ts non c'entrano, sono di
// Lighthouse: LCP 25%, TBT 30%, CLS 25%, FCP 10%, SI 10%). Il punteggio
// 0-100 da solo non dice DOVE va il tempo — queste sì.
const PERFORMANCE_METRICS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
];

async function runLighthouse(url) {
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });

  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      onlyCategories: CATEGORIES,
    });

    if (result.lhr.runtimeError) {
      throw new Error(`Lighthouse non è riuscito a caricare la pagina: ${result.lhr.runtimeError.message}`);
    }

    // TEMP: diagnostica LCP per capire perché CineTracker e Spot hanno un
    // LCP molto più alto di CineFighi — da rimuovere subito dopo l'analisi.
    const LCP_DEBUG_IDS = [
      "largest-contentful-paint-element",
      "lcp-lazy-loaded",
      "prioritize-lcp-image",
      "uses-optimized-images",
      "modern-image-formats",
      "render-blocking-resources",
      "unsized-images",
      "third-party-summary",
    ];
    console.log(`\n=== LCP DEBUG: ${url} ===`);
    for (const id of LCP_DEBUG_IDS) {
      const a = result.lhr.audits[id];
      if (!a) continue;
      console.log(
        JSON.stringify({ id, score: a.score, displayValue: a.displayValue, details: a.details }, null, 2)
      );
    }
    console.log(`=== FINE LCP DEBUG: ${url} ===\n`);

    const scores = Object.fromEntries(
      CATEGORIES.map((cat) => [cat, Math.round(result.lhr.categories[cat].score * 100)])
    );

    // Valori grezzi (non il punteggio) delle 5 metriche che compongono
    // "performance": permettono di capire DOVE va il tempo, non solo il
    // numero finale — fondamentale per confrontare due app diverse.
    const metrics = Object.fromEntries(
      PERFORMANCE_METRICS.map((id) => [id, result.lhr.audits[id]?.displayValue ?? null])
    );

    // Le 5 voci con il punteggio audit più basso, già in linguaggio
    // semi-umano prodotto da Lighthouse stesso. Calcolate SEMPRE, anche se
    // l'app è PASS (è solo un filtro locale su dati che Lighthouse ha già
    // prodotto, costo zero) — servono sia da contesto grezzo per Claude
    // quando c'è un'anomalia, sia da riferimento nel JSON per decidere come
    // stringere le soglie più avanti, anche su un run tutto verde.
    const topAudits = Object.values(result.lhr.audits)
      .filter((a) => typeof a.score === "number" && a.score < 0.9)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((a) => a.title);

    return { scores, metrics, topAudits };
  } finally {
    await chrome.kill();
  }
}

function rollup(scores) {
  const failing = CATEGORIES.filter((cat) => scores[cat] < THRESHOLDS[cat]);
  if (failing.length === 0) return "PASS";
  // Più di 20 punti sotto soglia su almeno una categoria: FAIL, altrimenti WARN.
  const severe = failing.some((cat) => THRESHOLDS[cat] - scores[cat] >= 20);
  return severe ? "FAIL" : "WARN";
}

async function checkProject(project) {
  try {
    const { scores, metrics, topAudits } = await runLighthouse(project.url);
    return {
      label: project.label,
      url: project.url,
      scores,
      thresholds: THRESHOLDS,
      metrics,
      topAudits,
      result: rollup(scores),
    };
  } catch (e) {
    return { label: project.label, url: project.url, error: e.message, result: "FAIL" };
  }
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
    apps[name] = await checkProject(project);
  }

  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), apps }, null, 2));

  const failed = Object.values(apps).filter((a) => a.result === "FAIL").length;
  const warned = Object.values(apps).filter((a) => a.result === "WARN").length;
  console.log(`Performance: ${Object.keys(apps).length} app controllate — ${failed} FAIL, ${warned} WARN.`);
}

main().catch((e) => {
  console.error("perf/engine.mjs: errore inatteso:", e.message);
  process.exit(1);
});
