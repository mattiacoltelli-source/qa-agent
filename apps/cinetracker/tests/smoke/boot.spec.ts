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
  // gesto nascosto dei 7 tap, vedi openBackupViaSecretGesture).
  //
  // Da Cos90 7cfd417 (2026-11-12): "Stasera" non ha più un tasto in nav,
  // sostituito da "Stanze" (porta a stanze.html, una pagina separata —
  // location.href, non uno switchScreen interno, quindi niente attributo
  // data-screen). Contare S.navBtnScreen (".nav__btn[data-screen]", le
  // sole sezioni interne della SPA) darebbe 3, non 4: per questo qui si
  // conta S.navBtn (".nav__btn", tutti i bottoni della barra) e si
  // verificano le quattro etichette una per una — un conteggio generico
  // da solo non direbbe SE sia sparita una sezione attesa o comparsa una
  // in più al posto di un'altra.
  test("la bottom nav espone le 4 sezioni Home/Statistiche/Stanze/Report", async ({ page }) => {
    await gotoFresh(page);
    const buttons = page.locator(S.navBtn);
    await expect(buttons).toHaveCount(4);
    await expect(buttons).toContainText(["Home", "Statistiche", "Stanze", "Report"]);
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
