import { test, expect } from "@playwright/test";
import { gotoFresh, assetCard, dataStatusNote, ASSETS } from "../../fixtures/prova-page.ts";

// Nessun mock qui: la dashboard legge dati reali generati dalla pipeline
// Python (GitHub Actions), non un backend che possiamo controllare da questi
// test. L'obiettivo è verificare che la UI mostri correttamente QUALUNQUE
// previsione reale sia stata generata, non un contenuto specifico.
test.describe("AI Predictor — caricamento dashboard", () => {
  test("header, statistiche riassuntive e le tre card asset sono visibili", async ({ page }) => {
    await gotoFresh(page);

    await expect(page.locator("h1")).toContainText("AI Predictor");
    await expect(page.locator("#stat-accuracy")).toBeVisible();
    await expect(page.locator("#stat-outcomes")).toBeVisible();
    await expect(page.locator("#stat-pending")).toBeVisible();

    for (const asset of ASSETS) {
      const card = assetCard(page, asset);
      await expect(card).toBeVisible();
      await expect(card.locator(".badge-accuracy")).toContainText("Accuratezza:");
    }
  });

  test("il banner di aggiornamento PWA resta nascosto quando non c'è una versione in attesa", async ({
    page,
  }) => {
    await gotoFresh(page);
    // Primo caricamento in un browser context pulito: nessun service worker
    // precedente, quindi showUpdateBanner() non viene mai chiamato.
    await expect(page.locator("#updateBanner")).toBeHidden();
  });

  test("SPY non compare più: rimosso dal paniere attivo, resta solo storico nel repo", async ({
    page,
  }) => {
    await gotoFresh(page);
    await expect(page.locator("#assets-grid")).not.toContainText("SPY");
  });

  test("nota \"dati mancanti\": se visibile segnala cosa mancava nell'ultimo segnale, altrimenti resta nascosta", async ({
    page,
  }) => {
    await gotoFresh(page);
    for (const asset of ASSETS) {
      const note = dataStatusNote(page, asset);
      if (await note.isVisible()) {
        await expect(note).toContainText("⚠️");
        await expect(note).toContainText("mancavano");
      } else {
        await expect(note).toBeHidden();
      }
    }
  });
});
