import { test, expect } from "@playwright/test";
import { mockJson } from "../../../../core/network.ts";
import { gotoFresh } from "../../fixtures/cinetracker-page.ts";

// Da 0ebf3b3: watchlist e visti sono ora ordinati più recenti-prima
// (cine-core.js::sortBySavedAtDesc, applicata in storage.js::syncFromSupabase
// a ogni lettura da Supabase) — prima la lista rifletteva l'ordine, non
// garantito, in cui Postgres restituiva le righe. renderHomeShelves() e
// doRenderLibrary() (app.js) non riordinano nulla da sole: usano l'array
// così com'è, quindi l'ordine corretto dipende interamente da questo fix.
//
// Sola lettura ma interamente mockata (stessa tecnica di stats.spec.ts):
// serve un ordine noto in anticipo, impossibile da garantire sulla libreria
// reale dell'utente. Le righe mock arrivano DISORDINATE (non già per
// savedAt) apposta, per dimostrare che è l'app a riordinare e non una
// coincidenza dell'ordine con cui sono state scritte qui.

function fakeItem(id: number, title: string, savedAt: string, mediaType: "movie" | "tv" = "movie") {
  return {
    id, tmdb_id: id, media_type: mediaType, title, year: "2024",
    poster_path: "", backdrop_path: "", overview: "", genre_names: [], savedAt
  };
}

const OLD = fakeItem(950001, "QA Ordine Vecchio", "2026-08-01T10:00:00.000Z");
const MID = fakeItem(950002, "QA Ordine Medio", "2026-09-10T10:00:00.000Z");
const NEW = fakeItem(950003, "QA Ordine Nuovo", "2026-09-25T10:00:00.000Z");

async function gotoFreshWithMockedLibrary(
  page: import("@playwright/test").Page,
  rows: { list: "seen" | "watchlist"; data: ReturnType<typeof fakeItem> }[]
): Promise<void> {
  await mockJson(page, /rest\/v1\/Coltel/, rows);
  await gotoFresh(page);
}

test.describe("CineTracker — ordine cronologico di watchlist e visti", () => {
  test("shelf Watchlist in home: più recente per primo, non l'ordine in cui arrivano da Supabase", async ({
    page,
  }) => {
    // Ordine di arrivo deliberatamente mescolato: MID, OLD, NEW.
    await gotoFreshWithMockedLibrary(page, [
      { list: "watchlist", data: MID },
      { list: "watchlist", data: OLD },
      { list: "watchlist", data: NEW },
    ]);

    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator("#watchShelf .shelf-card__title")).toHaveText([
      "QA Ordine Nuovo",
      "QA Ordine Medio",
      "QA Ordine Vecchio",
    ]);
  });

  test('"Vedi tutto" sulla watchlist mantiene lo stesso ordine della shelf in home', async ({ page }) => {
    // Ordine di arrivo mescolato di nuovo, diverso da quello del primo test
    // (OLD, MID, NEW qui) — se capitasse già ordinato per coincidenza, il
    // test passerebbe anche senza il fix e non proverebbe nulla.
    await gotoFreshWithMockedLibrary(page, [
      { list: "watchlist", data: OLD },
      { list: "watchlist", data: NEW },
      { list: "watchlist", data: MID },
    ]);

    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#openWatchAll").click();
    await page.locator("#screen-library").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#libraryList .list-item").first().waitFor({ state: "visible", timeout: 10_000 });

    await expect(page.locator("#libraryList .list-item__title")).toHaveText([
      "QA Ordine Nuovo",
      "QA Ordine Medio",
      "QA Ordine Vecchio",
    ]);
  });

  test("shelf Film visti in home: stesso ordine cronologico della watchlist", async ({ page }) => {
    const oldMovie = fakeItem(950004, "QA Visto Vecchio", "2026-08-05T10:00:00.000Z", "movie");
    const newMovie = fakeItem(950005, "QA Visto Nuovo", "2026-09-20T10:00:00.000Z", "movie");

    await gotoFreshWithMockedLibrary(page, [
      { list: "seen", data: oldMovie },
      { list: "seen", data: newMovie },
    ]);

    await page.locator("#seenMovieShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator("#seenMovieShelf .shelf-card__title")).toHaveText([
      "QA Visto Nuovo",
      "QA Visto Vecchio",
    ]);
  });
});
