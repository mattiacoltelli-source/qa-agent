import { test, expect } from "@playwright/test";
import { gotoFresh, openScreen } from "../../fixtures/cinetracker-page.ts";

// Tab Report — analisi AI personale (52c529c e successivi), sola lettura:
// non tocchiamo mai #reportRefreshBtn, che invoca la funzione Supabase
// "generate-report" (una vera chiamata a Claude, a pagamento, e sovrascrive
// il report salvato per l'utente reale — vedi storage.js::regenerateReport).
// A differenza di CineFighi, qui non c'è un gate sul numero di voti: il
// bottone "Aggiorna" e il corpo del report sono sempre presenti.
test.describe("CineTracker — tab Report (sola lettura)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("aprire il tab Report mostra meta, corpo e bottone Aggiorna", async ({ page }) => {
    await openScreen(page, "report");
    await expect(page.locator("#screen-report")).toBeVisible();
    await expect(page.locator("#reportMetaLine")).toBeVisible();
    await expect(page.locator("#reportBody")).toBeVisible();
    await expect(page.locator("#reportRefreshBtn")).toBeVisible();
  });
});
