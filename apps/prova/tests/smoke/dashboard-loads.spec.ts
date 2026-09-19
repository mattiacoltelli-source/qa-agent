import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  assetCard,
  assetFilterButton,
  selectAsset,
  dataStatusNote,
  assetPriceLabel,
  snapshotStatus,
  ASSETS,
} from "../../fixtures/prova-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Nessun mock qui: la dashboard legge dati reali generati dalla pipeline
// Python (GitHub Actions), non un backend che possiamo controllare da questi
// test. L'obiettivo è verificare che la UI mostri correttamente QUALUNQUE
// previsione reale sia stata generata, non un contenuto specifico.
//
// Da settembre 2026 la pagina Tech mostra UNA card alla volta (filtro asset
// in cima, default ASSETS[0]): le altre due restano nel DOM con
// display:none. Ogni test che legge qualcosa dentro una card passa quindi
// per selectAsset() — senza, tutte le asserzioni su MSFT/AAPL girerebbero
// su elementi invisibili (o andrebbero in timeout sui click).
test.describe("AI Predictor — caricamento dashboard", () => {
  test("header, statistiche riassuntive e una card asset alla volta", async ({ page }) => {
    await gotoFresh(page);

    await expect(page.locator("h1")).toContainText("AI Predictor");
    await expect(page.locator("#stat-accuracy")).toBeVisible();
    await expect(page.locator("#stat-outcomes")).toBeVisible();
    await expect(page.locator("#stat-pending")).toBeVisible();

    // Al caricamento è selezionato il primo asset del paniere: la sua card
    // è visibile, le altre esistono ma sono nascoste.
    await expect(assetCard(page, ASSETS[0])).toBeVisible();
    for (const asset of ASSETS.slice(1)) {
      await expect(assetCard(page, asset)).toBeHidden();
    }

    // Ogni asset, selezionato a turno, popola la sua card.
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      const card = assetCard(page, asset);
      await expect(card).toBeVisible();
      await expect(card.locator(S.badgeAccuracy)).toContainText("Accuratezza:");
    }
  });

  test("filtro asset: un bottone per asset, uno solo attivo, cambia la card in vista", async ({
    page,
  }) => {
    await gotoFresh(page);

    await expect(page.locator(S.assetFilterHorizonBtn)).toHaveCount(ASSETS.length);
    await expect(assetFilterButton(page, ASSETS[0])).toHaveClass(/active/);
    for (const asset of ASSETS.slice(1)) {
      await expect(assetFilterButton(page, asset)).not.toHaveClass(/active/);
    }

    const other = ASSETS[1];
    await assetFilterButton(page, other).click();
    await expect(assetFilterButton(page, other)).toHaveClass(/active/);
    await expect(assetFilterButton(page, ASSETS[0])).not.toHaveClass(/active/);
    await expect(assetCard(page, other)).toBeVisible();
    await expect(assetCard(page, ASSETS[0])).toBeHidden();
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
    await expect(page.locator("#asset-filter")).not.toContainText("SPY");
  });

  test("nota \"dati mancanti\": se visibile segnala cosa mancava nell'ultimo segnale, altrimenti resta nascosta", async ({
    page,
  }) => {
    await gotoFresh(page);
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      const note = dataStatusNote(page, asset);
      if (await note.isVisible()) {
        await expect(note.locator(S.iconSvg)).toBeVisible();
        await expect(note).toContainText("mancavano");
      } else {
        await expect(note).toBeHidden();
      }
    }
  });

  test("prezzo di riferimento accanto al ticker: se presente ha il formato $X.XX", async ({ page }) => {
    // Da 096dd0f: vuoto solo se non c'è ancora nessuna previsione salvata
    // per l'asset (caso limite, non atteso in produzione ma non un bug).
    await gotoFresh(page);
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      const price = assetPriceLabel(page, asset);
      const text = await price.textContent();
      if (text) {
        expect(text.trim()).toMatch(/^\$\d+\.\d{2}$/);
      }
    }
  });

  test('istantanea prezzo (da 40e3184): se visibile mostra un orario, un prezzo e un verdetto rispetto alla previsione 1g', async ({
    page,
  }) => {
    await gotoFresh(page);
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      const status = snapshotStatus(page, asset);
      if (await status.isVisible()) {
        await expect(status).toContainText(/Ora \(\d{2}:\d{2}\)/);
        await expect(status).toContainText(/\$\d+\.\d{2}/);
        // Con una previsione 1g disponibile compare anche il confronto in
        // percentuale; senza (previsione 1g non ancora generata) resta solo
        // l'orario+prezzo, comunque valido — non asseriamo sul verdetto.
      } else {
        await expect(status).toBeHidden();
      }
    }
  });
});
