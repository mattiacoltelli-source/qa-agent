#!/usr/bin/env node
// Script diagnostico TEMPORANEO, non parte del sistema di monitoraggio
// permanente: indaga la causa dell'LCP a 4s di CineTracker (visto in
// perf-results.json) con lo stesso identico Lighthouse/emulazione di
// perf/engine.mjs, ma senza il taglio a "5 topAudits" — qui serve vedere
// l'elemento LCP esatto, le risorse che bloccano il render, e il timeline
// di rete completo. Da rimuovere dal repo una volta chiusa l'indagine.

import fs from "node:fs";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright-core";

const URL = "https://mattiacoltelli-source.github.io/Cos90/";

async function main() {
  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });

  try {
    const result = await lighthouse(URL, {
      port: chrome.port,
      output: "json",
      onlyCategories: ["performance"],
    });

    const lhr = result.lhr;
    fs.mkdirSync("reports", { recursive: true });
    fs.writeFileSync("reports/cinetracker-lhr-full.json", JSON.stringify(lhr, null, 2));

    const out = [];
    out.push(`runtimeError: ${JSON.stringify(lhr.runtimeError)}`);
    out.push(`LCP: ${lhr.audits["largest-contentful-paint"]?.displayValue}`);
    out.push(`FCP: ${lhr.audits["first-contentful-paint"]?.displayValue}`);
    out.push("");
    out.push("=== LCP element ===");
    out.push(JSON.stringify(lhr.audits["largest-contentful-paint-element"]?.details?.items, null, 2));
    out.push("");
    out.push("=== Render-blocking resources ===");
    out.push(JSON.stringify(lhr.audits["render-blocking-resources"]?.details?.items, null, 2));
    out.push("");
    out.push("=== Network requests (ordinate per startTime) ===");
    const reqs = (lhr.audits["network-requests"]?.details?.items || []).sort((a, b) => a.startTime - b.startTime);
    for (const r of reqs) {
      out.push(
        `${r.startTime.toFixed(0)}ms -> ${r.endTime.toFixed(0)}ms | ${r.resourceType} | ${((r.transferSize || 0) / 1024).toFixed(1)}KB | ${r.url}`
      );
    }
    out.push("");
    out.push("=== Bootup time (JS execution) ===");
    out.push(JSON.stringify(lhr.audits["bootup-time"]?.details?.items, null, 2));
    out.push("");
    out.push("=== Main thread work breakdown ===");
    out.push(JSON.stringify(lhr.audits["mainthread-work-breakdown"]?.details?.items, null, 2));

    fs.writeFileSync("reports/cinetracker-lcp-diagnosis.txt", out.join("\n"));
    console.log(out.join("\n"));
  } finally {
    await chrome.kill();
  }
}

main();
