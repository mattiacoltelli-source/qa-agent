import { test, expect } from "@playwright/test";
import { gotoFresh, grantGeolocation } from "../../fixtures/vacanza-page.ts";
import { mockWeatherApis, WEATHER_PROFILES } from "../../fixtures/weather-mock.ts";

test.describe("Spot — Cosa vedo ora", () => {
  test("con posizione nota, suggerisce uno spot e apre direttamente il dettaglio", async ({ page, context }) => {
    await grantGeolocation(context, 38.9, 20.3); // centro rotta Ionio
    await mockWeatherApis(page, WEATHER_PROFILES.clear);
    await gotoFresh(page);

    await page.locator("#cosaOraBtn").click();
    await expect(page.locator("#page-detail")).toHaveClass(/active/, { timeout: 10_000 });
    await expect(page.locator("#spotDetail .detail-title")).not.toBeEmpty();
    await expect(page.locator("#cosaOraGpsHint")).not.toHaveClass(/visible/);
  });

  test(
    "senza permesso di geolocalizzazione, mostra comunque un suggerimento " +
      "(comportamento PREVISTO: fallback a 'risultati generali', non un blocco)",
    async ({ page }) => {
      // Nessun grantGeolocation: getCurrentPosition va in errore/negato.
      await mockWeatherApis(page, WEATHER_PROFILES.clear);
      await gotoFresh(page);

      await page.locator("#cosaOraBtn").click();
      await expect(page.locator("#cosaOraGpsHint")).toHaveClass(/visible/, { timeout: 10_000 });
      await expect(page.locator("#cosaOraGpsHint")).toContainText("Posizione non disponibile");
      // Nonostante l'assenza di GPS, un suggerimento arriva comunque.
      await expect(page.locator("#page-detail")).toHaveClass(/active/, { timeout: 10_000 });
      await expect(page.locator("#spotDetail .detail-title")).not.toBeEmpty();
    }
  );

  test("cambiare la finestra temporale (es. 2h) prima di chiedere il suggerimento è rispettato", async ({
    page,
    context,
  }) => {
    await grantGeolocation(context, 38.9, 20.3);
    await mockWeatherApis(page, WEATHER_PROFILES.clear);
    await gotoFresh(page);

    await page.locator("#cosaOraTrigger").click();
    await page.locator('.cosa-ora-option[data-min="120"]').click();
    await expect(page.locator("#cosaOraSelected")).toHaveText("2h");

    await page.locator("#cosaOraBtn").click();
    await expect(page.locator("#page-detail")).toHaveClass(/active/, { timeout: 10_000 });
  });
});
