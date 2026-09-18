import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  pageTab,
  techPage,
  reportPage,
  reportInfoPanel,
  openReportPage,
  reportFilterButton,
  reportSection,
  selectReport,
  sectorSummaryBody,
  reportIndexPrice,
  reportIndexDirection,
  reportIndexBody,
  collapsibleContent,
  expandCollapsible,
  REPORT_TYPES,
} from "../../fixtures/prova-page.ts";

// Terza pagina della stessa dashboard (a83696d, 2026-09-18) — vedi il
// commento esteso sopra le funzioni "PAGINA REPORT" in fixtures/prova-page.ts
// per come si relaziona alle altre due. Dati reali come il resto dell'app
// (vedi README): questi test verificano comportamento e forma, mai un
// valore o una direzione specifica.
test.describe("AI Predictor — pagina Report", () => {
  test("terza pagina alternativa alle altre due: Tech attiva al caricamento, il tab porta al Report", async ({
    page,
  }) => {
    await gotoFresh(page);

    await expect(pageTab(page, "report")).not.toHaveClass(/active/);
    await expect(pageTab(page, "report")).toHaveText("Report");
    await expect(reportPage(page)).toBeHidden();

    await openReportPage(page);
    await expect(pageTab(page, "report")).toHaveClass(/active/);
    await expect(pageTab(page, "tech")).not.toHaveClass(/active/);
    await expect(reportPage(page)).toBeVisible();
    await expect(techPage(page)).toBeHidden();

    // Un interruttore, non un vicolo cieco: si torna a Tech senza perdere
    // nulla (la pagina resta nel DOM, solo display:none).
    await pageTab(page, "tech").click();
    await expect(techPage(page)).toBeVisible();
    await expect(reportPage(page)).toBeHidden();
  });

  test('toggle "Paniere / S&P 500 / Nasdaq": un blocco alla volta, Paniere attivo di default', async ({
    page,
  }) => {
    await gotoFresh(page);
    await openReportPage(page);

    await expect(page.locator("#report-type-filter .horizon-filter-btn")).toHaveCount(REPORT_TYPES.length);
    for (const { key, label } of REPORT_TYPES) {
      await expect(reportFilterButton(page, key)).toHaveText(label);
    }
    await expect(reportFilterButton(page, "PANIERE")).toHaveClass(/active/);
    await expect(reportSection(page, "PANIERE")).toBeVisible();
    await expect(reportSection(page, "SPY")).toBeHidden();
    await expect(reportSection(page, "QQQ")).toBeHidden();

    for (const { key } of REPORT_TYPES) {
      await selectReport(page, key);
      await expect(reportSection(page, key)).toBeVisible();
      for (const other of REPORT_TYPES.filter((r) => r.key !== key)) {
        await expect(reportSection(page, other.key)).toBeHidden();
      }
    }
  });

  test('sintesi mensile di paniere: badge di direzione, narrativa e titoli su cui si basa — o la dichiarazione che non è ancora disponibile', async ({
    page,
  }) => {
    await gotoFresh(page);
    await openReportPage(page);

    const body = sectorSummaryBody(page);
    // loadSectorSummary() parte da "Caricamento..." (senza puntini lunghi,
    // a differenza di roboticsBody() — verificato sul sorgente reale) e lo
    // riscrive dopo il fetch di sector_summary.jsonl.
    await expect(body).not.toHaveText("Caricamento...", { timeout: 15_000 });

    const text = (await body.textContent()) ?? "";
    if (text.includes("Sintesi non ancora generata")) {
      // Prima del primo run mensile che genera sector_summary.jsonl: stato
      // legittimo, stesso principio di "Nessuna analisi trend ancora
      // disponibile" per un singolo asset in Trend strutturali.
      return;
    }

    // Badge di direzione: una delle tre etichette italiane reali (non
    // "UP/DOWN/FLAT", quelle sono solo il nome interno della classe CSS —
    // vedi TREND_DIRECTION_BADGE_CLASS in index.html).
    await expect(body.locator(".badge")).toHaveText(/^(RIALZISTA|RIBASSISTA|LATERALE)$/);
    await expect(body.locator("p")).not.toBeEmpty();
    await expect(body).toContainText("Basato sulle ultime letture disponibili di:");
  });

  for (const key of ["SPY", "QQQ"] as const) {
    test(`${key}: stessa lettura di ciclo di Trend strutturali, senza la tendina "Info azienda" (un indice non ha fondamentali)`, async ({
      page,
    }) => {
      await gotoFresh(page);
      await openReportPage(page);
      await selectReport(page, key);

      const section = reportSection(page, key);
      const card = section.locator(".asset-card");
      const body = reportIndexBody(page, key);

      await expect(body).not.toHaveText("Caricamento…", { timeout: 15_000 });

      // Nessuna tendina "Info azienda": a differenza delle card di Trend
      // strutturali (companyInfoPanel()), qui il contenitore è "più
      // semplice" per costruzione (vedi commento sopra #page-report in
      // index.html) — verifichiamo che sia davvero assente, non solo
      // che il resto funzioni.
      await expect(card.locator("details.info-panel")).toHaveCount(0);

      const text = (await body.textContent()) ?? "";
      if (text.includes("Nessuna analisi trend ancora disponibile")) {
        return;
      }

      // Prezzo e direzione: stesso formato delle card Trend strutturali.
      await expect(reportIndexPrice(page, key)).not.toBeEmpty();
      await expect(reportIndexDirection(page, key).locator(".badge")).toBeVisible();

      await expect(body.locator(".cycle-badge").first()).toContainText("Fase ciclo:");
      await expect(body.locator(".cagr-grid .cagr-cell")).toHaveCount(4);
      await expect(body).toContainText("Distanza da ATH:");
      await expect(body).toContainText("Distanza da massimo 52 sett.:");
      await expect(body).toContainText("Lettura strutturale");

      await expect(collapsibleContent(card, "Storico Letture")).toHaveClass(/collapsed/);
      await expandCollapsible(card, "Storico Letture");
      const historyRows = collapsibleContent(card, "Storico Letture").locator("tbody tr");
      expect(await historyRows.count(), `${key}: storico letture vuoto`).toBeGreaterThan(0);
    });
  }

  test('se Chart.js non si carica, le card S&P 500/Nasdaq restano leggibili: nessuna resta su "Caricamento…" (stessa regressione di Trend strutturali, f97653f)', async ({
    page,
  }) => {
    await page.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
    await gotoFresh(page);
    await openReportPage(page);

    for (const key of ["SPY", "QQQ"] as const) {
      await selectReport(page, key);
      const body = reportIndexBody(page, key);
      await expect(body, `${key}: card ferma sullo scheletro di caricamento`).not.toHaveText(
        "Caricamento…",
        { timeout: 15_000 }
      );

      const text = (await body.textContent()) ?? "";
      if (text.includes("Nessuna analisi trend ancora disponibile")) continue;

      await expect(body.locator(".cycle-badge").first()).toContainText("Fase ciclo:");
      await expect(body.locator(".cagr-grid .cagr-cell")).toHaveCount(4);
      await expect(body.locator(".chart-empty")).toBeVisible();
    }
  });

  test('il pannello "Come funziona questa pagina?" spiega Paniere, S&P 500/Nasdaq e la cadenza mensile', async ({
    page,
  }) => {
    await gotoFresh(page);
    await openReportPage(page);

    const panel = reportInfoPanel(page);
    await expect(panel).not.toHaveJSProperty("open", true);
    await panel.locator("summary").click();
    await expect(panel).toHaveJSProperty("open", true);

    await expect(panel).toContainText("Paniere");
    await expect(panel).toContainText("S&P 500");
    await expect(panel).toContainText("Nasdaq");
    await expect(panel).toContainText("mensile");
  });
});
