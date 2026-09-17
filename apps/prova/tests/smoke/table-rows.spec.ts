import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  openAssetTable,
  predictionRows,
  outcomeRows,
  showAllButton,
  ROW_LIMIT,
  ASSETS,
} from "../../fixtures/prova-page.ts";

// Da 4020d3f/23dc826: le tabelle mostrano solo le ROW_LIMIT righe più
// recenti, con un pulsante "Mostra tutto (N)" per aprire tutto lo storico e
// tornare indietro. Quante righe esistano davvero dipende dai dati reali
// (cresce ogni giorno lavorativo), quindi il test copre entrambi i casi:
// sotto soglia il pulsante non deve esistere affatto, sopra soglia deve
// espandere e ricollassare senza mai perdere righe.
test.describe("AI Predictor — tabelle: limite righe e \"Mostra tutto\"", () => {
  for (const kind of ["predictions", "outcomes"] as const) {
    const rowsOf = kind === "predictions" ? predictionRows : outcomeRows;
    const label = kind === "predictions" ? "Ultimi Segnali Generati" : "Ultimi Risultati Valutati";

    test(`${label}: al massimo ${ROW_LIMIT} righe di default, "Mostra tutto" apre lo storico intero`, async ({
      page,
    }) => {
      const asset = ASSETS[0];
      await gotoFresh(page);
      await openAssetTable(page, asset, kind);

      const rows = rowsOf(page, asset);
      const initial = await rows.count();
      expect(initial).toBeLessThanOrEqual(ROW_LIMIT);

      const btn = showAllButton(page, asset, kind);
      if ((await btn.count()) === 0) {
        // Meno di ROW_LIMIT righe in totale: nessun pulsante, ed è corretto
        // (renderShowAllButton() svuota il footer) — niente da espandere.
        expect(initial).toBeLessThanOrEqual(ROW_LIMIT);
        return;
      }

      // Il conteggio nel pulsante è il totale reale, che deve essere > delle
      // righe mostrate ora: è la ragione per cui il pulsante esiste.
      const btnText = (await btn.textContent()) ?? "";
      const total = Number(btnText.match(/\((\d+)\)/)?.[1] ?? 0);
      expect(btnText).toContain("Mostra tutto");
      expect(total).toBeGreaterThan(initial);

      await btn.click();
      await expect(rows).toHaveCount(total);
      await expect(btn).toHaveText("Mostra solo le recenti");

      await btn.click();
      await expect(rows).toHaveCount(initial);
      await expect(btn).toContainText("Mostra tutto");
    });
  }

  test("espandere una tabella non espande l'altra né le tabelle di un altro asset", async ({
    page,
  }) => {
    // tableExpanded è indicizzato per "kind-asset" (index.html): un bug di
    // chiave condivisa si vedrebbe solo confrontando due tabelle diverse.
    const asset = ASSETS[0];
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");
    await openAssetTable(page, asset, "outcomes");

    const predBtn = showAllButton(page, asset, "predictions");
    const outBtn = showAllButton(page, asset, "outcomes");
    if ((await predBtn.count()) === 0 || (await outBtn.count()) === 0) {
      test.skip(true, `${asset}: una delle due tabelle non supera ${ROW_LIMIT} righe oggi`);
    }

    const outcomesBefore = await outcomeRows(page, asset).count();
    await predBtn.click();
    await expect(predBtn).toHaveText("Mostra solo le recenti");
    await expect(outBtn).toContainText("Mostra tutto");
    await expect(outcomeRows(page, asset)).toHaveCount(outcomesBefore);
  });
});
