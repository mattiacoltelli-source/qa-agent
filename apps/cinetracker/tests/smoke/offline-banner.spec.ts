import { test, expect } from "@playwright/test";
import { gotoFresh } from "../../fixtures/cinetracker-page.ts";

// Simula la perdita/ripristino di connessione con context.setOffline(): non
// scrive nulla su Supabase, gira sempre (nessun gate @write).
test.describe("CineTracker — banner offline", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("andare offline mostra il banner, tornare online lo rimuove con un toast", async ({ page, context }) => {
    await context.setOffline(true);
    const banner = page.locator("#offlineBanner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("offline");

    await context.setOffline(false);
    await expect(banner).toBeHidden();
    await expect(page.locator(".toast.success")).toContainText("Connessione ripristinata");
  });

  test("una ricerca avviata da offline viene rifiutata subito, senza tentare la chiamata di rete", async ({
    page,
    context,
  }) => {
    await context.setOffline(true);
    await page.locator("#searchInput").fill("Inception");
    await page.locator("#searchBtn").click();
    await expect(page.locator(".toast.error")).toContainText(/offline/i);
    await context.setOffline(false);
  });
});
