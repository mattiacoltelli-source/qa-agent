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

import { expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";

export const ASSETS = ["NVDA", "MSFT", "AAPL"] as const;
export type ProvaAsset = (typeof ASSETS)[number];

/** Naviga sulla dashboard e aspetta che le card asset siano nel DOM.
 * renderAssetCards() gira sincrono al load; i dati veri (renderAssetData,
 * via fetch ai file JSONL) arrivano subito dopo in modo asincrono — i test
 * devono comunque aspettare gli elementi specifici che leggono, questo
 * helper garantisce solo che lo scheletro della pagina sia pronto.
 *
 * Attenzione: la pagina si apre SEMPRE sulla pagina "Tech" con il filtro
 * asset su ASSETS[0] (NVDA), quindi solo la sua card è visibile — le altre
 * due sono nel DOM ma con display:none (vedi applyAssetFilter() in
 * Prova/index.html). Per lavorare su un altro asset serve selectAsset(). */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await page.locator("#assets-grid .asset-card").first().waitFor({ state: "visible", timeout: 10_000 });
}

/** Card di un asset della pagina Tech. Ancorata a #assets-grid e a
 * data-asset: da quando esiste anche la pagina "Trend strutturali"
 * (#robotics-grid, stessa classe .asset-card e stesso .asset-title) un
 * filtro per testo del titolo non è più univoco. */
export function assetCard(page: Page, asset: ProvaAsset): Locator {
  return page.locator(`#assets-grid .asset-card[data-asset="${asset}"]`);
}

/** Bottone del filtro asset in cima alla pagina Tech: mostra una sola card
 * alla volta (con 3 titoli le card impilate erano una lista troppo lunga
 * su mobile). Il primo asset di ASSETS è attivo al caricamento. */
export function assetFilterButton(page: Page, asset: ProvaAsset): Locator {
  return page.locator(`#asset-filter .horizon-filter-btn[data-asset="${asset}"]`);
}

/** Porta in vista la card di `asset` (se non è già quella selezionata) e
 * aspetta che sia davvero visibile: senza questo passaggio ogni azione su
 * una card diversa da NVDA finisce in timeout su un elemento display:none. */
