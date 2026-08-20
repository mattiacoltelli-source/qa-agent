import { test, expect } from "@playwright/test";
import { gotoFresh } from "../../fixtures/cinetracker-page.ts";

test.describe("CineTracker — avvio", () => {
  test(
    "l'app si apre direttamente sulla home, senza scelta di profilo " +
      "(comportamento PREVISTO: single-user, a differenza di CineFighi)",
    async ({ page }) => {
      await gotoFresh(page);
      await expect(page.locator("#screen-home")).toBeVisible();
      await expect(page.locator("#userPickerOverlay")).toHaveCount(0);
    }
  );

  test("la bottom nav espone le 4 sezioni Home/Statistiche/Stasera/Backup", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.locator(".nav__btn[data-screen]")).toHaveCount(4);
  });

  test("le shelf vuote mostrano lo stato vuoto invece di una lista vuota silenziosa", async ({ page }) => {
    await gotoFresh(page);
    // Non assumiamo che la libreria reale sia vuota (persiste tra le run):
    // verifichiamo solo la coerenza shelf/stato-vuoto, qualunque sia il caso.
    const watchShelf = page.locator("#watchShelf");
    const watchEmpty = page.locator("#watchShelfEmpty");
    const shelfHidden = await watchShelf.evaluate((el) => el.classList.contains("hidden"));
    const emptyHidden = await watchEmpty.evaluate((el) => el.classList.contains("hidden"));
    expect(shelfHidden).toBe(!emptyHidden);
  });
});
