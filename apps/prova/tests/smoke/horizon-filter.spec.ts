import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  horizonFilterButton,
  accuracyBadge,
  openAssetTable,
  predictionRows,
  settledRowCount,
  showAllButton,
  fakePrediction,
  mockAssetData,
  ASSETS,
} from "../../fixtures/prova-page.ts";

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

  // Dal 2026-09-30 (Prova fe43946) la cronologia ha una forma nuova: 1g ogni
  // giorno di borsa, 7g una volta a settimana, 1m due. Una tabella "tipica"
  // non e' piu' tre righe per giorno ma tante 1g con ogni tanto una 7g o una
  // 1m. Nessun test di prima assumeva il contrario (verificato: i conteggi
  // di righe sono sempre letti dalla pagina, mai scritti a mano), ma il
  // filtro non era mai stato provato sul contenuto della tabella — e con
  // questa forma e' il caso piu' facile da sbagliare: un orizzonte che ha una
  // sola riga fra molte.
  test("con la cronologia a cadenze diverse, il filtro mostra solo le righe dell'orizzonte scelto", async ({
    page,
  }) => {
    const asset = ASSETS[0];
    const giorno = (n: number) => new Date(Date.parse("2026-10-01T12:00:00.000Z") - n * 86_400_000).toISOString();
    await mockAssetData(page, asset, [
      // Otto 1g, una per giorno (ogni giorno di borsa)
      ...Array.from({ length: 8 }, (_, i) => fakePrediction({ asset, n: i, horizon: "1d", generatedAt: giorno(i) })),
      // Una sola 7g e una sola 1m nello stesso periodo
      fakePrediction({ asset, n: 100, horizon: "7d", generatedAt: giorno(3) }),
      fakePrediction({ asset, n: 200, horizon: "1m", generatedAt: giorno(2) }),
    ]);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");

    // "Tutti": le dieci righe, ma se ne mostrano sei e il resto sta dietro "Mostra tutto".
    expect(await settledRowCount(page, asset, "predictions")).toBe(6);
    await expect(showAllButton(page, asset, "predictions")).toContainText("(10)");

    // 7g: UNA riga sola, ed e' quella 7g — senza "Mostra tutto", perche' non
    // c'e' piu' niente da espandere.
    await horizonFilterButton(page, "7d").click();
    await expect(predictionRows(page, asset)).toHaveCount(1);
    // La riga mostra l'orizzonte grezzo ("7d"), non l'etichetta del filtro ("7g").
    await expect(predictionRows(page, asset).nth(0)).toContainText("7d");
    await expect(showAllButton(page, asset, "predictions")).toHaveCount(0);

    await horizonFilterButton(page, "1m").click();
    await expect(predictionRows(page, asset)).toHaveCount(1);
    await expect(predictionRows(page, asset).nth(0)).toContainText("1m");
    await expect(predictionRows(page, asset).nth(0)).not.toContainText("7d");

    // 1g: le otto giornaliere, sei visibili e "Mostra tutto (8)".
    await horizonFilterButton(page, "1d").click();
    await expect(predictionRows(page, asset)).toHaveCount(6);
    await expect(showAllButton(page, asset, "predictions")).toContainText("(8)");
    // Sono davvero tutte giornaliere: nessuna 7d o 1m passata dal filtro.
    for (let i = 0; i < 6; i++) {
      await expect(predictionRows(page, asset).nth(i)).toContainText("1d");
    }

    // Tornando a "Tutti" riappaiono tutte, nessuna persa lungo il giro.
    await horizonFilterButton(page, "all").click();
    await expect(predictionRows(page, asset)).toHaveCount(6);
    await expect(showAllButton(page, asset, "predictions")).toContainText("(10)");
  });

  test("un orizzonte senza righe nella cronologia mostra il messaggio di tabella vuota, non una tabella rotta", async ({
    page,
  }) => {
    // Un asset appena aggiunto, o il giorno in cui la 7g non e' "dovuta":
    // dopo il filtro puo' non esserci nessuna riga. La tabella deve dirlo.
    const asset = ASSETS[0];
    await mockAssetData(page, asset, [
      fakePrediction({ asset, n: 1, horizon: "1d", generatedAt: "2026-10-01T12:00:00.000Z" }),
    ]);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");
    expect(await settledRowCount(page, asset, "predictions")).toBe(1);

    await horizonFilterButton(page, "7d").click();
    await expect(predictionRows(page, asset)).toHaveCount(0);
    await expect(page.locator(`#assets-grid .asset-card[data-asset="${asset}"]`)).toContainText(
      "Nessuna predizione registrata."
    );

    await horizonFilterButton(page, "1d").click();
    await expect(predictionRows(page, asset)).toHaveCount(1);
  });
});
