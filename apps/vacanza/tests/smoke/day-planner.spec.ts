import { test, expect } from "@playwright/test";
import { gotoFresh } from "../../fixtures/vacanza-page.ts";
import { mockWeatherApis, WEATHER_PROFILES } from "../../fixtures/weather-mock.ts";

test.describe("Spot — Pianifica itinerario", () => {
  test.beforeEach(async ({ page }) => {
    await mockWeatherApis(page, WEATHER_PROFILES.clear);
    await gotoFresh(page);
  });

  test("popola i 5 slot dell'itinerario (alba, 3 tappe intermedie, tramonto) senza spot duplicati", async ({
    page,
  }) => {
    await page.locator("#autofillPlannerBtn").click();
    const slots = page.locator("#plannerBox .planner-slot");
    await expect(slots).toHaveCount(5, { timeout: 10_000 });

    const names = await page.locator("#plannerBox .planner-slot-name").allTextContents();
    const filled = names.map((n) => n.trim()).filter(Boolean);
    expect(filled.length).toBeGreaterThan(0);
    expect(new Set(filled).size).toBe(filled.length);
  });

  test("l'itinerario resta popolato dopo un reload (persistito in localStorage)", async ({ page }) => {
    await page.locator("#autofillPlannerBtn").click();
    await expect(page.locator("#plannerBox .planner-slot-name").first()).not.toBeEmpty({ timeout: 10_000 });
    const before = await page.locator("#plannerBox .planner-slot-name").allTextContents();

    await page.reload();
    const after = await page.locator("#plannerBox .planner-slot-name").allTextContents();
    expect(after).toEqual(before);
  });

  test('"Svuota itinerario" riporta tutti gli slot allo stato vuoto', async ({ page }) => {
    await page.locator("#autofillPlannerBtn").click();
    await expect(page.locator("#plannerBox .planner-slot-name").first()).not.toBeEmpty({ timeout: 10_000 });

    await page.locator("#clearPlannerBtn").click();
    await expect(page.locator("#plannerBox .planner-slot-name")).toHaveCount(0);
  });
});
