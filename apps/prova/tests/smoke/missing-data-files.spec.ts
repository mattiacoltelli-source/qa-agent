import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  assetCard,
  openAssetTable,
  predictionRows,
  outcomeRows,
  settledRowCount,
  mockDataFileStatus,
  ASSETS,
  MSG_DATI_NON_RAGGIUNGIBILI,
} from "../../fixtures/prova-page.ts";

// Un file dati MANCANTE e' una cosa, un file NON LEGGIBILE un'altra, e la
// pagina deve dirle in modo diverso.
//
//  - 404: il file non esiste (ancora). La pipeline crea
//    data/<asset>/outcomes.jsonl solo quando valuta il primo esito, quindi
//    un asset appena aggiunto non lo ha — era il caso di AMD dal 2026-10-01.
//    E' un'assenza normale: la tabella dice "Nessuna valutazione ancora.".
//  - 5xx (o rete caduta): il file c'e' ma non si legge. Questo e' un guasto, e
//    "Dati non raggiungibili al momento. Riprova piu' tardi." e' vero.
//
// Prima del 2026-10-01 (Prova ee30ee7) parseJsonl() trattava ogni risposta non
// ok come errore, 404 compreso, e la card di AMD diceva "dati non
// raggiungibili" per un'assenza. Questi test fissano la distinzione in
// entrambe le direzioni: il secondo gruppo non e' un di piu', e' cio' che
// impedisce di "risolvere" il primo dicendo sempre "nessun dato" — che
// nasconderebbe una vera interruzione.
//
// Dati finti: risponde il test, solo per UN file di UN asset. Gli altri
// restano dati veri. Prova non ha backend ne' scritture, nessun rischio per
// i dati (vedi il commento sui dati finti in fixtures/prova-page.ts).

const asset = ASSETS[0];
const card = (page: import("@playwright/test").Page) => assetCard(page, asset);

test.describe("AI Predictor — file dati mancante (404) o non leggibile (5xx)", () => {
  test("esiti: un 404 e' 'nessuna valutazione ancora', non un errore", async ({ page }) => {
    await mockDataFileStatus(page, asset, "outcomes", 404);
    await gotoFresh(page);
    await openAssetTable(page, asset, "outcomes");

    expect(await settledRowCount(page, asset, "outcomes")).toBe(0);
    await expect(card(page)).toContainText("Nessuna valutazione ancora.");
    await expect(card(page)).not.toContainText(MSG_DATI_NON_RAGGIUNGIBILI);
  });

  test("esiti: un 404 non toglie le previsioni, che si caricano normalmente", async ({ page }) => {
    // E' il caso di AMD: previsioni presenti, esiti assenti. Il file mancante
    // di una tabella non deve trascinarsi dietro l'altra.
    await mockDataFileStatus(page, asset, "outcomes", 404);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");

    expect(await settledRowCount(page, asset, "predictions")).toBeGreaterThan(0);
    await expect(predictionRows(page, asset).first()).toBeVisible();
    await expect(card(page).locator(".badge-accuracy")).toContainText("Accuratezza:");
  });

  test("previsioni: un 404 e' 'nessuna predizione registrata' (asset appena aggiunto, prima del primo giro)", async ({
    page,
  }) => {
    await mockDataFileStatus(page, asset, "predictions", 404);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");

    expect(await settledRowCount(page, asset, "predictions")).toBe(0);
    await expect(card(page)).toContainText("Nessuna predizione registrata.");
    await expect(card(page)).not.toContainText(MSG_DATI_NON_RAGGIUNGIBILI);
  });

  test("esiti: un 500 resta 'dati non raggiungibili' — l'interruzione vera non diventa 'nessun dato'", async ({
    page,
  }) => {
    await mockDataFileStatus(page, asset, "outcomes", 500);
    await gotoFresh(page);
    await openAssetTable(page, asset, "outcomes");

    expect(await settledRowCount(page, asset, "outcomes")).toBe(0);
    await expect(card(page)).toContainText(MSG_DATI_NON_RAGGIUNGIBILI);
    await expect(card(page)).not.toContainText("Nessuna valutazione ancora.");
  });

  test("previsioni: un 503 resta 'dati non raggiungibili'", async ({ page }) => {
    await mockDataFileStatus(page, asset, "predictions", 503);
    await gotoFresh(page);
    await openAssetTable(page, asset, "predictions");

    expect(await settledRowCount(page, asset, "predictions")).toBe(0);
    await expect(card(page)).toContainText(MSG_DATI_NON_RAGGIUNGIBILI);
    await expect(card(page)).not.toContainText("Nessuna predizione registrata.");
  });

  test("un file mancante su un asset non tocca gli altri: le loro tabelle si caricano come prima", async ({ page }) => {
    // Il caso reale: AMD senza esiti accanto a tre asset normali. Qui l'asset
    // "mancante" e' il primo e si controlla il secondo.
    const altro = ASSETS[1];
    await mockDataFileStatus(page, asset, "outcomes", 404);
    await gotoFresh(page);
    await openAssetTable(page, altro, "predictions");

    expect(await settledRowCount(page, altro, "predictions")).toBeGreaterThan(0);
    expect(await predictionRows(page, altro).count()).toBeGreaterThan(0);
    await expect(assetCard(page, altro)).not.toContainText(MSG_DATI_NON_RAGGIUNGIBILI);
    // Il suo file esiti e' vero: se ha esiti si vedono, se non ne ha il
    // messaggio e' quello giusto — in nessun caso "non raggiungibili".
    await openAssetTable(page, altro, "outcomes");
    const n = await settledRowCount(page, altro, "outcomes");
    if (n === 0) await expect(assetCard(page, altro)).toContainText("Nessuna valutazione ancora.");
    else expect(await outcomeRows(page, altro).count()).toBe(n);
  });
});
