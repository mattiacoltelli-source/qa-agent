// Helper per la UI della dashboard AI Predictor (repo Prova). A differenza
// delle altre tre app, qui non c'è alcun backend né stato in localStorage:
// la pagina legge solo file statici del proprio repo (predictions/outcomes
// JSONL, pending.json) generati dalla pipeline Python — nessuno stato da
// isolare tra un test e l'altro, un browser context Playwright nuovo basta.
//
// I dati sono REALI e cambiano ogni giorno (nuove previsioni e valutazioni
// generate automaticamente): i test che usano questi helper devono
// verificare comportamento e forma, non valori fissi (vedi i commenti nei
// singoli spec.ts).

import type { Page, Locator } from "@playwright/test";

export const ASSETS = ["NVDA", "MSFT", "AAPL"] as const;
export type ProvaAsset = (typeof ASSETS)[number];

/** Naviga sulla dashboard e aspetta che le card asset siano nel DOM.
 * renderAssetCards() gira sincrono al load; i dati veri (renderAssetData,
 * via fetch ai file JSONL) arrivano subito dopo in modo asincrono — i test
 * devono comunque aspettare gli elementi specifici che leggono, questo
 * helper garantisce solo che lo scheletro della pagina sia pronto. */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await page.locator(".asset-card").first().waitFor({ state: "visible", timeout: 10_000 });
}

export function assetCard(page: Page, asset: ProvaAsset): Locator {
  return page
    .locator(".asset-card")
    .filter({ has: page.locator(".asset-title", { hasText: asset }) });
}

export function chartDetails(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator("details.chart-details");
}

/** Contenitore del grafico accuratezza: canvas o messaggio "nessun dato" a
 * seconda di quante previsioni sono già state valutate (dato reale). L'id è
 * sul CONTENITORE, non sul canvas, apposta: sopravvive alla sostituzione
 * quando non ci sono ancora dati (vedi showEmptyChart() in index.html). */
export function accuracyChartWrap(page: Page, asset: ProvaAsset): Locator {
  return page.locator(`#accuracy-wrap-${asset}`);
}

/** Contenitore del grafico prezzo principale o di uno dei tre per orizzonte
 * (horizon: "1d" | "7d" | "1m"), stessa logica di accuracyChartWrap(). */
export function priceChartWrap(page: Page, asset: ProvaAsset, horizon?: "1d" | "7d" | "1m"): Locator {
  const id = horizon ? `chart-wrap-${asset}-${horizon}` : `chart-wrap-${asset}`;
  return page.locator(`#${id}`);
}

export function infoPanel(page: Page): Locator {
  return page.locator("details.info-panel");
}

export function predictionRows(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator("tbody tr.pred-row");
}

export function outcomeRows(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator("tbody tr.outcome-row");
}

/** Riga di dettaglio associata a una riga cliccabile, per indice (stesso
 * indice della riga: vedi toggleDetail() in index.html). */
export function predictionDetailRow(page: Page, asset: ProvaAsset, index: number): Locator {
  return page.locator(`#detail-pred-${asset}-${index}`);
}

export function outcomeDetailRow(page: Page, asset: ProvaAsset, index: number): Locator {
  return page.locator(`#detail-outcome-${asset}-${index}`);
}

export type ProvaHorizonFilter = "all" | "1d" | "7d" | "1m";

/** Bottone del filtro orizzonte (Tutti/1g/7g/1m) in cima alla pagina,
 * sopra le card asset — un filtro solo, condiviso da tutte e tre. */
export function horizonFilterButton(page: Page, horizon: ProvaHorizonFilter): Locator {
  return page.locator(`.horizon-filter-btn[data-horizon="${horizon}"]`);
}

export function accuracyBadge(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(".badge-accuracy");
}

/** Nota "dati mancanti" sotto il nome dell'asset: vuota/nascosta se
 * l'ultimo segnale aveva tutte le fonti opzionali disponibili (dato
 * reale, cambia ogni giorno — vedi missingDataNote() in index.html). */
export function dataStatusNote(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(".data-status");
}

/** Orario della previsione giornaliera in ora italiana, dentro il
 * pannello info — calcolato lato client ad ogni caricamento. */
export function predictionTimeItalian(page: Page): Locator {
  return infoPanel(page).locator("#prediction-times-it");
}
