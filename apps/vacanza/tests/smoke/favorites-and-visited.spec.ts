import { test, expect } from "@playwright/test";
import { gotoFresh, switchPage } from "../../fixtures/vacanza-page.ts";
import { mockWeatherApis, WEATHER_PROFILES } from "../../fixtures/weather-mock.ts";

// A differenza di CineFighi/CineTracker, qui non c'è alcun backend condiviso:
// preferiti/visitati sono solo localStorage, isolato per test da gotoFresh().
// Nessun gate @write necessario.
test.describe("Spot — preferiti e visitati", () => {
  test.beforeEach(async ({ page }) => {
    await mockWeatherApis(page, WEATHER_PROFILES.clear);
    await gotoFresh(page);
    await switchPage(page, "spots");
  });

  test(
    "aggiungere ai preferiti lo rende trovabile col filtro 'Solo preferiti', " +
      "e persiste dopo un reload",
    async ({ page }) => {
      const firstCard = page.locator(".spot-card").first();
      await expect(firstCard).toBeVisible({ timeout: 10_000 });
      const spotId = await firstCard.getAttribute("data-spot-id");
      expect(spotId).toBeTruthy();

      await firstCard.locator(".fav-btn").click();
      await page.locator('[data-favoritesfilter="favorites"]').click();
      await expect(page.locator(".spot-card")).toHaveCount(1);
      await expect(page.locator(".spot-card").first()).toHaveAttribute("data-spot-id", spotId!);

      // Il filtro attivo non è persistito (torna a "Tutti" dopo reload), i
      // preferiti sì: riapplicando il filtro lo spot deve ricomparire.
      await page.reload();
      await switchPage(page, "spots");
      await page.locator('[data-favoritesfilter="favorites"]').click();
      await expect(page.locator(".spot-card")).toHaveCount(1);
      await expect(page.locator(".spot-card").first()).toHaveAttribute("data-spot-id", spotId!);
    }
  );

  test("togliere un preferito lo fa sparire dal filtro 'Solo preferiti'", async ({ page }) => {
    const firstCard = page.locator(".spot-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.locator(".fav-btn").click();
    await firstCard.locator(".fav-btn").click(); // toggle off

    await page.locator('[data-favoritesfilter="favorites"]').click();
    // ".detail-empty" è una classe generica riusata da più blocchi della
    // pagina (nearby, resultNote, dettaglio): va scoperta nel contenitore
    // della lista spot, altrimenti il locator è ambiguo (strict mode).
    await expect(page.locator("#spotList .detail-empty")).toBeVisible();
    await expect(page.locator(".spot-card")).toHaveCount(0);
  });

  test("segnare uno spot come visitato dal dettaglio mostra il badge nella lista spot", async ({ page }) => {
    const firstCard = page.locator(".spot-card").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    const name = (await firstCard.locator(".spot-name").textContent())?.trim() || "";
    await firstCard.click();

    await expect(page.locator("#page-detail")).toHaveClass(/active/);
    await page.locator("#detailVisitedBtn").click();

    await switchPage(page, "spots");
    const updatedCard = page.locator(".spot-card", { hasText: name }).first();
    await expect(updatedCard.locator(".spot-visited-badge")).toBeVisible();
  });
});
