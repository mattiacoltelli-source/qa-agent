import { test, expect } from "@playwright/test";
import { gotoFresh } from "../../fixtures/cinetracker-page.ts";
import { S } from "../../fixtures/selectors.ts";

test.describe("CineTracker — avvio", () => {
  test(
    "l'app si apre direttamente sulla home, senza scelta di profilo " +
      "(comportamento PREVISTO: single-user, a differenza di CineFighi)",
    async ({ page }) => {
      await gotoFresh(page);
      await expect(page.locator(S.screenHome)).toBeVisible();
      await expect(page.locator("#userPickerOverlay")).toHaveCount(0);
    }
  );

  // Da 52c529c: "Backup" non ha più un tasto in nav (spostato dietro il
  // gesto nascosto dei 7 tap, vedi openBackupViaSecretGesture) — il 4°
  // tab è "Report". L'assert stesso (conteggio 4 bottoni data-screen)
  // restava comunque vero, era solo il titolo del test a essere rimasto
  // indietro.
  test("la bottom nav espone le 4 sezioni Home/Statistiche/Stasera/Report", async ({ page }) => {
    await gotoFresh(page);
    await expect(page.locator(S.navBtnScreen)).toHaveCount(4);
  });

  test("le shelf vuote mostrano lo stato vuoto invece di una lista vuota silenziosa", async ({ page }) => {
    await gotoFresh(page);
    // Non assumiamo che la libreria reale sia vuota (persiste tra le run):
    // verifichiamo solo la coerenza tra card disegnate e stato-vuoto,
    // qualunque sia il caso.
    //
    // gotoFresh() aspetta solo che #screen-home sia visibile (lo è già nel
    // markup statico, prima ancora che loadDB()/renderAll() finiscano) — un
    // controllo "a scatto" (evaluate una tantum) può quindi leggere lo stato
    // grezzo dell'HTML, prima che renderHomeShelves() abbia applicato la
    // classe "hidden". expect.poll ritenta finché il render asincrono non si
    // stabilizza, invece di leggere un istante arbitrario.
    //
    // Attenzione a COSA viene nascosto: renderHomeShelves() (app.js) tocca
    // solo lo stato vuoto, il contenitore .shelf resta sempre nel DOM e
    // senza "hidden" — semplicemente vuoto. Il vecchio assert
    // (shelfHidden === !emptyHidden) sembrava coprire entrambi i casi ma
    // era vero solo con la libreria PIENA: a libreria vuota entrambi
    // risultavano non nascosti e il test falliva pur essendo l'app
    // corretta.
    const cards = page.locator(S.watchShelfShelfCard);
    const watchEmpty = page.locator("#watchShelfEmpty");
    await expect
      .poll(
        async () => {
          const cardCount = await cards.count();
          const emptyHidden = await watchEmpty.evaluate((el) => el.classList.contains("hidden"));
          // Stato vuoto visibile esattamente quando non c'è nessuna card.
          return cardCount > 0 ? emptyHidden : !emptyHidden;
        },
        { timeout: 10_000 }
      )
      .toBe(true);
  });
});
