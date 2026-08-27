#!/usr/bin/env node
// TEMP: diagnostica mirata sull'LCP di CineTracker (4.3s contro 1.5s di
// CineFighi nell'ultimo run Performance Agent) — quale elemento è il
// "largest contentful paint" e cosa lo ritarda. Stesso identico Lighthouse
// già usato da perf/engine.mjs, solo con l'audit largest-contentful-paint-element
// e network-requests letti per intero invece di scartati. Da rimuovere
// insieme al workflow temporaneo che lo lancia una volta chiusa l'indagine.

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

    const audits = result.lhr.audits;
    const lcpEl = audits["largest-contentful-paint-element"];
    const lcpBreakdown = audits["lcp-lantern-breakdown"] ?? audits["largest-contentful-paint-element"];

    console.log("=== LCP value ===");
    console.log(audits["largest-contentful-paint"]?.displayValue);

    console.log("\n=== largest-contentful-paint-element ===");
    console.log(JSON.stringify(lcpEl?.details?.items ?? lcpEl, null, 2));

    console.log("\n=== Element render delay breakdown (se presente) ===");
    const phases = audits["largest-contentful-paint-element"]?.details?.items?.find((i) => i.phases)?.phases;
    console.log(JSON.stringify(phases ?? "n/d", null, 2));

    console.log("\n=== Top 10 network-requests per endTime ===");
    const reqs = (audits["network-requests"]?.details?.items ?? [])
      .slice()
      .sort((a, b) => (b.endTime ?? 0) - (a.endTime ?? 0))
      .slice(0, 10)
      .map((r) => ({
        url: r.url,
        startTime: Math.round(r.startTime),
        endTime: Math.round(r.endTime),
        transferSize: r.transferSize,
        resourceType: r.resourceType,
      }));
    console.log(JSON.stringify(reqs, null, 2));

    console.log("\n=== render-blocking-resources ===");
    console.log(JSON.stringify(audits["render-blocking-resources"]?.details?.items ?? [], null, 2));
  } finally {
    await chrome.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
