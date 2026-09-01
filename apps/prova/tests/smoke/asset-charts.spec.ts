import { test, expect } from "@playwright/test";
import { gotoFresh, chartDetails, accuracyChartWrap, priceChartWrap, ASSETS } from "../../fixtures/prova-page.ts";

// Il grafico accuratezza è sempre in vista; i grafici prezzo (principale +
// per orizzonte) sono dentro <details> collassato di default — ciascuno può
// mostrare un canvas Chart.js o un messaggio "nessun dato" a seconda di
// quante previsioni sono già state valutate (dato reale, cambia ogni
// giorno): i test verificano che il CONTENITORE mostri sempre qualcosa di
// sensato (canvas o empty-state), non quale dei due casi si applichi oggi.
test.describe("AI Predictor — grafici per asset", () => {
  for (const asset of ASSETS) {
    test(`${asset}: grafico accuratezza visibile, dettagli prezzo collassati di default e apribili`, async ({
      page,
    }) => {
      await gotoFresh(page);

      await expect(accuracyChartWrap(page, asset).locator("canvas, .chart-empty")).toHaveCount(1);
      await expect(accuracyChartWrap(page, asset)).toBeVisible();

      const details = chartDetails(page, asset);
      await expect(details).not.toHaveJSProperty("open", true);

      await details.locator("summary").click();
      await expect(details).toHaveJSProperty("open", true);
      await expect(priceChartWrap(page, asset)).toBeVisible();
      await expect(priceChartWrap(page, asset).locator("canvas, .chart-empty")).toHaveCount(1);

      for (const horizon of ["1d", "7d", "1m"] as const) {
        const wrap = priceChartWrap(page, asset, horizon);
        await expect(wrap).toBeVisible();
        await expect(wrap.locator("canvas, .chart-empty")).toHaveCount(1);
      }
    });
  }
});
