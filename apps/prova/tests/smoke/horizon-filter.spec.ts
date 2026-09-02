import { test, expect } from "@playwright/test";
import { gotoFresh, horizonFilterButton, accuracyBadge, ASSETS } from "../../fixtures/prova-page.ts";

// Il filtro (Tutti/1g/7g/1m, aggiunto il 2026-09-02) filtra dati REALI già
// caricati, non un mock: questi test verificano che cliccare un bottone
// cambi lo stato attivo e la forma dell'etichetta "Accuratezza", mai il
// valore percentuale (che dipende da quante previsioni esistono oggi).
test.describe("AI Predictor — filtro orizzonte", () => {
  test("\"Tutti\" è attivo di default, un solo bottone alla volta", async ({ page }) => {
    await gotoFresh(page);
    await expect(horizonFilterButton(page, "all")).toHaveClass(/active/);
    for (const h of ["1d", "7d", "1m"] as const) {
      await expect(horizonFilterButton(page, h)).not.toHaveClass(/active/);
    }
  });

  test("cliccare 1g/7g/1m sposta lo stato attivo e aggiorna l'etichetta accuratezza", async ({
    page,
  }) => {
    await gotoFresh(page);

    const cases = [
      { horizon: "1d", suffix: "(1g)" },
      { horizon: "7d", suffix: "(7g)" },
      { horizon: "1m", suffix: "(1m)" },
    ] as const;

    for (const { horizon, suffix } of cases) {
      await horizonFilterButton(page, horizon).click();
      await expect(horizonFilterButton(page, horizon)).toHaveClass(/active/);
      await expect(horizonFilterButton(page, "all")).not.toHaveClass(/active/);

      // Un solo asset basta per verificare la forma dell'etichetta: non
      // dipende da quale asset o da quanti dati reali esistono oggi.
      await expect(accuracyBadge(page, ASSETS[0])).toContainText(suffix);
    }

    // Tornando su "Tutti" l'etichetta perde il suffisso dell'orizzonte.
    await horizonFilterButton(page, "all").click();
    await expect(accuracyBadge(page, ASSETS[0])).not.toContainText("(1g)");
    await expect(accuracyBadge(page, ASSETS[0])).not.toContainText("(7g)");
    await expect(accuracyBadge(page, ASSETS[0])).not.toContainText("(1m)");
  });

  test("il filtro sta su una riga sola senza andare a capo (viewport mobile)", async ({ page }) => {
    await gotoFresh(page);
    const filterBox = await page.locator("#horizon-filter").boundingBox();
    const buttonBoxes = await Promise.all(
      (["all", "1d", "7d", "1m"] as const).map((h) => horizonFilterButton(page, h).boundingBox())
    );
    expect(filterBox).not.toBeNull();
    // Stessa "y" (con un piccolo margine) per tutti i bottoni: se fossero
    // andati a capo, quelli dopo il wrap avrebbero una "y" più alta.
    const ys = buttonBoxes.map((b) => b?.y ?? -1);
    const maxDelta = Math.max(...ys) - Math.min(...ys);
    expect(maxDelta).toBeLessThan(5);
  });
});
