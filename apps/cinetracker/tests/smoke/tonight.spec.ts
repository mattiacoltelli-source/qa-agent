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
    // Il testo di caricamento reale (app.js) è "🔍 Sto cercando 6 titoli
    // adatti…", non quello genericamente immaginato qui prima — con la
    // stringa sbagliata questo expect non aspettava mai davvero la fine del
    // caricamento: risolveva quasi subito, lasciando una finestra in cui
    // hintVisible/cardCount potevano essere letti a metà del re-render
    // (hint ancora visto "vero" da un check, card già arrivate per
    // l'altro) — causa di un fallimento reale in CI (hintVisible true e
    // cardCount 6 insieme).
    await expect(result).not.toContainText("Sto cercando", { timeout: 15_000 });

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
