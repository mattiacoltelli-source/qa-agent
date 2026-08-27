import { test, expect } from "@playwright/test";
import { ensureQaUserSelected, openScreen } from "../../fixtures/cinefighi-page.ts";

// "Stasera cosa guardo" legge lo storico voti REALE di QA_USER su Supabase,
// che persiste tra una run e l'altra (i test @write puliscono i titoli che
// aggiungono, ma non c'è garanzia assoluta che lo storico voti sia sempre
// vuoto). Il test quindi verifica che l'app gestisca bene ENTRAMBI gli stati
// possibili (profilo vuoto → invito a votare; profilo popolato → 5 consigli),
// invece di assumerne uno specifico — è comunque un test a sola lettura.
test.describe("CineFighi — Stasera cosa guardo (TMDB discover live)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
    await openScreen(page, "tonight");
  });

  test("il pulsante consigli produce sempre un esito valido, mai un errore silenzioso o un caricamento infinito", async ({ page }) => {
    await page.locator("#tonightBtn").click();
    const result = page.locator("#tonightResult");
    // Il testo di caricamento reale (app.js) è "🔍 Sto cercando 6 titoli
    // adatti…" — stesso fix del file gemello in CineTracker
    // (tonight.spec.ts), dove la stringa sbagliata ha causato un
    // fallimento reale in CI (hintVisible letto a metà del re-render).
    await expect(result).not.toContainText("Sto cercando", { timeout: 15_000 });

    const hint = result.locator(".tonight__hint");
    const cards = result.locator(".poster-card");
    const hintVisible = await hint.isVisible().catch(() => false);
    const cardCount = await cards.count();

    if (hintVisible) {
      // Profilo senza voti: deve invitare a votare, non mostrare card vuote.
      expect(cardCount).toBe(0);
    } else {
      // Profilo con voti: al massimo 5 consigli, ciascuno con % di affinità.
      expect(cardCount).toBeGreaterThan(0);
      expect(cardCount).toBeLessThanOrEqual(5);
      await expect(cards.first().locator(".tonight-card__affinity")).toBeVisible();
    }
  });
});
