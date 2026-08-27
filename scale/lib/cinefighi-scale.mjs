// Libreria condivisa per il test di scala di CineFighi: genera N titoli
// finti coerenti (generi/voti vari) e li mocka via page.route su una
// istanza reale dell'app (rest/v1/titles|votes|users) — MAI scritti sul DB
// condiviso vero, tutto renderizzato nel browser dallo stesso app.js/ui.js
// di produzione. Usata sia da scale/engine.mjs (Scale Agent automatico,
// N = titoli reali + 1000) sia da scripts/stress-cinefighi.mjs (uso
// manuale ad-hoc, N a scelta) — stessa logica, un solo posto da aggiornare
// se cambiano i selettori DOM dell'app.

export const SITE_URL = "https://mattiacoltelli-source.github.io/CineFighi/";
export const QA_USER = "_QA_Agent_";

const GENRES = ["Thriller", "Commedia", "Azione", "Drammatico", "Fantascienza", "Horror", "Animazione", "Documentario"];

function fakeTitle(id) {
  const genre = GENRES[id % GENRES.length];
  const isMovie = id % 3 !== 0;
  const isSeen = id % 2 === 0;
  return {
    id,
    tmdb_id: id,
    media_type: isMovie ? "movie" : "tv",
    title: `Titolo Scala #${id}`,
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

export function buildFakeLibrary(count) {
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

// Lancia una pagina fresca su CineFighi con la libreria mockata a `count`
// titoli e misura: tempo Home pronta, apertura Libreria ("Vedi tutto",
// paginata a blocchi di LIBRARY_PAGE_SIZE=40 via IntersectionObserver —
// vedi app.js:60/552/562), scroll attraverso più pagine, apertura
// Statistiche (renderStats calcola le medie su tutta la libreria).
export async function measureScale(browser, count) {
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
