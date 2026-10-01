import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  assetCard,
  openAssetTable,
  predictionRows,
  predictionDetailRow,
  settledRowCount,
  showAllButton,
  fakePrediction,
  mockAssetData,
  ASSETS,
} from "../../fixtures/prova-page.ts";

// Il blocco "regime di mercato" nel dettaglio di una previsione Tech
// (marketRegimeLines() in Prova/index.html, dal 2026-09-23): rendimento di
// SPY e QQQ a 1/5/20 giorni, VIX con il suo percentile sull'ultimo anno, e
// la modalita' di mercato (risk-on / neutro / risk-off, derivata solo dal
// percentile VIX — src/market_regime.py).
//
// Due famiglie di test, per due ragioni diverse:
//
//  - DATI FINTI (il primo describe): il blocco c'e' solo nelle previsioni
//    generate dopo il 2026-09-23, e quelle vecchie non devono rompersi ne'
//    mostrare righe vuote. "Una previsione vecchia" pero' esce
//    dalle ultime righe visibili man mano che il tempo passa: con dati veri
//    questo caso smetterebbe di essere raggiungibile, e il test passerebbe
//    senza verificare piu' nulla. Rispondendo noi al file statico il caso e'
//    sempre lo stesso — vedi il commento sui dati finti in fixtures.
//  - DATI VERI (il secondo describe): la forma del dato che la pipeline produce
//    davvero oggi, perche' un campo rinominato lato Python romperebbe il
//    blocco senza che nessun test finto se ne accorga.

const NUOVA = "2026-09-30T12:00:00.000Z";
const VECCHIA = "2026-09-10T12:00:00.000Z"; // prima del 2026-09-23: nessun regime

const REGIME_PIENO = {
  spy_return_1d_pct: -0.21,
  spy_return_5d_pct: -0.67,
  spy_return_20d_pct: 0.11,
  qqq_return_1d_pct: 0.25,
  qqq_return_5d_pct: -0.19,
  qqq_return_20d_pct: 4.54,
  vix: { date: "2026-09-29", percentile: 27.4, value: 16.04 },
  risk_mode: "risk-on",
};

