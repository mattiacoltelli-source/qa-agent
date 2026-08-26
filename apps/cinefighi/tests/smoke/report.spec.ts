import { test, expect } from "@playwright/test";
import { ensureQaUserSelected, openScreen } from "../../fixtures/cinefighi-page.ts";

// Tab Report — analisi AI personale (dcd2ce1), sola lettura: non tocchiamo
// mai #reportRefreshBtn, che invoca la funzione Supabase "generate-report"
// (una vera chiamata a Claude, a pagamento, e scrive su user_report per
// l'utente corrente — vedi storage.js). Verifichiamo solo che il tab si apra
// e mostri uno stato coerente: sotto le 50 votazioni (MIN_VOTED_FOR_REPORT)
// c'è il gate "vota abbastanza titoli", altrimenti il corpo del report —
// mai nessuno dei due o entrambi insieme (app.js::renderReportScreen).
test.describe("CineFighi — tab Report (sola lettura)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
  });

  test("aprire il tab Report mostra il gate o il report, mai uno stato ambiguo", async ({ page }) => {
    await openScreen(page, "report");
    await expect(page.locator("#screen-report")).toBeVisible();

    const gate = page.locator("#reportGate");
    const body = page.locator("#reportBody");
    const gateHidden = await gate.evaluate((el) => el.classList.contains("hidden"));
    const bodyHidden = await body.evaluate((el) => el.classList.contains("hidden"));
    expect(gateHidden).not.toBe(bodyHidden);
  });
});
