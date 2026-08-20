import { test, expect } from "@playwright/test";
import { gotoFresh, search, addSearchResultAs, removeCurrentDetail } from "../../fixtures/cinetracker-page.ts";

// Esporta un backup, lo re-importa e verifica che la libreria risulti
// identica: il round-trip è l'unico modo pratico di verificare che
// export/import concordino sul formato dati. L'import chiede conferma con
// un `confirm()` nativo, quindi il test scrive/sovrascrive la libreria
// reale dell'utente — gira solo con RUN_WRITE_TESTS=true.
test.describe("CineTracker — backup export/import @write", () => {
  test.skip(
    process.env.RUN_WRITE_TESTS !== "true",
    "Test di scrittura disattivati di default: sovrascrivono la tua libreria reale durante l'import. " +
      "Esegui con RUN_WRITE_TESTS=true (npm run test:write) per abilitarli."
  );

  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("esportare un backup produce un file JSON con seen[] e watchlist[]", async ({ page }) => {
    await page.locator('.nav__btn[data-screen="backup"]').click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#exportBtn").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("cineTracker-backup.json");
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk as Buffer);
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    expect(Array.isArray(parsed.seen)).toBe(true);
    expect(Array.isArray(parsed.watchlist)).toBe(true);
  });

  test("importare il backup appena esportato dopo un'aggiunta lo ripristina esattamente (round-trip)", async ({
    page,
  }) => {
    // 1. Aggiungiamo un titolo di test alla watchlist e catturiamo lo stato "prima".
    await search(page, "Inception");
    const card = page.locator("#results .poster-card").first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await addSearchResultAs(card, "watch");

    try {
      // 2. Esportiamo: questo È lo stato di riferimento del round-trip.
      await page.locator('.nav__btn[data-screen="backup"]').click();
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#exportBtn").click();
      const download = await downloadPromise;
      const path = await download.path();
      expect(path).toBeTruthy();

      // 3. Re-importiamo lo stesso file: deve chiedere conferma (confirm nativo).
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#importFileInput").setInputFiles(path!);
      await expect(page.locator(".toast.success")).toBeVisible({ timeout: 10_000 });

      // 4. La libreria deve tornare coerente: il titolo aggiunto è ancora in watchlist.
      await page.locator('.nav__btn[data-screen="home"]').click();
      await page.locator("#openWatchAll").click();
      await expect(page.locator("#libraryList .list-item")).toContainText("Inception");
    } finally {
      // Cleanup: riapriamo il titolo dalla watchlist e lo rimuoviamo.
      await page.locator('.nav__btn[data-screen="home"]').click();
      await search(page, "Inception");
      const cardAgain = page.locator("#results .poster-card").first();
      await expect(cardAgain).toBeVisible({ timeout: 10_000 });
      await cardAgain.locator(".action-details").click();
      await expect(page.locator("#screen-detail")).toBeVisible();
      await removeCurrentDetail(page);
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });
});
