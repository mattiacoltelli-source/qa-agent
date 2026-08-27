import { test, expect } from "@playwright/test";
import { gotoFresh, openScreen } from "../../fixtures/cinetracker-page.ts";
import { mockJson } from "../../../../core/network.ts";

// Tab Report — analisi AI personale (52c529c e successivi), sola lettura:
// non tocchiamo mai #reportRefreshBtn, che invoca la funzione Supabase
// "generate-report" (una vera chiamata a Claude, a pagamento, e sovrascrive
// il report salvato per l'utente reale — vedi storage.js::regenerateReport).
// A differenza di CineFighi, qui non c'è un gate sul numero di voti: il
// bottone "Aggiorna" e il corpo del report sono sempre presenti.
//
// Da 1c671e0: renderReport() chiama SEMPRE maybeAutoRefreshReport() al solo
// aprire il tab, indipendentemente dal click su "Aggiorna" — se il report
// reale in Supabase ha più di 6 mesi, aprire questa schermata triggererebbe
// da sola la stessa chiamata reale e a pagamento che stiamo evitando col
// bottone. clearBrowserStorage() (in gotoFresh) svuota anche la cache
// locale del report ad ogni test, quindi non c'è modo di "restare" sulla
// cache vecchia: mockiamo la lettura di monthly_report con un generated_at
// sempre di oggi, così l'auto-refresh non scatta mai — a prescindere da
// quanto sia vecchio il report vero.
test.describe("CineTracker — tab Report (sola lettura)", () => {
  test.beforeEach(async ({ page }) => {
    await mockJson(page, /rest\/v1\/monthly_report/, [
      {
        generated_at: new Date().toISOString(),
        payload: { profile: [], genres_note: "", directors: [], recommendations: [] },
      },
    ]);
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
