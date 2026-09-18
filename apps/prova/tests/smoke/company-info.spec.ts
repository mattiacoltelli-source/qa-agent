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
    // legge da data/tradingview/fundamentals.json. Tre esiti possibili,
    // tutti legittimi (dipendono da quando/se è stato preso a mano un
    // primo snapshot per quel ticker, non dal codice):
    // 1. Asset del tutto ASSENTE da fundamentals.json (fundamentalsHtml()
    //    in index.html: `if (!a) return '';`) — nessun messaggio, il
    //    blocco fondamentali semplicemente non compare. Legittimo per un
    //    asset appena aggiunto al paniere (nVent Electric/NVT, 2026-09-18)
    //    prima del suo primo snapshot manuale.
    // 2. Presente ma con snapshot vecchio (`17802cb`, oltre
    //    FUNDAMENTALS_MAX_AGE_MONTHS mesi): la UI lo nasconde da sola e lo
    //    dichiara esplicitamente, invece di mostrare multipli vecchi come
    //    se fossero attuali.
    // 3. Presente e fresco: i multipli veri, con fonte e data dichiarate.
    // Nota: i testi dei casi 2 e 3-nascosto contengono entrambi la
    // sottostringa "Fondamentali" (è lo stesso messaggio) — per questo il
    // caso 1 si riconosce per ASSENZA di quella parola, non cercandone
    // un'altra.
    await gotoFresh(page);
    await openRoboticsPage(page);

    for (const { key, label } of ROBOTICS_ASSETS) {
      await selectRoboticsAsset(page, key);
      const panel = companyInfoPanel(roboticsCard(page, key));
      await panel.locator("summary").click();
      const body = panel.locator(".info-panel-body");
      await expect(body).toContainText("Settore:");

      const text = (await body.textContent()) ?? "";
      if (!text.includes("Fondamentali")) {
        // Caso 1: nessuno snapshot preso ancora per questo ticker.
        continue;
      }
      if (text.includes("Fondamentali nascosti automaticamente") || text.includes("Fondamentali non caricati")) {
        // Caso 2: presente ma dichiarato vecchio/non caricato, già
        // spiegato dal messaggio stesso.
        continue;
      }

      // Caso 3: snapshot fresco — i multipli ci sono e la fonte è
      // dichiarata con la sua data, per non far sembrare un feed una
      // fotografia datata.
      await expect(body).toContainText("Capitalizzazione:");
      await expect(body).toContainText(/snapshot del \d{4}-\d{2}-\d{2}/);
    }
  });
});