export async function selectAsset(page: Page, asset: ProvaAsset): Promise<void> {
  const card = assetCard(page, asset);
  if (!(await card.isVisible())) {
    await assetFilterButton(page, asset).click();
  }
  await card.waitFor({ state: "visible", timeout: 10_000 });
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

/** Pannello "Che dati analizza l'AI?" della pagina Tech — figlio DIRETTO di
 * #page-tech. Da quando ogni card ha la sua tendina "Info azienda"
 * (renderCompanyInfoPanel(), stessa classe .info-panel) un
 * "details.info-panel" non ancorato matcha più elementi e fa fallire i
 * test in strict mode, non solo quelli sul pannello sbagliato. */
export function infoPanel(page: Page): Locator {
  return page.locator("#page-tech > details.info-panel");
}

/** Gemello del precedente sulla pagina "Trend strutturali": "Come funziona
 * questa pagina?" (paniere robotica/data center, fasi cicliche, cadenze). */
export function roboticsInfoPanel(page: Page): Locator {
  return page.locator("#page-robotics > details.info-panel");
}

/** Tendina "Info azienda" dentro una card (sede, anno di fondazione,
 * settore, borsa, descrizione — dati statici verificati a mano in
 * COMPANY_INFO, più i fondamentali da data/tradingview/fundamentals.json
 * per i soli asset che ce li hanno). Esiste su entrambe le pagine. */
export function companyInfoPanel(card: Locator): Locator {
  return card.locator("details.info-panel");
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

/** Prezzo di riferimento accanto al nome asset (price_at_generation
 * dell'ultima previsione, da 096dd0f) — vuoto se non c'è ancora nessuna
 * previsione salvata per quell'asset. */
export function assetPriceLabel(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(".asset-price");
}

/** Riga "istantanea prezzo" sotto il nome asset (da 40e3184): nascosta se
 * data/<asset>/snapshot.json non è ancora stato pubblicato o non c'è una
 * previsione 1g con cui confrontarlo — dato reale, cambia più volte al
 * giorno, come dataStatusNote() sopra. */
export function snapshotStatus(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(".snapshot-status");
}

// ─── TABELLE RICHIUDIBILI ("Ultimi Risultati Valutati" / "Ultimi Segnali
// Generati" / "Storico Letture") ────────────────────────────────────────────
// Le tabelle sono chiuse di default (.collapsible-content.collapsed): le
// righe esistono nel DOM ma non sono visibili, quindi un click diretto su
// una riga va in timeout invece di aprirne il dettaglio. Va aperta prima la
// sezione, come fa un utente toccandone l'intestazione.

export type ProvaTableKind = "predictions" | "outcomes";

const COLLAPSIBLE_TITLE: Record<ProvaTableKind, string> = {
  outcomes: "Ultimi Risultati Valutati",
  predictions: "Ultimi Segnali Generati",
};

/** Intestazione cliccabile di una sezione richiudibile dentro `scope`
 * (una card o la pagina intera), scelta per titolo. */
export function collapsibleHeader(scope: Locator, title: string): Locator {
  return scope.locator(".collapsible-header").filter({ hasText: title });
}

/** Il contenuto associato a quell'intestazione: è il fratello immediato
 * successivo nel DOM (vedi toggleCollapsible() in Prova/index.html, che usa
 * nextElementSibling) — non un discendente dell'header. */
export function collapsibleContent(scope: Locator, title: string): Locator {
  return collapsibleHeader(scope, title).locator("xpath=following-sibling::div[1]");
}

/** Altezza resa del contenuto di una sezione: 0 quando è chiusa. Serve
 * perché "chiuso" qui non è display:none ma max-height:0 + overflow:hidden
 * (CSS in index.html), e per Playwright una riga ritagliata resta
 * tecnicamente "visible" — solo il click fallisce, sull'hit test. Quindi
 * toBeHidden() non è l'asserzione giusta su queste righe: lo è l'altezza. */
export async function collapsibleHeight(scope: Locator, title: string): Promise<number> {
  return collapsibleContent(scope, title).evaluate((el) => el.getBoundingClientRect().height);
}

/** Apre una sezione richiudibile se è chiusa (idempotente: chiamarla due
 * volte non la richiude) e aspetta la fine della transizione di max-height,
 * non solo la rimozione della classe: cliccare una riga a metà animazione
 * può ancora mancare il bersaglio. */
export async function expandCollapsible(scope: Locator, title: string): Promise<void> {
  const content = collapsibleContent(scope, title);
  const collapsed = await content.evaluate((el) => el.classList.contains("collapsed"));
  if (collapsed) await collapsibleHeader(scope, title).click();
  await expect
    .poll(() => content.evaluate((el) => el.getBoundingClientRect().height), { timeout: 10_000 })
    .toBeGreaterThan(0);
}

/** Apre la tabella previsioni o esiti di un asset della pagina Tech.
 * Include selectAsset(): una card non selezionata è display:none, e una
 * sezione dentro una card nascosta resta invisibile anche da aperta. */
export async function openAssetTable(
  page: Page,
  asset: ProvaAsset,
  kind: ProvaTableKind
): Promise<void> {
  await selectAsset(page, asset);
  await expandCollapsible(assetCard(page, asset), COLLAPSIBLE_TITLE[kind]);
}

/** Numero massimo di righe mostrate prima di "Mostra tutto" (ROW_LIMIT in
 * Prova/index.html). */
export const ROW_LIMIT = 6;

/** Il pulsante "Mostra tutto (N)" / "Mostra solo le recenti" sotto una
 * tabella: il footer esiste sempre, il bottone dentro solo quando le righe
 * totali superano ROW_LIMIT (renderShowAllButton()). */
export function showAllButton(page: Page, asset: ProvaAsset, kind: ProvaTableKind): Locator {
  const footerId = kind === "outcomes" ? `outcomes-footer-${asset}` : `predictions-footer-${asset}`;
  return page.locator(`#${footerId} button`);
}

// ─── PAGINA "TREND STRUTTURALI" (ex Robotica) ──────────────────────────────
// Seconda pagina della stessa dashboard (nessuna navigazione, solo
// display:none su #page-tech/#page-robotics via switchPage()): legge
// data/robotics/<asset>/trend.jsonl, un sistema separato da
// predictions.jsonl (nessun esito futuro da valutare, solo l'ultima lettura
// del regime di trend 1-10 anni).

export const ROBOTICS_ASSETS = [
  { key: "THK", label: "THK" },
  { key: "HARMONIC_DRIVE", label: "Harmonic Drive Systems" },
  { key: "TER", label: "Teradyne" },
  { key: "VRT", label: "Vertiv" },
] as const;
export type ProvaRoboticsKey = (typeof ROBOTICS_ASSETS)[number]["key"];

export function pageTab(page: Page, which: "tech" | "robotics" | "report"): Locator {
  return page.locator(`#tab-btn-${which}`);
}

export function techPage(page: Page): Locator {
  return page.locator("#page-tech");
}

export function roboticsPage(page: Page): Locator {
  return page.locator("#page-robotics");
}

/** Passa alla pagina "Trend strutturali" e aspetta che la prima card
 * (THK, primo asset del paniere) sia visibile. */
export async function openRoboticsPage(page: Page): Promise<void> {
  await pageTab(page, "robotics").click();
  await roboticsCard(page, "THK").waitFor({ state: "visible", timeout: 10_000 });
}

export function roboticsCard(page: Page, key: ProvaRoboticsKey): Locator {
  return page.locator(`#robotics-grid .asset-card[data-asset="${key}"]`);
}

export function roboticsAssetFilterButton(page: Page, key: ProvaRoboticsKey): Locator {
  return page.locator(`#robotics-asset-filter .horizon-filter-btn[data-asset="${key}"]`);
}

/** Come selectAsset(), per il filtro asset della pagina Trend strutturali. */
export async function selectRoboticsAsset(page: Page, key: ProvaRoboticsKey): Promise<void> {
  const card = roboticsCard(page, key);
  if (!(await card.isVisible())) {
    await roboticsAssetFilterButton(page, key).click();
  }
  await card.waitFor({ state: "visible", timeout: 10_000 });
}

/** Corpo della card robotica: riempito da loadRoboticsData() dopo il fetch
 * di trend.jsonl — "Caricamento…" finché non arriva, poi la lettura vera o
 * lo stato "nessuna analisi ancora disponibile" (asset nuovo, cron non
 * ancora partito). */
export function roboticsBody(page: Page, key: ProvaRoboticsKey): Locator {
  return page.locator(`#robotics-body-${key}`);
}

// ─── PAGINA "REPORT" ────────────────────────────────────────────────────────
// Terza pagina della stessa dashboard (a83696d, 2026-09-18): stesso
// switchPage()/display:none delle altre due, mai una navigazione vera. Due
// contenuti diversi dietro un toggle interno (#report-type-filter, come
// #robotics-asset-filter ma su .report-section a livello pagina invece che
// .asset-card per-asset):
// - "Paniere" (default): sintesi mensile che confronta i 4 titoli di Trend
//   strutturali tra loro — un solo blocco, non per-asset (loadSectorSummary()).
// - "S&P 500"/"Nasdaq": la STESSA lettura di ciclo di Trend strutturali
//   (renderRoboticsAssetCard riusata com'è, stesso schema trend.jsonl sotto
//   data/robotics/spy|qqq/) applicata a due indici invece che a singoli
//   titoli — stessi id "#robotics-body-SPY|QQQ" della pagina gemella, MA
//   senza la tendina "Info azienda" (un indice non ha fondamentali/sede).
// Tutti e tre i blocchi vengono popolati eagerly al boot (loadReportData()
// chiamata subito insieme a loadRoboticsData(), non lazy al click sul tab).

export type ProvaReportType = "PANIERE" | "SPY" | "QQQ";

export const REPORT_TYPES: { key: ProvaReportType; label: string }[] = [
  { key: "PANIERE", label: "Paniere" },
  { key: "SPY", label: "S&P 500" },
  { key: "QQQ", label: "Nasdaq" },
];

export function reportPage(page: Page): Locator {
  return page.locator("#page-report");
}

/** Gemello di infoPanel()/roboticsInfoPanel() sulla pagina Report. */
export function reportInfoPanel(page: Page): Locator {
  return page.locator("#page-report > details.info-panel");
}

export function reportFilterButton(page: Page, key: ProvaReportType): Locator {
  return page.locator(`#report-type-filter .horizon-filter-btn[data-report="${key}"]`);
}

/** Blocco `.report-section` per un tipo di report — id in minuscolo
 * (`#report-paniere`/`#report-spy`/`#report-qqq`), a differenza della `key`
 * (sempre maiuscola, come `data-report`). */
export function reportSection(page: Page, key: ProvaReportType): Locator {
  return page.locator(`#report-${key.toLowerCase()}`);
}

/** Passa alla pagina "Report" e aspetta che sia visibile — i dati sono già
 * in caricamento da prima (vedi commento sopra), qui si aspetta solo lo
 * scheletro, stesso principio di gotoFresh()/openRoboticsPage(). */
export async function openReportPage(page: Page): Promise<void> {
  await pageTab(page, "report").click();
  await reportPage(page).waitFor({ state: "visible", timeout: 10_000 });
}

/** Come selectAsset()/selectRoboticsAsset(), per il toggle Paniere/S&P 500/
 * Nasdaq della pagina Report. */
export async function selectReport(page: Page, key: ProvaReportType): Promise<void> {
  const section = reportSection(page, key);
  if (!(await section.isVisible())) {
    await reportFilterButton(page, key).click();
  }
  await section.waitFor({ state: "visible", timeout: 10_000 });
}

/** Corpo della sintesi mensile di paniere (loadSectorSummary()): un solo
 * blocco condiviso da tutti e 4 i titoli di Trend strutturali, non per-asset. */
export function sectorSummaryBody(page: Page): Locator {
  return page.locator("#sector-summary-body");
}

/** Prezzo/direzione/corpo delle card S&P 500 o Nasdaq nella pagina Report —
 * stessi id di roboticsBody() e affini (renderRoboticsAssetCard() è
 * condivisa, vedi commento in index.html sopra #page-report), esposti qui
 * con un nome e un tipo diversi solo per chiarezza semantica nei test. */
export function reportIndexPrice(page: Page, key: "SPY" | "QQQ"): Locator {
  return page.locator(`#robotics-price-${key}`);
}
export function reportIndexDirection(page: Page, key: "SPY" | "QQQ"): Locator {
  return page.locator(`#robotics-direction-${key}`);
}
export function reportIndexBody(page: Page, key: "SPY" | "QQQ"): Locator {
  return page.locator(`#robotics-body-${key}`);
}