test.describe("AI Predictor — blocco \"regime di mercato\" nel dettaglio previsione (dati finti)", () => {
  test("previsione recente: rendimenti SPY/QQQ, VIX con percentile e modalita' di mercato", async ({ page }) => {
    const asset = ASSETS[0];
    await mockAssetData(page, asset, [fakePrediction({ asset, n: 1, generatedAt: NUOVA, regime: REGIME_PIENO })]);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");
    expect(await settledRowCount(page, asset, "predictions")).toBe(1);

    await predictionRows(page, asset).nth(0).click();
    const detail = predictionDetailRow(page, asset, 0);
    await expect(detail).toBeVisible();

    // Il numero e' stampato com'e', senza arrotondamenti ne' segni
    // aggiunti: un cambio di formato lato app si vede qui.
    await expect(detail).toContainText("S&P 500 (SPY): -0.21% (1g), -0.67% (5g), 0.11% (20g)");
    await expect(detail).toContainText("Nasdaq 100 (QQQ): 0.25% (1g), -0.19% (5g), 4.54% (20g)");
    await expect(detail).toContainText("VIX: 16.04 (percentile 27.4% sull'ultimo anno)");
    await expect(detail).toContainText("Modalità di mercato: risk-on");

    // SPY e QQQ qui sono BENCHMARK, non asset: ora che la sigla compare
    // dentro una card aperta, il paniere deve restare quello di prima.
    await expect(page.locator("#asset-filter")).not.toContainText("SPY");
    await expect(page.locator("#asset-filter")).not.toContainText("QQQ");
  });

  for (const mode of ["risk-on", "neutro", "risk-off"] as const) {
    test(`modalita' di mercato "${mode}": mostrata cosi' com'e', senza essere tradotta o maiuscolata`, async ({
      page,
    }) => {
      const asset = ASSETS[0];
      await mockAssetData(page, asset, [
        fakePrediction({ asset, n: 1, generatedAt: NUOVA, regime: { ...REGIME_PIENO, risk_mode: mode } }),
      ]);
      await gotoFresh(page);
      await openAssetTable(page, asset, "predictions");
      await settledRowCount(page, asset, "predictions");
      await predictionRows(page, asset).nth(0).click();
      await expect(predictionDetailRow(page, asset, 0)).toContainText(`Modalità di mercato: ${mode}`);
    });
  }

  test("regime parziale (solo VIX e modalita'): niente righe SPY/QQQ e nessun 'undefined'", async ({ page }) => {
    // Ogni pezzo del blocco e' condizionale (marketRegimeLines()): una fonte
    // che a quel giro non rispondeva lascia il campo assente, e la riga
    // semplicemente non compare — non "undefined%".
    const asset = ASSETS[0];
    await mockAssetData(page, asset, [
      fakePrediction({
        asset,
        n: 1,
        generatedAt: NUOVA,
        regime: { vix: { value: 21.5, percentile: 80, date: "2026-09-29" }, risk_mode: "risk-off" },
      }),
    ]);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");
    await settledRowCount(page, asset, "predictions");
    await predictionRows(page, asset).nth(0).click();

    const detail = predictionDetailRow(page, asset, 0);
    await expect(detail).toContainText("VIX: 21.5 (percentile 80% sull'ultimo anno)");
    await expect(detail).toContainText("Modalità di mercato: risk-off");
    await expect(detail).not.toContainText("S&P 500 (SPY)");
    await expect(detail).not.toContainText("Nasdaq 100 (QQQ)");
    await expect(detail).not.toContainText("undefined");
    await expect(detail).not.toContainText("NaN");
  });

  test("regime senza VIX (fonte non risposta): restano SPY/QQQ, nessuna riga VIX e nessun errore", async ({ page }) => {
    // Il VIX arriva da una fonte propria (FRED): puo' mancare mentre SPY e
    // QQQ ci sono. Il blocco non deve rompersi leggendo vix.value di
    // undefined — un'eccezione dentro marketRegimeLines() farebbe sparire
    // l'INTERO dettaglio, non solo la riga mancante.
    const asset = ASSETS[0];
    const { vix: _v, risk_mode: _r, ...senzaVix } = REGIME_PIENO;
    await mockAssetData(page, asset, [fakePrediction({ asset, n: 1, generatedAt: NUOVA, regime: senzaVix })]);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");
    await settledRowCount(page, asset, "predictions");
    await predictionRows(page, asset).nth(0).click();

    const detail = predictionDetailRow(page, asset, 0);
    await expect(detail).toBeVisible();
    // Il resto del dettaglio c'e' ancora: e' la prova che non e' saltato tutto.
    await expect(detail).toContainText("Motivazione del modello");
    await expect(detail).toContainText("S&P 500 (SPY): -0.21% (1g)");
    await expect(detail).toContainText("Nasdaq 100 (QQQ): 0.25% (1g)");
    await expect(detail).not.toContainText("VIX");
    await expect(detail).not.toContainText("Modalità di mercato");
    await expect(detail).not.toContainText("undefined");
  });

  test("tabella mista: la previsione vecchia (senza regime) non si rompe e non lascia righe vuote, quella nuova si", async ({
    page,
  }) => {
    const asset = ASSETS[0];
    // La tabella ordina per data decrescente: la nuova sta in cima (indice
    // 0), la vecchia sotto (indice 1). Entrambe hanno la stessa forma di
    // tutto il resto, salvo market_regime.
    await mockAssetData(page, asset, [
      fakePrediction({ asset, n: 1, generatedAt: NUOVA, regime: REGIME_PIENO }),
      fakePrediction({ asset, n: 2, generatedAt: VECCHIA }),
    ]);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");
    expect(await settledRowCount(page, asset, "predictions")).toBe(2);

    // La vecchia: si apre, ha il resto del dettaglio, e il blocco regime
    // semplicemente non c'e'.
    await predictionRows(page, asset).nth(1).click();
    const old = predictionDetailRow(page, asset, 1);
    await expect(old).toBeVisible();
    await expect(old).toContainText("Motivazione del modello");
    await expect(old).toContainText("Motivazione finta numero 2");
    await expect(old).not.toContainText("Modalità di mercato");
    await expect(old).not.toContainText("VIX");
    await expect(old).not.toContainText("Nasdaq 100 (QQQ)");
    await expect(old).not.toContainText("undefined");
    await expect(old).not.toContainText("null");
    await expect(old).not.toContainText("NaN");

    // "Nessuna riga vuota": le righe del dettaglio sono unite da <br>, e un
    // blocco che producesse stringhe vuote lascerebbe <br><br> o un <br>
    // finale. E' la forma in cui "righe vuote" si vedrebbe a schermo.
    const html = await old.locator("td").innerHTML();
    // Guardia contro un test vacuo: se un giorno le righe non fossero piu'
    // separate da <br>, le tre asserzioni sotto passerebbero per forza.
    expect(html, "il dettaglio non usa piu' <br> come separatore: rivedere questo controllo").toContain("<br>");
    expect(html, "righe vuote nel dettaglio di una previsione vecchia").not.toContain("<br><br>");
    expect(html.trim().endsWith("<br>"), "<br> finale nel dettaglio").toBe(false);
    expect(html.trim().startsWith("<br>"), "<br> iniziale nel dettaglio").toBe(false);

    // Aprendo la nuova si chiude la vecchia (una sola riga aperta per
    // tabella, toggleDetail()) e compare il blocco completo.
    await predictionRows(page, asset).nth(0).click();
    await expect(predictionDetailRow(page, asset, 1)).toBeHidden();
    await expect(predictionDetailRow(page, asset, 0)).toContainText("Modalità di mercato: risk-on");
  });

  test("la riga vecchia resta apribile anche dietro \"Mostra tutto\" (oltre le prime sei)", async ({ page }) => {
    // Nella pratica le previsioni senza regime sono le piu' vecchie, cioe'
    // quelle che stanno OLTRE le sei righe mostrate di default: il caso
    // reale e' questo, non la tabella a due righe del test sopra.
    const asset = ASSETS[0];
    const nuove = Array.from({ length: 6 }, (_, i) =>
      fakePrediction({
        asset,
        n: i + 1,
        generatedAt: new Date(Date.parse(NUOVA) - i * 86_400_000).toISOString(),
        regime: REGIME_PIENO,
      })
    );
    const vecchia = fakePrediction({ asset, n: 99, generatedAt: VECCHIA });
    await mockAssetData(page, asset, [...nuove, vecchia]);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");
    await settledRowCount(page, asset, "predictions");

    await showAllButton(page, asset, "predictions").click();
    await expect(predictionRows(page, asset)).toHaveCount(7);

    await predictionRows(page, asset).nth(6).click();
    const detail = predictionDetailRow(page, asset, 6);
    await expect(detail).toContainText("Motivazione finta numero 99");
    await expect(detail).not.toContainText("Modalità di mercato");
    await expect(detail).not.toContainText("undefined");
  });
});

