import { test, expect } from "@playwright/test";
import { clearBrowserStorage, seedLocalStorage } from "../../../../core/storage.ts";
import { abortRoute } from "../../../../core/network.ts";

// Verifica il caricamento progressivo di "Vedi tutto" (app.js::doRenderLibrary/
// renderNextLibraryPage/observeLibrarySentinel): con un archivio grande, la
// lista non deve più disegnare tutti gli elementi in un colpo solo, ma un
// primo blocco (LIBRARY_PAGE_SIZE = 40) e aggiungere il resto man mano che
// si scorre.
// CineTracker è "local-first" (storage.js::loadDB legge subito la cache
// locale, poi sincronizza Supabase in background): seedando direttamente la
// cache e bloccando Supabase controlliamo con precisione la libreria mostrata,
// senza toccare mai l'archivio personale reale né dipendere dalla rete.

function fakeItem(id: number, mediaType: "movie" | "tv") {
  return {
    id, tmdb_id: id, media_type: mediaType, title: `Titolo QA ${id}`, year: "2024",
    poster_path: "", backdrop_path: "", overview: "", genre_names: ["Drama"],
    director: "", vote: "8", comment: ""
  };
}

// 200 film + 50 serie TV, tutti "visti"; watchlist vuota (usata anche per
// verificare che il reset della paginazione non lasci elementi fantasma).
const SEEN = [
  ...Array.from({ length: 200 }, (_, i) => fakeItem(900000 + i, "movie")),
  ...Array.from({ length: 50 }, (_, i) => fakeItem(901000 + i, "tv"))
];
const CACHE = JSON.stringify({ version: 1, data: { seen: SEEN, watchlist: [] } });

async function gotoFreshWithMockedLibrary(page: import("@playwright/test").Page): Promise<void> {
  // Bloccata del tutto per evitare che il sync in background sovrascriva la
  // cache locale mockata con l'archivio reale dell'utente.
  await abortRoute(page, /supabase\.co/);
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  await page.goto(".");
  await clearBrowserStorage(page);
  await seedLocalStorage(page, "cineTrackerDBCache", CACHE);
  await page.reload();
  await page.locator(".app.app--ready").waitFor({ state: "attached", timeout: 10_000 });
}

test.describe("CineTracker — caricamento progressivo di \"Vedi tutto\"", () => {
  test("apertura iniziale renderizza solo il primo blocco, non tutti i 200 titoli", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await page.locator("#openSeenMovies").click();
    await page.locator("#screen-library").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#libraryList .list-item").first().waitFor({ state: "visible", timeout: 10_000 });

    const rendered = await page.locator("#libraryList .list-item").count();
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(200); // non tutto subito
  });

  test("scorrere fino in fondo carica progressivamente il resto della lista", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await page.locator("#openSeenMovies").click();
    await page.locator("#screen-library").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#libraryList .list-item").first().waitFor({ state: "visible", timeout: 10_000 });

    const initialCount = await page.locator("#libraryList .list-item").count();

    let count = initialCount;
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(300);
      const next = await page.locator("#libraryList .list-item").count();
      if (next === count) break;
      count = next;
    }

    expect(count).toBeGreaterThan(initialCount); // ha caricato altro scorrendo
    expect(count).toBe(200); // e alla fine tutti i film sono arrivati
  });

  test("cambiare filtro azzera la paginazione invece di sommarsi ai risultati precedenti", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await page.locator("#openSeenMovies").click();
    await page.locator("#screen-library").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#libraryList .list-item").first().waitFor({ state: "visible", timeout: 10_000 });

    await page.locator('.filter-pill[data-filter="series"]').click();
    await page.waitForTimeout(300);

    const rendered = await page.locator("#libraryList .list-item").count();
    // Le 50 serie TV mockate, non sommate ai 200 film già visti prima del cambio filtro.
    expect(rendered).toBeLessThanOrEqual(50);
    expect(rendered).toBeGreaterThan(0);
  });

  test("tornare su una watchlist vuota dopo aver visto un archivio pieno non lascia elementi fantasma", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await page.locator("#openSeenMovies").click();
    await page.locator("#screen-library").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#libraryList .list-item").first().waitFor({ state: "visible", timeout: 10_000 });

    await page.locator("#libraryBackBtn").click();
    await page.locator("#screen-home").waitFor({ state: "visible", timeout: 10_000 });
    await page.locator("#openWatchAll").click();
    await page.locator("#screen-library").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(300);

    await expect(page.locator("#libraryList .list-item")).toHaveCount(0);
    await expect(page.locator("#libraryEmpty")).toBeVisible();
  });
});
