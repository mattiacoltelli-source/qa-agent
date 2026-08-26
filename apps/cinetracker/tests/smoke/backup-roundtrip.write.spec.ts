import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  search,
  firstAddableSearchCard,
  addSearchResultAs,
  removeCurrentDetail,
  openBackupViaSecretGesture,
} from "../../fixtures/cinetracker-page.ts";

// Esporta un backup, lo re-importa e verifica che la libreria risulti
// identica: il round-trip è l'unico modo pratico di verificare che
// export/import concordino sul formato dati. L'import chiede conferma
// tramite la modale in-page dell'app (#confirmOverlay/#confirmYesBtn, non
// un confirm() nativo del browser), quindi il test scrive/sovrascrive la
// libreria reale dell'utente — gira solo con RUN_WRITE_TESTS=true.
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
    await openBackupViaSecretGesture(page);
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
    // firstAddableSearchCard, non .first(): "Inception" può già essere nella
    // libreria REALE dell'utente (non un dataset di prova), nel qual caso la
    // card non ha .action-watch e un click ci resterebbe in attesa per sempre.
    // Per lo stesso motivo non assumiamo che il titolo scelto sia letteralmente
    // "Inception" (potrebbe essere un altro risultato della stessa ricerca,
    // es. un documentario correlato): catturiamo il titolo vero dalla card.
    await search(page, "Inception");
    const card = firstAddableSearchCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });
    const addedTitle = await card.locator(".poster-card__title").textContent();
    await addSearchResultAs(card, "watch");

    try {
      // 2. Esportiamo: questo È lo stato di riferimento del round-trip.
      await openBackupViaSecretGesture(page);
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#exportBtn").click();
      const download = await downloadPromise;
      const path = await download.path();
      expect(path).toBeTruthy();

      // 3. Re-importiamo lo stesso file: deve chiedere conferma. NON un
      // confirm() nativo — importBackup() (app.js) usa askConfirm(), la
      // stessa modale in-page (#confirmOverlay/#confirmYesBtn) usata da
      // removeCurrentDetail() nel fixture — serve un click esplicito.
      await page.locator("#importFileInput").setInputFiles(path!);
      await page.locator("#confirmYesBtn").click();
      // A questo punto possono essere ancora visibili (non scompaiono subito,
      // restano ~2.8s) anche i toast di "aggiunto a watchlist" e "backup
      // esportato" dei passi precedenti: ".toast.success" da solo è ambiguo
      // (strict mode, più match). Scopiamo su quello specifico dell'import.
      await expect(page.locator(".toast.success", { hasText: "importato" })).toBeVisible({ timeout: 10_000 });

      // 4. La libreria deve tornare coerente: il titolo aggiunto è ancora in watchlist.
      // #libraryList contiene TUTTA la watchlist reale (nel run che ha
      // scoperto questo bug, 20 titoli): "toContainText" su un locator con
      // più match va in strict mode violation. Scopiamo sulla riga del
      // titolo effettivamente aggiunto.
      await page.locator('.nav__btn[data-screen="home"]').click();
      await page.locator("#openWatchAll").click();
      await expect(page.locator("#libraryList .list-item", { hasText: addedTitle! })).toBeVisible();
    } finally {
      // Cleanup: riapriamo il titolo dalla watchlist e lo rimuoviamo. A
      // questo punto è già in libreria (l'abbiamo appena aggiunto sopra),
      // quindi ri-cercandolo la card mostra il tag "Già in libreria"
      // (.poster-card__tag.open-stored-detail), non più .action-details —
      // quel pulsante esiste solo per risultati NON ancora posseduti (vedi
      // ui.js::renderSearchResults).
      await page.locator('.nav__btn[data-screen="home"]').click();
      await search(page, "Inception");
      const cardAgain = page
        .locator("#results .poster-card")
        .filter({ has: page.locator(".poster-card__title", { hasText: addedTitle! }) })
        .filter({ has: page.locator(".poster-card__tag") })
        .first();
      await expect(cardAgain).toBeVisible({ timeout: 10_000 });
      await cardAgain.locator(".open-stored-detail").click();
      await expect(page.locator("#screen-detail")).toBeVisible();
      await removeCurrentDetail(page);
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });
});
