import { test, expect } from "@playwright/test";
import { gotoFresh, openScreen } from "../../fixtures/cinetracker-page.ts";

// "Stasera cosa guardo" legge lo storico voti REALE dell'utente su Supabase
// (CineTracker è single-user, nessun account di test separato dietro cui
// nascondersi come QA_USER in CineFighi). Da c6590d3: niente più auto-load
// all'apertura del tab (rimosso maybeAutoRecommend, come in CineFighi), il
// consiglio parte solo al click su #recommendBtn. Il test verifica che
// l'app gestisca bene ENTRAMBI gli stati possibili (libreria sotto i 3
// titoli visti → invito ad aggiungerne di più; sopra soglia → 6 consigli),
// invece di assumerne uno specifico — comunque a sola lettura.
test.describe("CineTracker — Stasera cosa guardo (TMDB discover live)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
    await openScreen(page, "tonight");
  });

  test("il pulsante consigli produce sempre un esito valido, mai un errore silenzioso o un caricamento infinito", async ({ page }) => {
    await page.locator("#recommendBtn").click();
    const result = page.locator("#tonightSuggestion");
    await expect(result).not.toContainText("Cerco qualcosa per te…", { timeout: 15_000 });

    const hint = result.locator(".tonight__hint");
    const cards = result.locator(".poster-card");
    const hintVisible = await hint.isVisible().catch(() => false);
    const cardCount = await cards.count();

    if (hintVisible) {
      // Libreria sotto i 3 titoli visti: deve invitare ad aggiungerne
      // altri, non mostrare card vuote.
      expect(cardCount).toBe(0);
    } else {
      // Libreria abbastanza popolata: fino a 6 consigli (in CineFighi sono
      // 5 — soglie diverse, verificate sul sorgente reale di ciascuna app),
      // ciascuno con una % di affinità.
      expect(cardCount).toBeGreaterThan(0);
      expect(cardCount).toBeLessThanOrEqual(6);
      await expect(cards.first().locator(".tonight-card__affinity")).toBeVisible();
    }
  });
});
