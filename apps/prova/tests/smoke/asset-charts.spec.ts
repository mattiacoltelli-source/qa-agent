import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  selectAsset,
  chartDetails,
  accuracyChartWrap,
  priceChartWrap,
  ASSETS,
} from "../../fixtures/prova-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Il grafico accuratezza è sempre in vista; i grafici prezzo (principale +
// per orizzonte) sono dentro <details> collassato di default — ciascuno può
// mostrare un canvas Chart.js o un messaggio "nessun dato" a seconda di
// quante previsioni sono già state valutate (dato reale, cambia ogni
// giorno): i test verificano che il CONTENITORE mostri sempre qualcosa di
// sensato (canvas o empty-state), non quale dei due casi si applichi oggi.
//
// selectAsset() prima di tutto: la pagina mostra una card alla volta, e un
// canvas dentro una card display:none nasce con larghezza 0 (Chart.js misura
// il contenitore alla creazione) — è proprio il caso che applyAssetFilter()
// corregge con chart.resize(), quindi passare dal filtro è anche il modo di
// verificare che quella correzione funzioni.
test.describe("AI Predictor — grafici per asset", () => {
  for (const asset of ASSETS) {
    test(`${asset}: grafico accuratezza visibile, dettagli prezzo collassati di default e apribili`, async ({
      page,
    }) => {
      await gotoFresh(page);
      await selectAsset(page, asset);

      await expect(accuracyChartWrap(page, asset).locator(S.canvasChartEmpty)).toHaveCount(1);
      await expect(accuracyChartWrap(page, asset)).toBeVisible();

      const details = chartDetails(page, asset);
      await expect(details).not.toHaveJSProperty("open", true);

      await details.locator(S.summary).click();
      await expect(details).toHaveJSProperty("open", true);
      await expect(priceChartWrap(page, asset)).toBeVisible();
      await expect(priceChartWrap(page, asset).locator(S.canvasChartEmpty)).toHaveCount(1);

      for (const horizon of ["1d", "7d", "1m"] as const) {
        const wrap = priceChartWrap(page, asset, horizon);
        await expect(wrap).toBeVisible();
        await expect(wrap.locator(S.canvasChartEmpty)).toHaveCount(1);
      }
    });
  }
});
