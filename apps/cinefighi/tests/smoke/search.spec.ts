import { test, expect } from "@playwright/test";
import { ensureQaUserSelected } from "../../fixtures/cinefighi-page.ts";

// Ricerca TMDB dal vivo, sola lettura: nessuno di questi test aggiunge nulla
// alla libreria condivisa, quindi girano sempre (nessun gate @write).
test.describe("CineFighi — ricerca titoli (TMDB live, sola lettura)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
  });

  test("cercare un titolo noto mostra risultati con poster", async ({ page }) => {
    await page.locator("#searchInput").fill("Inception");
    await expect(page.locator("#resultsSection")).toBeVisible();
    const firstCard = page.locator("#results .poster-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    expect(await page.locator("#results .poster-card").count()).toBeGreaterThan(0);
  });

  test("cercare una stringa senza risultati mostra lo stato vuoto", async ({ page }) => {
    await page.locator("#searchInput").fill("zzxxqqnonesisteproprio123456");
    const empty = page.locator("#resultsEmpty");
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty).toHaveText(/Nessun risultato/);
  });

  test('il tab "Film" filtra il tipo di risultato (solo card con badge Film)', async ({ page }) => {
    await page.locator('.tab[data-type="movie"]').click();
    await page.locator("#searchInput").fill("Batman");
    await expect(page.locator("#results .poster-card").first()).toBeVisible({ timeout: 10_000 });
    const badgeTexts = await page.locator("#results .badge").allTextContents();
    expect(badgeTexts.length).toBeGreaterThan(0);
    for (const text of badgeTexts) expect(text).toBe("Film");
  });

  test("svuotare la ricerca nasconde di nuovo la sezione risultati", async ({ page }) => {
    const input = page.locator("#searchInput");
    await input.fill("Inception");
    await expect(page.locator("#resultsSection")).toBeVisible({ timeout: 10_000 });
    await input.fill("");
    await expect(page.locator("#resultsSection")).toBeHidden();
  });
});
