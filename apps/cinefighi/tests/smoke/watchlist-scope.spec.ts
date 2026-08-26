import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import { QA_USER, selectExistingUser, setWatchlistMode } from "../../fixtures/cinefighi-page.ts";

// Verifica la watchlist Home divisa Mia/Gruppo (d114b13): di default ("Io")
// mostra solo i titoli aggiunti dall'utente corrente, il toggle "Gruppo" fa
// vedere anche quelli aggiunti da altri. Sola lettura: libreria interamente
// mockata (nessuna scrittura reale su Supabase), come new-title-dot.spec.ts.

function fakeTitle(id: number, title: string, addedBy: string) {
  return {
    id,
    tmdb_id: id,
    media_type: "movie",
    title,
    year: "2024",
    poster_path: "",
    backdrop_path: "",
    overview: "",
    genre_names: [],
    director: "",
    status: "watchlist",
    added_by: addedBy,
    created_at: new Date().toISOString()
  };
}

const TITLES = [
  fakeTitle(920001, "Titolo Mio QA", QA_USER),
  fakeTitle(920002, "Titolo Di Un Amico QA", "Un Amico")
];

async function gotoFreshWithMockedLibrary(page: import("@playwright/test").Page): Promise<void> {
  await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
  await mockJson(page, /rest\/v1\/titles/, TITLES);
  await mockJson(page, /rest\/v1\/votes/, []);
  // Vedi commento gemello in new-title-dot.spec.ts: la richiesta a Google
  // Fonts fallisce sempre in sandbox e rallenta i reload ripetuti.
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
  const picked = await selectExistingUser(page, QA_USER);
  if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
}

test.describe("CineFighi — watchlist Home Mia/Gruppo", () => {
  test('di default ("Io") mostra solo i titoli aggiunti dall\'utente corrente', async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);
    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });

    await expect(page.locator("#watchShelf .shelf-card", { hasText: "Titolo Mio QA" })).toBeVisible();
    await expect(page.locator("#watchShelf .shelf-card", { hasText: "Titolo Di Un Amico QA" })).toHaveCount(0);
  });

  test('passando a "Gruppo" si vedono anche i titoli aggiunti da altri', async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);
    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });

    await setWatchlistMode(page, "group");
    await expect(page.locator("#watchShelf .shelf-card", { hasText: "Titolo Di Un Amico QA" })).toBeVisible();
    await expect(page.locator("#watchShelf .shelf-card", { hasText: "Titolo Mio QA" })).toBeVisible();
  });
});
