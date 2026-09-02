import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  assetCard,
  predictionRows,
  predictionDetailRow,
  outcomeRows,
  outcomeDetailRow,
  ASSETS,
} from "../../fixtures/prova-page.ts";

// I dati sono reali e cambiano ogni giorno (nuove previsioni/valutazioni
// generate dalla pipeline Python): questi test verificano il COMPORTAMENTO
// (apertura/chiusura del dettaglio, contenuto minimo atteso), mai valori
// fissi come la classe predetta o la confidence di una previsione specifica
// — quelli cambiano da un giorno all'altro e non sono ciò che questa suite
// deve garantire.
test.describe("AI Predictor — dettaglio previsioni e risultati on-tap", () => {
  for (const asset of ASSETS) {
    test(`${asset}: aprire una riga di "Ultimi Segnali Generati" mostra la motivazione, richiuderla la nasconde`, async ({
      page,
    }) => {
      await gotoFresh(page);
      const card = assetCard(page, asset);
      const rows = predictionRows(page, asset);
      const count = await rows.count();

      if (count === 0) {
        await expect(card).toContainText("Nessuna predizione registrata.");
        test.skip(true, `${asset}: nessuna previsione ancora generata, nulla da espandere`);
      }

      const detail = predictionDetailRow(page, asset, 0);
      await expect(detail).toBeHidden();

      await rows.nth(0).click();
      await expect(detail).toBeVisible();
      await expect(detail).toContainText("Motivazione del modello");
      // La riga "Soglia di volatilità: ±X%" è diventata il range di prezzo
      // effettivo ("Resta FLAT se il prezzo è tra $X e $Y..."): "FLAT"
      // resta la sottostringa stabile in entrambe le forme (con o senza
      // prezzo disponibile), vedi flatRangeLine() in Prova/index.html. Ogni
      // previsione reale salvata ha sempre price_at_generation (campo
      // obbligatorio in predict_run.py), quindi il formato con i due
      // prezzi in $ è quello davvero atteso qui, non solo il fallback.
      await expect(detail).toContainText("FLAT");
      await expect(detail).toContainText(/Resta FLAT se il prezzo è tra \$[\d.,]+ e \$[\d.,]+/);

      await rows.nth(0).click();
      await expect(detail).toBeHidden();
    });

    test(`${asset}: aprire una riga di "Ultimi Risultati Valutati" mostra anche il confronto di prezzo`, async ({
      page,
    }) => {
      await gotoFresh(page);
      const card = assetCard(page, asset);
      const rows = outcomeRows(page, asset);
      const count = await rows.count();

      if (count === 0) {
        await expect(card).toContainText("Nessuna valutazione ancora.");
        test.skip(true, `${asset}: nessun esito ancora valutato`);
      }

      const detail = outcomeDetailRow(page, asset, 0);
      await rows.nth(0).click();
      await expect(detail).toBeVisible();
      await expect(detail).toContainText("prezzo reale");
      await expect(detail).toContainText("Motivazione del modello");
    });
  }
});
