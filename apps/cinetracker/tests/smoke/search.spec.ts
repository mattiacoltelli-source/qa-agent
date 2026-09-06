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

  test("le azioni rapide di una card di ricerca sono visibili senza dover toccare il poster", async ({ page }) => {
    // Da commit 10d43e3 (Cos90): i pulsanti Watchlist/Visto sono sempre
    // visibili sulla card, non più a comparsa al tap sul poster — un solo
    // tocco per aggiungere invece di tap-per-rivelare-poi-tap-per-aggiungere.
    await search(page, "Batman");
    const card = page.locator("#results .poster-card").first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.locator(".action-watch")).toBeVisible();
    await expect(card.locator(".action-seen")).toBeVisible();
  });

  test("svuotare la ricerca nasconde di nuovo la sezione risultati", async ({ page }) => {
    const input = page.locator("#searchInput");
    await search(page, "Inception");
    await expect(page.locator("#resultsSection")).toBeVisible({ timeout: 10_000 });
    await input.fill("");
    await page.locator("#searchBtn").click();
    await expect(page.locator("#resultsSection")).toBeHidden();
  });

  // Da 1019421/2c79418: la "X" (#searchClearBtn) appare solo quando il campo
  // ha del testo, e uno svuotamento con quel tasto riporta campo e risultati
  // allo stato vuoto senza bisogno di ripremere Cerca.
  test('la "X" di svuotamento ricerca appare solo con testo e ripulisce campo e risultati in un tap', async ({
    page,
  }) => {
    const input = page.locator("#searchInput");
    const clearBtn = page.locator("#searchClearBtn");
    const wrap = page.locator(".search-input-wrap");

    await expect(clearBtn).toBeHidden();
    await expect(wrap).not.toHaveClass(/has-value/);

    await search(page, "Inception");
    await expect(page.locator("#resultsSection")).toBeVisible({ timeout: 10_000 });
    await expect(clearBtn).toBeVisible();
    await expect(wrap).toHaveClass(/has-value/);

    await clearBtn.click();
    await expect(input).toHaveValue("");
    await expect(clearBtn).toBeHidden();
    await expect(wrap).not.toHaveClass(/has-value/);
    await expect(page.locator("#resultsSection")).toBeHidden();
  });
});
