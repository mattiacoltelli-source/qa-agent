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
    //
    // gotoFresh() aspetta solo che #screen-home sia visibile (lo è già nel
    // markup statico, prima ancora che loadDB()/renderAll() finiscano) — un
    // controllo "a scatto" (evaluate una tantum) può quindi leggere lo stato
    // grezzo dell'HTML, dove NÉ la shelf NÉ lo stato vuoto hanno ancora la
    // classe "hidden" applicata. expect.poll ritenta finché il render
    // asincrono non si stabilizza, invece di leggere un istante arbitrario.
    const watchShelf = page.locator("#watchShelf");
    const watchEmpty = page.locator("#watchShelfEmpty");
    await expect
      .poll(
        async () => {
          const shelfHidden = await watchShelf.evaluate((el) => el.classList.contains("hidden"));
          const emptyHidden = await watchEmpty.evaluate((el) => el.classList.contains("hidden"));
          return shelfHidden === !emptyHidden;
        },
        { timeout: 10_000 }
      )
      .toBe(true);
  });
});
