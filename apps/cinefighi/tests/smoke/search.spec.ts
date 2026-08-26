import { test, expect } from "@playwright/test";
import { ensureQaUserSelected, search } from "../../fixtures/cinefighi-page.ts";

// Ricerca TMDB dal vivo, sola lettura: nessuno di questi test aggiunge nulla
// alla libreria condivisa, quindi girano sempre (nessun gate @write).
// Da fix 45a67f8/0fbf26a: non c'è più ricerca live al variare del testo, solo
// su click "Cerca" o Invio — vedi search() nel fixture.
test.describe("CineFighi — ricerca titoli (TMDB live, sola lettura)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
  });

  test("cercare un titolo noto mostra risultati con poster", async ({ page }) => {
    await search(page, "Inception");
    await expect(page.locator("#resultsSection")).toBeVisible();
    const firstCard = page.locator("#results .poster-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    expect(await page.locator("#results .poster-card").count()).toBeGreaterThan(0);
  });

  test("cercare una stringa senza risultati mostra lo stato vuoto", async ({ page }) => {
    await search(page, "zzxxqqnonesisteproprio123456");
    const empty = page.locator("#resultsEmpty");
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty).toHaveText(/Nessun risultato/);
  });

  test('il tab "Film" filtra il tipo di risultato (solo card con badge Film)', async ({ page }) => {
    await page.locator('.tab[data-type="movie"]').click();
    await search(page, "Batman");
    await expect(page.locator("#results .poster-card").first()).toBeVisible({ timeout: 10_000 });
    const badgeTexts = await page.locator("#results .badge").allTextContents();
    expect(badgeTexts.length).toBeGreaterThan(0);
    for (const text of badgeTexts) expect(text).toBe("Film");
  });

  test("svuotare la ricerca e confermare nasconde di nuovo la sezione risultati", async ({ page }) => {
    const input = page.locator("#searchInput");
    await search(page, "Inception");
    await expect(page.locator("#resultsSection")).toBeVisible({ timeout: 10_000 });
    // Da 0fbf26a: svuotare il campo non basta più da solo, serve anche un
    // Cerca/Invio esplicito (stesso comportamento di CineTracker).
    await input.fill("");
    await page.locator("#searchBtn").click();
    await expect(page.locator("#resultsSection")).toBeHidden();
  });
});
