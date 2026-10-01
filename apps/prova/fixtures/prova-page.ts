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
import { S } from "./selectors.ts";

// AMD e' il quarto asset Tech dal 2026-10-01 (Prova 561233a): volatilita'
// quasi doppia del resto del paniere (ATR% ~4.2 contro ~2.0-2.3), stesso
// benchmark di settore di NVDA (SMH). Tutti i test per-asset iterano su
// questa lista, quindi aggiungere un asset qui basta a coprirlo ovunque —
// e a rompere, di proposito, ogni asserzione che avesse un conteggio
// scritto a mano.
export const ASSETS = ["NVDA", "MSFT", "AAPL", "AMD"] as const;
export type ProvaAsset = (typeof ASSETS)[number];

/** Naviga sulla dashboard e aspetta che le card asset siano nel DOM.
 * renderAssetCards() gira sincrono al load; i dati veri (renderAssetData,
 * via fetch ai file JSONL) arrivano subito dopo in modo asincrono — i test
 * devono comunque aspettare gli elementi specifici che leggono, questo
 * helper garantisce solo che lo scheletro della pagina sia pronto.
 *
 * Attenzione: la pagina si apre SEMPRE sulla pagina "Tech" con il filtro
 * asset su ASSETS[0] (NVDA), quindi solo la sua card è visibile — le altre
 * sono nel DOM ma con display:none (vedi applyAssetFilter() in
 * Prova/index.html). Per lavorare su un altro asset serve selectAsset(). */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await page.locator(S.assetsGridAssetCard).first().waitFor({ state: "visible", timeout: 10_000 });
}

/** Card di un asset della pagina Tech. Ancorata a #assets-grid e a
 * data-asset: da quando esiste anche la pagina "Trend strutturali"
 * (#robotics-grid, stessa classe .asset-card e stesso .asset-title) un
 * filtro per testo del titolo non è più univoco. */
export function assetCard(page: Page, asset: ProvaAsset): Locator {
  return page.locator(`#assets-grid .asset-card[data-asset="${asset}"]`);
}

/** Bottone del filtro asset in cima alla pagina Tech: mostra una sola card
 * alla volta (le card impilate erano una lista troppo lunga su mobile). Il primo asset di ASSETS è attivo al caricamento. */
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
  return assetCard(page, asset).locator(S.detailsChart);
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
  return page.locator(S.pageTechDetailsInfoPanel);
}

/** Gemello del precedente sulla pagina "Trend strutturali": "Come funziona
 * questa pagina?" (paniere robotica/data center, fasi cicliche, cadenze). */
export function roboticsInfoPanel(page: Page): Locator {
  return page.locator(S.pageRoboticsDetailsInfoPanel);
}

/** Tendina "Info azienda" dentro una card (sede, anno di fondazione,
 * settore, borsa, descrizione — dati statici verificati a mano in
 * COMPANY_INFO, più i fondamentali da data/tradingview/fundamentals.json
 * per i soli asset che ce li hanno). Esiste su entrambe le pagine. */
export function companyInfoPanel(card: Locator): Locator {
  return card.locator(S.detailsInfoPanel);
}

export function predictionRows(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(S.tbodyTrPredRow);
}

