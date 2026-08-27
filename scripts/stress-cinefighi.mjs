#!/usr/bin/env node
// Stress test "scala libreria" per CineFighi: quanto regge l'app con una
// libreria molto più grande di quella reale (oggi ~15-30 titoli)? Simula N
// titoli finti (generi/voti vari) intercettando le risposte Supabase
// (rest/v1/titles|votes|users) via page.route — MAI scritti sul DB
// condiviso vero, tutto renderizzato nel browser dallo stesso app.js/ui.js
// di produzione. Nato come diagnosi una-tantum (perf/diag-scale.mjs, mai
// committato), reso permanente per rilanciarlo liberamente in futuro.
//
// Uso: node scripts/stress-cinefighi.mjs [--counts=1500,5000,10000]
//   (o via npm: npm run stress:cinefighi -- --counts=10000,15000)
// Default se omesso: 1500.
//
// Misura, per ciascun N: tempo Home pronta, apertura Libreria ("Vedi
// tutto", paginata a blocchi di LIBRARY_PAGE_SIZE via IntersectionObserver
// — vedi app.js:60/552/562), scroll attraverso più pagine, apertura
// Statistiche (renderStats calcola le medie su tutta la libreria).
//
// Ogni run viene anche accodato a reports/stress-results.json (cartella
// già in .gitignore) per confrontare run futuri senza doverli ricordare a
// mente.

import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const SITE_URL = "https://mattiacoltelli-source.github.io/CineFighi/";
const QA_USER = "_QA_Agent_";
const REPORT_PATH = new URL("../reports/stress-results.json", import.meta.url);
const GENRES = ["Thriller", "Commedia", "Azione", "Drammatico", "Fantascienza", "Horror", "Animazione", "Documentario"];

function parseCounts(argv) {
  const arg = argv.find((a) => a.startsWith("--counts=") || a.startsWith("--count="));
  if (!arg) return [1500];
  const value = arg.split("=")[1];
  return value
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function fakeTitle(id) {
  const genre = GENRES[id % GENRES.length];
  const isMovie = id % 3 !== 0;
  const isSeen = id % 2 === 0;
  return {
    id,
    tmdb_id: id,
    media_type: isMovie ? "movie" : "tv",
    title: `Titolo Stress #${id}`,
    year: String(2000 + (id % 25)),
    poster_path: "",
    backdrop_path: "",
    overview: "",
    genre_names: [genre],
    director: "",
    status: isSeen ? "seen" : "watchlist",
    added_by: id % 5 === 0 ? QA_USER : "Un Amico",
    created_at: new Date(Date.now() - id * 60_000).toISOString(),
  };
}

function buildFakeLibrary(count) {
  const titles = Array.from({ length: count }, (_, i) => fakeTitle(i + 940001));
  const votes = titles
    .filter((t) => t.status === "seen")
    .map((t) => ({
      title_id: t.id,
      user_name: t.id % 4 === 0 ? QA_USER : "Un Amico",
      vote: 4 + (t.id % 7),
    }));
  return { titles, votes };
}

async function mockJson(page, urlPattern, body) {
  await page.route(urlPattern, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
  );
}

async function runOnce(browser, count) {
  const { titles, votes } = buildFakeLibrary(count);
  const page = await browser.newPage();

  await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }, { name: "Un Amico" }]);
  await mockJson(page, /rest\/v1\/titles/, titles);
  await mockJson(page, /rest\/v1\/votes/, votes);
  // La richiesta a Google Fonts fallisce sempre in sandbox e rallenta i
  // reload — stesso motivo dei test smoke esistenti (vedi new-title-dot.spec.ts).
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  await page.goto(SITE_URL);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  let t0 = Date.now();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 15_000 });
  const existingBtn = page.locator(`.user-pick-btn[data-user="${QA_USER}"]`);
  if (await existingBtn.count()) {
    await existingBtn.first().click();
  } else {
    await page.locator("#userPickerInput").fill(QA_USER);
    await page.locator("#userPickerAddBtn").click();
  }
  await page.locator("#app").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#seenMovieShelf .shelf-card").first().waitFor({ state: "visible", timeout: 30_000 });
  const homeReadyMs = Date.now() - t0;

  t0 = Date.now();
  await page.locator("#openSeenMovies").click();
  await page.locator("#libraryList .list-item").first().waitFor({ state: "visible", timeout: 30_000 });
  const libraryFirstPageMs = Date.now() - t0;
  const initialLibraryRows = await page.locator("#libraryList > *").count();

  t0 = Date.now();
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(500);
  const scrollMs = Date.now() - t0;
  const libraryRowsAfterScroll = await page.locator("#libraryList > *").count();

  await page.locator("#libraryBackBtn").click();

  t0 = Date.now();
  await page.locator('.nav__btn[data-screen="stats"]').click();
  await page.locator("#genreBars .bar-row").first().waitFor({ state: "visible", timeout: 30_000 });
  const statsReadyMs = Date.now() - t0;

  await page.close();

  return {
    count,
    homeReadyMs,
    libraryFirstPageMs,
    initialLibraryRows,
    scrollMs,
    libraryRowsAfterScroll,
    statsReadyMs,
  };
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
    // --no-sandbox e --ignore-certificate-errors servono in questo
    // ambiente sandbox (proxy che ri-termina il TLS in uscita); innocui
    // altrove — il sito colpito è pubblico, nessuna credenziale in gioco.
    args: ["--no-sandbox", "--ignore-certificate-errors"],
  });

  const results = [];
  try {
    for (const count of counts) {
      console.log(`\n→ N = ${count}…`);
      const result = await runOnce(browser, count);
      results.push(result);
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
