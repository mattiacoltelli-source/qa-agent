import { test, expect } from "@playwright/test";
import { gotoFresh } from "../../fixtures/vacanza-page.ts";
import { mockWeatherApis, mockWeatherOutage, WEATHER_PROFILES } from "../../fixtures/weather-mock.ts";

// Il meteo è SEMPRE mockato qui: le 3 API (forecast/marine/sunrise-sunset)
// determinano headline, advice e i punteggi di ranking — lasciarle live
// renderebbe questi test diversi ogni giorno. Vedi apps/vacanza/README.md.
// Importante: il mock va installato PRIMA di gotoFresh (page.route deve
// essere attivo già alla prima navigazione, non dopo).
test.describe("Spot — pannello meteo (mockato)", () => {
  test("giornata serena: headline e statistiche coerenti con i dati mockati", async ({ page }) => {
    await mockWeatherApis(page, WEATHER_PROFILES.clear);
    await gotoFresh(page);

    const alert = page.locator("#weatherAlert");
    await expect(alert).toContainText("Cielo sereno", { timeout: 10_000 });
    await expect(alert).toContainText("luce ottima per foto");

    const stats = page.locator("#statsGrid .stat");
    await expect(stats).toHaveCount(4);
    await expect(page.locator("#statsGrid")).toContainText("27°");
    await expect(page.locator("#statsGrid")).toContainText("10 km/h");
  });

  test("pioggia probabile: avviso coerente, consiglio di portare l'impermeabile", async ({ page }) => {
    await mockWeatherApis(page, WEATHER_PROFILES.rainy);
    await gotoFresh(page);

    const alert = page.locator("#weatherAlert");
    await expect(alert).toContainText("Pioggia probabile", { timeout: 10_000 });
    await expect(alert).toContainText("porta impermeabile");
  });

  test("vento forte: avviso a valutare ancoraggi riparati", async ({ page }) => {
    await mockWeatherApis(page, WEATHER_PROFILES.windy);
    await gotoFresh(page);

    await expect(page.locator("#weatherAlert")).toContainText("vento forte", { timeout: 10_000 });
  });

  test("API meteo tutte giù: l'app degrada a 'Meteo non disponibile', senza crash né dati inventati", async ({
    page,
  }) => {
    await mockWeatherOutage(page);
    await gotoFresh(page);

    const alert = page.locator("#weatherAlert");
    await expect(alert).toHaveText("Meteo non disponibile.", { timeout: 10_000 });
    await expect(alert).toHaveClass(/warn/);
    // Le statistiche mostrano placeholder, non zeri o "NaN".
    await expect(page.locator("#statsGrid")).not.toContainText("NaN");
    await expect(page.locator("#statsGrid")).toContainText("—");
  });
});
