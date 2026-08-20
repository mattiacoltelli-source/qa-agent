import { test, expect } from "@playwright/test";
import { gotoFresh, switchPage } from "../../fixtures/vacanza-page.ts";
import { mockWeatherApis, WEATHER_PROFILES } from "../../fixtures/weather-mock.ts";

test.describe("Spot — Sail Mode / Travel Mode", () => {
  test.beforeEach(async ({ page }) => {
    await mockWeatherApis(page, WEATHER_PROFILES.clear);
    await gotoFresh(page);
  });

  test("Travel Mode è l'impostazione di default", async ({ page }) => {
    await expect(page.locator("#sailModeToggle")).not.toBeChecked();
    await expect(page.locator("#modeLabelMain")).toHaveText("Travel Mode");
    await expect(page.locator("#modeLabelSub")).toHaveText("Sail mode OFF");
  });

  test("attivare Sail Mode cambia label, statistiche (vento/onde invece di temp/pioggia) e filtri spot", async ({
    page,
  }) => {
    await page.locator("#sailModeToggle").click();
    await expect(page.locator("#modeLabelMain")).toHaveText("Sail Mode");
    await expect(page.locator("#modeLabelSub")).toHaveText("Sail mode ON");
    await expect(page.locator("#statsGrid")).toContainText("Onde");
    await expect(page.locator("#statsGrid")).not.toContainText("Temperatura");

    await switchPage(page, "spots");
    await expect(page.locator("#sailFilters")).toBeVisible();
    await expect(page.locator("#travelFilters")).toBeHidden();
  });

  test("la modalità scelta resta impostata dopo un reload (persistita in localStorage)", async ({ page }) => {
    await page.locator("#sailModeToggle").click();
    await expect(page.locator("#modeLabelMain")).toHaveText("Sail Mode");
    await page.reload();
    await expect(page.locator("#modeLabelMain")).toHaveText("Sail Mode");
    await expect(page.locator("#sailModeToggle")).toBeChecked();
  });
});
