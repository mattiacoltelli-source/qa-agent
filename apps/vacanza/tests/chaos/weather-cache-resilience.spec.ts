import { test, expect } from "@playwright/test";
import { clearBrowserStorage, seedLocalStorage } from "../../../../core/storage.ts";
import { abortRoute } from "../../../../core/network.ts";

// "Chaos test" (vedi apps/cinetracker/tests/chaos/ per la spiegazione della
// categoria). Distinto dal test "API meteo tutte giù" già presente in
// weather-panel.spec.ts: lì la cache è fredda (nessun dato precedente) e
// l'esito atteso è "Meteo non disponibile". Qui invece c'è già una cache
// meteo valida e recente (<3h) in localStorage — loadWeather() (app.js) ha
// una logica dedicata apposta per questo caso: "non azzeriamo dati meteo
// validi solo perché QUESTO aggiornamento è fallito". Non era ancora
// testato con un vero fallimento di rete (qui abortRoute, non un mock
// 200/500) su tutte e 3 le API meteo/mare/sole.
test.describe("Spot — cache meteo preservata durante un'interruzione di rete", () => {
  test("con una cache meteo valida, un'interruzione di rete non cancella i dati già mostrati", async ({
    page,
  }) => {
    const cache = {
      version: 1,
      timestamp: Date.now() - 5 * 60 * 1000,
      weatherData: {
        temp: 27,
        wind: 10,
        windDir: 300,
        gust: 14,
        cloud: 10,
        rain: 5,
        headline: "Cielo sereno — ottima giornata",
        advice: "luce ottima per foto",
      },
      marineData: { waveHeight: 0.3, waveDirection: 200, wavePeriod: 4 },
      hourlyData: [],
      sunTimes: null,
    };

    await abortRoute(page, /api\.open-meteo\.com\/v1\/forecast/);
    await abortRoute(page, /marine-api\.open-meteo\.com\/v1\/marine/);
    await abortRoute(page, /api\.sunrise-sunset\.org\/json/);

    await page.goto(".");
    await clearBrowserStorage(page);
    await seedLocalStorage(page, "weather_cache", JSON.stringify(cache));
    await page.reload();
    await page.locator("#page-home").waitFor({ state: "visible", timeout: 10_000 });

    // loadWeatherFromCache() mostra subito i dati cache; il tentativo di
    // refresh in background fallisce, ma non deve svuotare nulla.
    const alert = page.locator("#weatherAlert");
    await expect(alert).toContainText("Cielo sereno", { timeout: 10_000 });
    await expect(alert).toHaveClass(/ok/);

    // Diamo tempo al refresh fallito di completare, poi verifichiamo che i
    // dati cache siano ancora lì (non sostituiti da "Meteo non disponibile").
    await page.waitForTimeout(1000);
    await expect(alert).toContainText("Cielo sereno");
    await expect(page.locator("#statsGrid")).toContainText("27°");
  });
});
