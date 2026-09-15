import { test, expect } from "@playwright/test";
import { ensureQaUserSelected, firstPreviewableSearchCard, search } from "../../fixtures/cinefighi-page.ts";

// Copre la "scheda di consultazione" (previewItem in app.js): un percorso
// del dettaglio completamente separato da quello di un titolo già in
// libreria (openDetail), raggiunto da ".poster-card__scheda.open-preview"
// ("Scheda →") su un risultato di ricerca non ancora salvato — invece dei
// bottoni rapidi Watchlist/Visto. Zero copertura precedente nonostante 3
// dei 5 commit più recenti sul dettaglio (3c8eb22/b5dae80/926031c/05a7ff1)
// abbiano toccato proprio questo stato (openPreview in app.js).
//
// Scrive sul DB condiviso del gruppo come voting.write.spec.ts — stesse
// regole: solo con RUN_WRITE_TESTS=true, sempre con QA_USER, cleanup in
// finally, residuo riconoscibile in caso di crash a metà test.
test.describe("CineFighi — scheda di consultazione (previewItem) @write", () => {
  test.skip(
    process.env.RUN_WRITE_TESTS !== "true",
    "Test di scrittura disattivati di default: scrivono sul DB condiviso del gruppo. " +
      "Esegui con RUN_WRITE_TESTS=true (npm run test:write) per abilitarli."
  );

  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
  });

  test('"Scheda →" su un risultato di ricerca apre la consultazione con i bottoni della modalità preview', async ({
    page
  }) => {
    await search(page, "Inception");
    const firstCard = firstPreviewableSearchCard(page);
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.locator(".open-preview").click();

    await expect(page.locator("#screen-detail")).toBeVisible({ timeout: 10_000 });
    // Stato "preview" (openPreview in app.js): un solo bottone voto a tutta
    // riga che promuove direttamente a "visto", niente "Aggiorna voto" né
    // "Rimuovi" (il titolo non esiste ancora in libreria).
    await expect(page.locator("#detailSaveVoteBtn")).toHaveText("✓ Salva voto (segna come visto)");
    await expect(page.locator("#detailSaveVoteBtn")).toHaveClass(/btn--full-row/);
    await expect(page.locator("#detailClearVoteBtn")).toBeHidden();
    // Da 05a7ff1: niente più cuore davanti al testo.
    await expect(page.locator("#detailStatusBtn")).toHaveText("Aggiungi a watchlist");
    await expect(page.locator("#detailStatusBtn")).toHaveClass(/\bbtn\b/);
    await expect(page.locator("#detailStatusBtn")).not.toHaveClass(/btn-link-quiet/);
    await expect(page.locator("#detailRemoveBtn")).toBeHidden();
    await expect(page.locator("#detailPrimaryActions")).not.toHaveClass(/detail-primary-actions--seen/);

    // Uscire dalla scheda senza salvare non deve creare nulla in libreria:
    // nessun cleanup necessario per questo test, è puramente di lettura.
  });

  test('salvare un voto dalla scheda di consultazione promuove il titolo a "visto" (promotePreviewItem)', async ({
    page
  }) => {
    const expectedVote = "7.5";
    await search(page, "Inception");
    const firstCard = firstPreviewableSearchCard(page);
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.locator(".open-preview").click();
    await expect(page.locator("#screen-detail")).toBeVisible({ timeout: 10_000 });

    try {
      await page.locator("#detailVoteSlider").fill(expectedVote);
      await page.locator("#detailCommentInput").fill("Voto di test automatico (QA)");
      await page.locator("#detailSaveVoteBtn").click();

      await expect(page.locator("#toastWrap .toast .toast__text")).toHaveText("Voto salvato");
      // handleSaveVote riapre il dettaglio con push:false sullo stesso
      // titolo, ora però come titolo salvato "seen": i bottoni tornano allo
      // stato normale di openDetail (non più quello di previewItem).
      await expect(page.locator("#screen-detail")).toBeVisible();
      await expect(page.locator("#detailVoteValue")).toHaveText(expectedVote);
      await expect(page.locator("#detailSaveVoteBtn")).toHaveText("Aggiorna voto");
      await expect(page.locator("#detailRemoveBtn")).toBeVisible();
      await expect(page.locator("#detailRemoveBtn")).toHaveText("Rimuovi");
    } finally {
      await page.locator("#detailRemoveBtn").click();
      await page.locator("#confirmYesBtn").click();
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });

  test('"Aggiungi a watchlist" dalla scheda di consultazione promuove il titolo a "watchlist" (promotePreviewItem)', async ({
    page
  }) => {
    await search(page, "Inception");
    const firstCard = firstPreviewableSearchCard(page);
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.locator(".open-preview").click();
    await expect(page.locator("#screen-detail")).toBeVisible({ timeout: 10_000 });

    const title = await page.locator("#detailTitle").textContent();

    try {
      await page.locator("#detailStatusBtn").click();

      await expect(page.locator("#toastWrap .toast .toast__text")).toHaveText(`${title} aggiunto alla watchlist`);
      await expect(page.locator("#screen-detail")).toBeVisible();
      // Titolo ora salvato come "watchlist" normale: stessi bottoni di un
      // qualunque altro titolo in watchlist (openDetail, non più preview).
      await expect(page.locator("#detailStatusBtn")).toHaveText("✓ Segna come visto");
      await expect(page.locator("#detailRemoveBtn")).toHaveText("Rimuovi dalla mia watchlist");
    } finally {
      // Titolo status "watchlist": handleRemove salta la conferma pesante e
      // va dritto a "home" (vedi stesso caso già gestito in
      // voting.write.spec.ts per il test di demote).
      await page.locator("#detailRemoveBtn").click();
      const confirmShown = await page
        .locator("#confirmOverlay")
        .waitFor({ state: "visible", timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (confirmShown) {
        await page.locator("#confirmYesBtn").click();
      }
      await expect(page.locator("#screen-home")).toBeVisible({ timeout: 10_000 });
    }
  });
});
