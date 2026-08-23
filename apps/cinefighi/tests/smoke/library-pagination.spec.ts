import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import { QA_USER, selectExistingUser } from "../../fixtures/cinefighi-page.ts";

// Verifica il caricamento progressivo di "Vedi tutto" (app.js::renderLibraryScreen/
// renderNextLibraryPage/observeLibrarySentinel): con una libreria grande, la lista
// non deve più disegnare tutti gli elementi in un colpo solo, ma un primo blocco
// (LIBRARY_PAGE_SIZE = 40) e aggiungere il resto man mano che si scorre.
// Sola lettura: libreria interamente mockata con 250 titoli finti, impossibile
// da garantire (e da mantenere pulita) sulla libreria condivisa vera.

function fakeTitle(id: number, mediaType: "movie" | "tv") {
  return {
    id, tmdb_id: id, media_type: mediaType,
    title: `Titolo QA ${id}`, year: "2024", poster_path: "", backdrop_path: "",
    overview: "", genre_names: ["Drama"], director: "", status: "seen",
    added_by: "Un Amico", created_at: new Date().toISOString()
  };
}

// 200 film + 50 serie TV, tutti "visti": abbastanza per superare ampiamente
// una singola pagina (40) più volte.
const TITLES = [
  ...Array.from({ length: 200 }, (_, i) => fakeTitle(900000 + i, "movie")),
  ...Array.from({ length: 50 }, (_, i) => fakeTitle(901000 + i, "tv"))
];

async function gotoFreshWithMockedLibrary(page: import("@playwright/test").Page): Promise<void> {
  await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
  await mockJson(page, /rest\/v1\/titles/, TITLES);
  await mockJson(page, /rest\/v1\/votes/, []);
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
  const picked = await selectExistingUser(page, QA_USER);
  if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
  await page.locator("#watchShelf .shelf-card, #seenMovieShelf .shelf-card").first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

test.describe("CineFighi — caricamento progressivo di \"Vedi tutto\"", () => {
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

    // Scorre ripetutamente fino in fondo alla pagina finché la lista non si
    // stabilizza (tutti i blocchi caricati) o si raggiunge un tetto di tentativi.
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

    await page.locator('.filter-pill[data-filter="tv"]').click();
    await page.waitForTimeout(300);

    const rendered = await page.locator("#libraryList .list-item").count();
    // Le 50 serie TV mockate, non sommate ai 200 film già visti prima del cambio filtro.
    expect(rendered).toBeLessThanOrEqual(50);
    expect(rendered).toBeGreaterThan(0);
  });
});
