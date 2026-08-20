import { test, expect } from "@playwright/test";
import { ensureQaUserSelected } from "../../fixtures/cinefighi-page.ts";

// Questi test SCRIVONO sul database Supabase condiviso dal gruppo CineFighi:
// le credenziali sono hardcoded nel bundle JS dell'app, quindi non esiste un
// modo di puntarla a un backend di test senza modificare l'app stessa (vedi
// README di questa cartella). Girano solo se esplicitamente richiesti
// (RUN_WRITE_TESTS=true / npm run test:write), usano sempre l'utente di test
// QA_USER, e ripuliscono ogni titolo creato in un blocco finally. Se il
// cleanup dovesse fallire a metà test, il residuo è comunque riconoscibile
// (aggiunto da "_QA_Agent_" con il commento "Voto di test automatico (QA)")
// e rimovibile a mano dall'app.
test.describe("CineFighi — voto e libreria @write", () => {
  test.skip(
    process.env.RUN_WRITE_TESTS !== "true",
    "Test di scrittura disattivati di default: scrivono sul DB condiviso del gruppo. " +
      "Esegui con RUN_WRITE_TESTS=true (npm run test:write) per abilitarli."
  );

  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
  });

  test("aggiungere un titolo, votarlo e rimuoverlo aggiorna correttamente la libreria condivisa", async ({
    page,
  }) => {
    const expectedVote = "8.5";

    await page.locator("#searchInput").fill("Inception");
    const firstCard = page.locator("#results .poster-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.locator('button[data-status="seen"]').click();

    // handleAddFromSearch apre automaticamente il dettaglio del titolo appena salvato.
    await expect(page.locator("#screen-detail")).toBeVisible();

    try {
      // Slider 0–10 step 0.5: il valore mostrato deve corrispondere esattamente.
      await page.locator("#detailVoteSlider").fill(expectedVote);
      await page.locator("#detailCommentInput").fill("Voto di test automatico (QA)");
      await page.locator("#detailSaveVoteBtn").click();

      await expect(page.locator("#detailVoteValue")).toHaveText(expectedVote);

      const myVoteRow = page.locator(".vote-row", { hasText: "(tu)" });
      await expect(myVoteRow).toBeVisible();
      await expect(myVoteRow.locator(".vote-row__score")).toHaveText(expectedVote);
    } finally {
      await page.locator("#detailRemoveBtn").click();
      await page.locator("#confirmYesBtn").click();
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });

  test("rimuovere il proprio voto lo toglie dalla lista voti senza rimuovere il titolo", async ({ page }) => {
    await page.locator("#searchInput").fill("Inception");
    const firstCard = page.locator("#results .poster-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.locator('button[data-status="seen"]').click();
    await expect(page.locator("#screen-detail")).toBeVisible();

    try {
      await page.locator("#detailVoteSlider").fill("6");
      await page.locator("#detailSaveVoteBtn").click();
      await expect(page.locator(".vote-row", { hasText: "(tu)" })).toBeVisible();

      await page.locator("#detailClearVoteBtn").click();
      await expect(page.locator(".vote-row", { hasText: "(tu)" })).toHaveCount(0);
      // Il titolo resta in libreria (non torna alla schermata home).
      await expect(page.locator("#screen-detail")).toBeVisible();
    } finally {
      await page.locator("#detailRemoveBtn").click();
      await page.locator("#confirmYesBtn").click();
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });
});
