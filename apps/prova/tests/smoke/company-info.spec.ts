import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  selectAsset,
  assetCard,
  companyInfoPanel,
  openRoboticsPage,
  selectRoboticsAsset,
  roboticsCard,
  ROBOTICS_ASSETS,
  ASSETS,
} from "../../fixtures/prova-page.ts";

// Da c5dd80a: ogni card (Tech e Trend strutturali) ha una tendina "Info
// azienda" con dati statici verificati a mano (COMPANY_INFO in index.html:
// sede, anno di fondazione, settore, borsa, descrizione). Non essendo
// generata da nessuna API, il contenuto è stabile e si può asserire — è la
// sola parte della dashboard dove questo vale.
test.describe("AI Predictor — tendina \"Info azienda\" per card", () => {
  test("Tech: chiusa di default, si apre e mostra sede/fondazione/settore/borsa", async ({
    page,
  }) => {
    await gotoFresh(page);
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      const panel = companyInfoPanel(assetCard(page, asset));
      await expect(panel).toHaveCount(1);
      await expect(panel).not.toHaveJSProperty("open", true);

      await panel.locator("summary").click();
      await expect(panel).toHaveJSProperty("open", true);

      const body = panel.locator(".info-panel-body");
      await expect(body).toContainText("Sede:");
      await expect(body).toContainText("Fondata:");
      await expect(body).toContainText("Settore:");
      await expect(body).toContainText("Quotata:");
    }
  });

  test("Trend strutturali: la tendina include i fondamentali dallo snapshot, o dice perché no", async ({
    page,
  }) => {
    // Da df8b040 i fondamentali non sono più una costante nel frontend: li
    // legge da data/tradingview/fundamentals.json. Da 17802cb, se lo
    // snapshot ha più di FUNDAMENTALS_MAX_AGE_MONTHS mesi la UI li nasconde
    // da sola e lo dichiara, invece di mostrare multipli vecchi come se
    // fossero attuali. Entrambi gli esiti sono corretti: dipende da quando
    // è stato preso l'ultimo snapshot a mano, non dal codice.
    await gotoFresh(page);
    await openRoboticsPage(page);

    for (const { key, label } of ROBOTICS_ASSETS) {
      await selectRoboticsAsset(page, key);
      const panel = companyInfoPanel(roboticsCard(page, key));
      await panel.locator("summary").click();
      const body = panel.locator(".info-panel-body");
      await expect(body).toContainText("Settore:");

      const text = (await body.textContent()) ?? "";
      const hasFundamentals = text.includes("Fondamentali");
      const hiddenForAge = text.includes("Fondamentali nascosti automaticamente");
      const notLoaded = text.includes("Fondamentali non caricati");
      expect(
        hasFundamentals || hiddenForAge || notLoaded,
        `${label}: nessuna delle tre forme attese per il blocco fondamentali`
      ).toBe(true);

      if (hasFundamentals && !hiddenForAge) {
        // Snapshot fresco: i multipli ci sono e la fonte è dichiarata con
        // la sua data, per non far sembrare un feed una fotografia datata.
        await expect(body).toContainText("Capitalizzazione:");
        await expect(body).toContainText(/snapshot del \d{4}-\d{2}-\d{2}/);
      }
    }
  });
});