// ─── Dati veri ───────────────────────────────────────────────────────────
test.describe("AI Predictor — blocco \"regime di mercato\" (dati veri)", () => {
  for (const asset of ASSETS) {
    test(`${asset}: la previsione piu' recente col blocco ha rendimenti, VIX con percentile e modalita' plausibili`, async ({
      page,
    }) => {
      await gotoFresh(page);
      await openAssetTable(page, asset, "predictions");
      const count = await settledRowCount(page, asset, "predictions");
      test.skip(count === 0, `${asset}: nessuna previsione ancora generata`);

      // Si cerca fra le righe visibili (le piu' recenti). Dal 2026-09-24
      // ogni previsione nuova dovrebbe averlo: se NESSUNA delle ultime sei
      // lo ha, la pipeline ha smesso di produrre il campo (o la pagina di
      // leggerlo), ed e' esattamente cio' che questo test deve far vedere.
      let trovato: string | null = null;
      for (let i = 0; i < count; i++) {
        await predictionRows(page, asset).nth(i).click();
        const text = (await predictionDetailRow(page, asset, i).textContent()) ?? "";
        if (text.includes("Modalità di mercato")) {
          trovato = text;
          break;
        }
        // Richiude prima di passare alla successiva: una sola aperta alla volta.
        await predictionRows(page, asset).nth(i).click();
      }
      expect(trovato, `${asset}: nessuna delle ultime ${count} previsioni ha il blocco regime di mercato`).not.toBeNull();
      const text = trovato!;

      // Valori reali, quindi mai un numero preciso: solo forma e intervalli
      // plausibili. I rendimenti a 20 giorni di un indice non escono dai
      // pochi punti percentuali; 25 e' un tetto largo che un'inversione di
      // scala (es. 0.0454 al posto di 4.54, o 454) romperebbe comunque.
      const num = "(-?\\d+(?:\\.\\d+)?)";
      for (const [nome, ticker] of [["S&P 500", "SPY"], ["Nasdaq 100", "QQQ"]] as const) {
        const m = text.match(new RegExp(`${nome} \\(${ticker}\\): ${num}% \\(1g\\), ${num}% \\(5g\\), ${num}% \\(20g\\)`));
        expect(m, `${asset}: riga ${ticker} assente o in un formato diverso`).not.toBeNull();
        for (const v of m!.slice(1).map(Number)) {
          expect(Number.isFinite(v)).toBe(true);
          expect(Math.abs(v)).toBeLessThan(25);
        }
      }

      const vix = text.match(/VIX: (\d+(?:\.\d+)?) \(percentile (\d+(?:\.\d+)?)% sull'ultimo anno\)/);
      expect(vix, `${asset}: riga VIX assente o in un formato diverso`).not.toBeNull();
      expect(Number(vix![1])).toBeGreaterThan(5); // il VIX non sta sotto la decina
      expect(Number(vix![1])).toBeLessThan(100);
      // Un percentile e' 0-100: fuori scala vuol dire che la pipeline ha
      // scritto una frazione (0.27) o un valore sbagliato.
      expect(Number(vix![2])).toBeGreaterThanOrEqual(0);
      expect(Number(vix![2])).toBeLessThanOrEqual(100);

      expect(text).toMatch(/Modalità di mercato: (risk-on|neutro|risk-off)/);
    });
  }
});