export function outcomeRows(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(S.tbodyTrOutcomeRow);
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
 * sopra le card asset — un filtro solo, condiviso da tutte le card. */
export function horizonFilterButton(page: Page, horizon: ProvaHorizonFilter): Locator {
  return page.locator(`.horizon-filter-btn[data-horizon="${horizon}"]`);
}

export function accuracyBadge(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(S.badgeAccuracy);
}

/** Nota "dati mancanti" sotto il nome dell'asset: vuota/nascosta se
 * l'ultimo segnale aveva tutte le fonti opzionali disponibili (dato
 * reale, cambia ogni giorno — vedi missingDataNote() in index.html). */
export function dataStatusNote(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(S.status);
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
  return assetCard(page, asset).locator(S.assetPrice);
}

/** Riga "istantanea prezzo" sotto il nome asset (da 40e3184): nascosta se
 * data/<asset>/snapshot.json non è ancora stato pubblicato o non c'è una
 * previsione 1g con cui confrontarlo — dato reale, cambia più volte al
 * giorno, come dataStatusNote() sopra. */
export function snapshotStatus(page: Page, asset: ProvaAsset): Locator {
  return assetCard(page, asset).locator(S.snapshotStatus);
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
  return scope.locator(S.collapsibleHeader).filter({ hasText: title });
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

/** Il messaggio che la tabella mostra quando il file dei dati non risponde
 * (parseJsonl() in index.html restituisce ok:false su QUALUNQUE risposta non
 * ok, un 404 compreso). */
export const MSG_DATI_NON_RAGGIUNGIBILI = "Dati non raggiungibili al momento";

/** True se il file degli esiti di un asset non esiste ancora (404).
 *
 * Serve a distinguere due situazioni che la pagina mostra IDENTICHE: un asset
 * appena aggiunto, senza nessun esito valutato e quindi senza outcomes.jsonl
 * (AMD, 2026-10-01), e una vera interruzione dei dati. In entrambi i casi la
 * card dice "Dati non raggiungibili al momento. Riprova piu' tardi." — per
 * il primo e' fuorviante, e' un'assenza normale e non un guasto — ma
 * solo nel secondo c'e' qualcosa che questi test devono far notare.
 * Chiedere il file direttamente toglie l'ambiguita' senza scrivere nel test
 * il nome di un asset: il caso "nuovo" si esaurisce da solo quando la
 * pipeline crea il primo esito. */
export async function outcomesFileMissing(page: Page, asset: ProvaAsset): Promise<boolean> {
  const url = new URL(`data/${asset.toLowerCase()}/outcomes.jsonl`, page.url()).toString();
  const res = await page.request.get(url, { headers: { "cache-control": "no-store" } });
  return res.status() === 404;
}

/** Quante righe ha la tabella di un asset, DOPO che i dati sono arrivati.
 *
 * gotoFresh() garantisce solo lo scheletro: i file JSONL arrivano dopo, in
 * modo asincrono (loadDashboardData()), e per un istante la tabella ha zero
 * righe e nemmeno il messaggio "Nessuna predizione registrata." — contare
 * subito legge uno zero che non vuol dire "nessun dato". Misurato su una
 * connessione lenta: le righe di NVDA compaiono circa 1.5 secondi dopo lo
 * scheletro. Chi leggeva `rows.count()` subito e poi, su zero, si aspettava
 * il messaggio di tabella vuota, falliva a intermittenza — e con un quarto
 * asset da scaricare l'attesa si allunga ancora.
 *
 * Il segnale di "ho finito" e' uno dei due esiti veri: almeno una riga, oppure
 * il messaggio di tabella vuota (che un asset appena aggiunto, come AMD, puo'
 * mostrare davvero per gli esiti). */
export async function settledRowCount(
  page: Page,
  asset: ProvaAsset,
  kind: ProvaTableKind
): Promise<number> {
  const rows = kind === "outcomes" ? outcomeRows(page, asset) : predictionRows(page, asset);
  const emptyText = kind === "outcomes" ? "Nessuna valutazione ancora." : "Nessuna predizione registrata.";
  await expect
    .poll(
      async () => {
        if ((await rows.count()) > 0) return true;
        const text = (await assetCard(page, asset).textContent()) ?? "";
        // Anche "dati non raggiungibili" e' un esito: la tabella ha finito
        // di caricarsi, solo che non c'e' niente da mostrare. Se sia un
        // guasto o un file non ancora creato lo decide chi legge il
        // risultato (vedi outcomesFileMissing()), non l'attesa.
        return text.includes(emptyText) || text.includes(MSG_DATI_NON_RAGGIUNGIBILI);
      },
      { timeout: 20_000, message: `${asset}: ne' righe ne' messaggio di tabella vuota (${kind})` }
    )
    .toBe(true);
  return rows.count();
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
  // nVent Electric, aggiunto il 2026-09-18: mensile come THK/Harmonic
  // Drive/Teradyne (solo Vertiv resta trimestrale), infrastruttura
  // elettrica per data center AI insieme a Vertiv — vedi config.py.
  { key: "NVT", label: "nVent Electric" },
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
// - "Paniere" (default): sintesi mensile che confronta i 5 titoli di Trend
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
  return page.locator(S.pageReportDetailsInfoPanel);
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
 * blocco condiviso da tutti e 5 i titoli di Trend strutturali, non per-asset. */
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

// ─── DATI FINTI (solo dove serve un caso che i dati veri non garantiscono) ──
// Il principio di questa suite resta "dati reali, forma e comportamento"
// (vedi README). Qui si fa un'eccezione, e per una ragione precisa: certi
// casi dipendono dall'ETA' o dalla FORMA dei dati, e quelli veri cambiano
// ogni giorno — una previsione "vecchia, senza regime di mercato" esiste
// finche' non esce dalle ultime sei righe, una sintesi paniere "nel vecchio
// formato" non esiste affatto. Per provarli in modo deterministico si
// risponde noi ai file statici.
//
// Nessun rischio per i dati: Prova non ha backend ne' scritture, e la
// pagina legge soltanto questi file. L'intercettazione vale per il solo
// contesto del test.

export type FakeRegime = {
  spy_return_1d_pct?: number;
  spy_return_5d_pct?: number;
  spy_return_20d_pct?: number;
  qqq_return_1d_pct?: number;
  qqq_return_5d_pct?: number;
  qqq_return_20d_pct?: number;
  vix?: { value: number; percentile: number; date?: string };
  risk_mode?: string;
};

export type FakePredictionOpts = {
  asset: ProvaAsset;
  /** Distingue le righe: finisce nell'id e nella motivazione. */
  n: number;
  horizon?: "1d" | "7d" | "1m";
  /** ISO. Le righe piu' recenti stanno in alto nella tabella. */
  generatedAt: string;
  /** Assente = previsione generata prima del 2026-09-23, senza regime. */
  regime?: FakeRegime;
};

/** Una previsione nella forma che la pagina legge, con soli i campi che
 * il rendering usa. I nomi e i tipi vengono da una riga vera di
 * data/<asset>/predictions.jsonl. */
export function fakePrediction(o: FakePredictionOpts) {
  const horizon = o.horizon ?? "1d";
  return {
    asset: o.asset,
    id: `fake-${o.asset}-${horizon}-${o.n}`,
    generated_at: o.generatedAt,
    target_at: new Date(Date.parse(o.generatedAt) + 86_400_000).toISOString(),
    horizon,
    predicted_class: "UP",
    confidence: 60,
    reasoning_short: `Motivazione finta numero ${o.n}`,
    price_at_generation: 100,
    volatility_threshold_pct: 2,
    probability_up: 0.5,
    probability_down: 0.2,
    probability_flat: 0.3,
    inputs_summary: {
      news_count: 3,
      macro_keys: ["cpi"],
      fundamentals_source: "sec_edgar",
      insider_summary: { buy_transactions: 0, sell_transactions: 1, net_shares: -10, lookback_days: 30 },
      analyst_outlook: { eps_estimate_average: "1.0", eps_estimate_analyst_count: "10", fiscal_quarter_ending: "2026-12-31" },
      technicals: {},
      ...(o.regime ? { market_regime: o.regime } : {}),
    },
  };
}

/** Risponde ai due file di un asset con le righe date; gli esiti restano
 * vuoti (file presente, nessuna riga) cosi' la tabella esiti mostra il suo
 * stato "Nessuna valutazione ancora." invece di dipendere da dati veri. */
export async function mockAssetData(
  page: Page,
  asset: ProvaAsset,
  predictions: ReturnType<typeof fakePrediction>[]
): Promise<void> {
  const a = asset.toLowerCase();
  await page.route(new RegExp(`/data/${a}/predictions\\.jsonl`), (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: predictions.map((p) => JSON.stringify(p)).join("\n") + "\n",
    })
  );
  await page.route(new RegExp(`/data/${a}/outcomes\\.jsonl`), (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "" })
  );
}

/** Risponde a data/robotics/sector_summary.jsonl (la sintesi del Paniere)
 * con le righe date. Una riga per sintesi: la pagina legge l'ultima. */
export async function mockSectorSummary(page: Page, records: unknown[]): Promise<void> {
  await page.route(/\/data\/robotics\/sector_summary\.jsonl/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: records.map((r) => JSON.stringify(r)).join("\n") + "\n",
    })
  );
}
