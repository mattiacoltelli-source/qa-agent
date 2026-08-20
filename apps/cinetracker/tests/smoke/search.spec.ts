import { test, expect } from "@playwright/test";
import { gotoFresh, search } from "../../fixtures/cinetracker-page.ts";

// Ricerca TMDB dal vivo, sola lettura: nessuno di questi test salva nulla
// nella libreria, quindi girano sempre (nessun gate @write).
test.describe("CineTracker — ricerca titoli (TMDB live, sola lettura)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("cercare un titolo noto mostra risultati con conteggio", async ({ page }) => {
    await search(page, "Inception");
    await expect(page.locator("#results .poster-card").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#resultCount")).toContainText("risultati");
  });

  test("cercare senza risultati mostra lo stato vuoto", async ({ page }) => {
    await search(page, "zzxxqqnonesisteproprio123456");
    const empty = page.locator("#resultsEmpty");
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty).toHaveText(/Nessun risultato/);
  });

  test("le azioni rapide di una card di ricerca sono nascoste finché non si tocca il poster", async ({ page }) => {
    await search(page, "Batman");
    const card = page.locator("#results .poster-card").first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).not.toHaveClass(/is-actions-open/);
    await card.locator(".poster-card__img").click();
    await expect(card).toHaveClass(/is-actions-open/);
  });

  test("svuotare la ricerca nasconde di nuovo la sezione risultati", async ({ page }) => {
    const input = page.locator("#searchInput");
    await search(page, "Inception");
    await expect(page.locator("#resultsSection")).toBeVisible({ timeout: 10_000 });
    await input.fill("");
    await page.locator("#searchBtn").click();
    await expect(page.locator("#resultsSection")).toBeHidden();
  });
});
