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
  mockSectorSummary,
  collapsibleContent,
  expandCollapsible,
  REPORT_TYPES,
} from "../../fixtures/prova-page.ts";
import { S } from "../../fixtures/selectors.ts";

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

    await expect(page.locator(S.reportTypeFilterHorizonBtn)).toHaveCount(REPORT_TYPES.length);
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
    await expect(body.locator(S.badge)).toHaveText(/^(RIALZISTA|RIBASSISTA|LATERALE)$/);

    // Da 3c1403e (2026-09-18): non più un unico paragrafo misto, ma un
    // blocco per settore (ROBOTICS_SECTOR in src/config.py — mappa fissa
    // nel codice, non testo generato dal modello, quindi sicura da
    // controllare per nome esatto) più un'eventuale nota "cross-sector"
    // che li confronta. Col paniere attuale (5 asset su 2 temi) entrambi i
    // settori sono sempre rappresentati; un fallback sul vecchio formato a
    // paragrafo singolo resta legittimo per una sintesi generata prima di
    // quel commit (mai riscritta).
    const paragraphs = body.locator("p");
    const paragraphCount = await paragraphs.count();
    expect(paragraphCount, "sintesi paniere: nessun paragrafo di narrativa").toBeGreaterThan(0);
    for (let i = 0; i < paragraphCount; i++) {
      await expect(paragraphs.nth(i)).not.toBeEmpty();
    }

    const hasPerSectorFormat = text.includes("Robotica / meccanica di precisione")
      || text.includes("Infrastruttura elettrica per data center AI");
    if (hasPerSectorFormat) {
      await expect(body).toContainText("Robotica / meccanica di precisione");
      await expect(body).toContainText("Infrastruttura elettrica per data center AI");
      // Almeno due paragrafi (uno per settore); la nota cross-sector, se
      // presente, ne aggiunge un terzo — non è garantita (il modello può
      // ometterla), quindi non un conteggio esatto.
      expect(paragraphCount).toBeGreaterThanOrEqual(2);
    }

    await expect(body).toContainText("Basato sulle ultime letture disponibili di:");
  });

  // La sintesi del Paniere ridisegnata (Prova 3c1403e): due sezioni per
  // settore e una nota di confronto in fondo, al posto di un unico paragrafo
  // misto. Il test sopra, con dati veri, e' volutamente permissivo — la nota
  // di confronto il modello puo' ometterla e un giorno la sintesi potrebbe
  // essere nel vecchio formato — quindi la FORMA del rendering si prova qui,
  // dove ogni caso e' sempre quello. Vedi i commenti sui dati finti in
  // fixtures/prova-page.ts.
  const SINTESI_BASE = {
    id: "fake-sintesi",
    generated_at: "2026-09-18T10:00:00.000Z",
    overall_direction: "RIALZISTA",
    assets_snapshot: {
      THK: { generated_at: "2026-09-10T10:00:00.000Z" },
      HARMONIC_DRIVE: { generated_at: "2026-09-10T10:00:00.000Z" },
      TER: { generated_at: "2026-09-11T10:00:00.000Z" },
      VRT: { generated_at: "2026-08-20T10:00:00.000Z" },
      NVT: { generated_at: "2026-09-18T10:00:00.000Z" },
    },
  };
  const ROBOTICA = "Robotica / meccanica di precisione";
  const DATA_CENTER = "Infrastruttura elettrica per data center AI";

  test("sintesi con due settori e nota di confronto: un titolo e un paragrafo per settore, la nota in fondo", async ({
    page,
  }) => {
    await mockSectorSummary(page, [
      {
        ...SINTESI_BASE,
        sector_narratives: {
          [ROBOTICA]: "Narrativa finta del settore robotica.",
          [DATA_CENTER]: "Narrativa finta del settore data center.",
        },
        cross_sector_note: "Nota finta di confronto fra i due settori.",
      },
    ]);
    await gotoFresh(page);
    await openReportPage(page);
    const body = sectorSummaryBody(page);
    await expect(body).toContainText("RIALZISTA");

    // Due sezioni distinte, nell'ordine in cui arrivano, ciascuna col suo
    // titolo e il suo testo: non un blocco unico con i nomi dentro.
    const paragrafi = body.locator("p");
    await expect(paragrafi).toHaveCount(3);
    await expect(paragrafi.nth(0)).toHaveText("Narrativa finta del settore robotica.");
    await expect(paragrafi.nth(1)).toHaveText("Narrativa finta del settore data center.");
    await expect(body.getByText(ROBOTICA, { exact: true })).toBeVisible();
    await expect(body.getByText(DATA_CENTER, { exact: true })).toBeVisible();

    // La nota di confronto viene DOPO entrambe le sezioni, ed e' l'ultimo
    // paragrafo: "in fondo" e' la parte che la distingue da un terzo settore.
    await expect(paragrafi.nth(2)).toHaveText("Nota finta di confronto fra i due settori.");
    const ordine = await body.evaluate((el) => {
      const t = el.textContent ?? "";
      return [t.indexOf("Robotica / meccanica"), t.indexOf("Infrastruttura elettrica"), t.indexOf("Nota finta di confronto")];
    });
    expect(ordine.every((i) => i >= 0)).toBe(true);
    expect([...ordine].sort((a, b) => a - b)).toEqual(ordine);

    // Nessun paragrafo unico misto: il testo dei due settori non e' fuso.
    await expect(paragrafi.nth(0)).not.toContainText("data center");
  });

  test("senza nota di confronto: restano le due sezioni, nessun paragrafo vuoto in fondo", async ({ page }) => {
    // La nota e' opzionale (il modello puo' ometterla): l'assenza non deve
    // lasciare un buco ne' un secondo paragrafo vuoto.
    await mockSectorSummary(page, [
      {
        ...SINTESI_BASE,
        sector_narratives: { [ROBOTICA]: "Solo robotica.", [DATA_CENTER]: "Solo data center." },
      },
    ]);
    await gotoFresh(page);
    await openReportPage(page);
    const paragrafi = sectorSummaryBody(page).locator("p");
    await expect(paragrafi).toHaveCount(2);
    for (const i of [0, 1]) await expect(paragrafi.nth(i)).not.toBeEmpty();
  });

  test("sintesi nel vecchio formato (un solo paragrafo): resta leggibile, senza titoli di settore", async ({
    page,
  }) => {
    // Una sintesi generata prima del 2026-09-18 non ha sector_narratives:
    // la pagina ripiega su sector_narrative invece di mostrare un buco.
    await mockSectorSummary(page, [{ ...SINTESI_BASE, sector_narrative: "Vecchio paragrafo unico misto." }]);
    await gotoFresh(page);
    await openReportPage(page);
    const body = sectorSummaryBody(page);
    await expect(body.locator("p")).toHaveCount(1);
    await expect(body.locator("p")).toHaveText("Vecchio paragrafo unico misto.");
    await expect(body).not.toContainText(ROBOTICA);
    await expect(body).not.toContainText(DATA_CENTER);
  });

  test("elenco dei titoli su cui si basa: tutti e cinque, con NVT mostrato come 'nVent Electric'", async ({
    page,
  }) => {
    // NVT e' il quinto titolo del paniere (2026-09-18) e la sua etichetta
    // viene dalla tabella ROBOTICS_ASSETS della pagina, non dal ticker.
    await mockSectorSummary(page, [
      { ...SINTESI_BASE, sector_narratives: { [ROBOTICA]: "a", [DATA_CENTER]: "b" } },
    ]);
    await gotoFresh(page);
    await openReportPage(page);
    const body = sectorSummaryBody(page);
    await expect(body).toContainText("Basato sulle ultime letture disponibili di:");
    for (const nome of ["THK", "Harmonic Drive Systems", "Teradyne", "Vertiv", "nVent Electric"]) {
      await expect(body).toContainText(nome);
    }
    await expect(body).not.toContainText("NVT");
  });

  for (const key of ["SPY", "QQQ"] as const) {
    test(`${key}: stessa lettura di ciclo di Trend strutturali, senza la tendina "Info azienda" (un indice non ha fondamentali)`, async ({
      page,
    }) => {
      await gotoFresh(page);
      await openReportPage(page);
      await selectReport(page, key);

      const section = reportSection(page, key);
      const card = section.locator(S.assetCard);
      const body = reportIndexBody(page, key);

      await expect(body).not.toHaveText("Caricamento…", { timeout: 15_000 });

      // Nessuna tendina "Info azienda": a differenza delle card di Trend
      // strutturali (companyInfoPanel()), qui il contenitore è "più
      // semplice" per costruzione (vedi commento sopra #page-report in
      // index.html) — verifichiamo che sia davvero assente, non solo
      // che il resto funzioni.
      await expect(card.locator(S.detailsInfoPanel)).toHaveCount(0);

      const text = (await body.textContent()) ?? "";
      if (text.includes("Nessuna analisi trend ancora disponibile")) {
        return;
      }

      // Prezzo e direzione: stesso formato delle card Trend strutturali.
      await expect(reportIndexPrice(page, key)).not.toBeEmpty();
      await expect(reportIndexDirection(page, key).locator(S.badge)).toBeVisible();

      await expect(body.locator(S.cycleBadge).first()).toContainText("Fase ciclo:");
      await expect(body.locator(S.cagrGridCell)).toHaveCount(4);
      await expect(body).toContainText("Distanza da ATH:");
      await expect(body).toContainText("Distanza da massimo 52 sett.:");
      await expect(body).toContainText("Lettura strutturale");

      await expect(collapsibleContent(card, "Storico Letture")).toHaveClass(/collapsed/);
      await expandCollapsible(card, "Storico Letture");
      const historyRows = collapsibleContent(card, "Storico Letture").locator(S.tbodyTr);
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

      await expect(body.locator(S.cycleBadge).first()).toContainText("Fase ciclo:");
      await expect(body.locator(S.cagrGridCell)).toHaveCount(4);
      await expect(body.locator(S.chartEmpty)).toBeVisible();
    }
  });

  test('il pannello "Come funziona questa pagina?" spiega Paniere, S&P 500/Nasdaq e la cadenza mensile', async ({
    page,
  }) => {
    await gotoFresh(page);
    await openReportPage(page);

    const panel = reportInfoPanel(page);
    await expect(panel).not.toHaveJSProperty("open", true);
    await panel.locator(S.summary).click();
    await expect(panel).toHaveJSProperty("open", true);

    await expect(panel).toContainText("Paniere");
    await expect(panel).toContainText("S&P 500");
    await expect(panel).toContainText("Nasdaq");
    await expect(panel).toContainText("mensile");
  });
});
