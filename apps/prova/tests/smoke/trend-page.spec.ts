import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  pageTab,
  techPage,
  explorePage,
  roboticsPage,
  reportPage,
  exploreSubTab,
  roboticsInfoPanel,
  openRoboticsPage,
  roboticsCard,
  roboticsBody,
  roboticsAssetFilterButton,
  selectRoboticsAsset,
  collapsibleContent,
  expandCollapsible,
  ROBOTICS_ASSETS,
} from "../../fixtures/prova-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Sotto-pagina di "Approfondimenti" (switchExplorePage() mostra/nasconde
// #page-robotics dentro #page-explore — fino al 2026-10-30 era un tab di
// primo livello, accorpata in 7639e24), rietichettata "Trend strutturali"
// da 1fcb9c4 perché il paniere non è più solo robotica — Vertiv è
// infrastruttura per data center AI.
//
// I dati vengono da data/robotics/<asset>/trend.jsonl, generati da
// trend_run.py con cadenza mensile (trimestrale per Vertiv): un asset
// appena aggiunto può non avere ancora nessuna lettura, quindi i test
// accettano sia la card popolata sia lo stato "nessuna analisi ancora
// disponibile", mai un terzo esito.
test.describe("AI Predictor — pagina Trend strutturali", () => {
  test("tre tab di primo livello: Trading AI attiva al caricamento, Tech e Approfondimenti (coi suoi trend) si raggiungono dai rispettivi tab", async ({
    page,
  }) => {
    // Qui serve il caricamento GREZZO della pagina (non gotoFresh(), che
    // forza il tab Tech per tutti gli altri test di questa suite) per
    // verificare DAVVERO quale pagina è attiva di default. Da 22b3301/
    // 9a3a255 (2026-11-01) non è più Tech ma "Trading AI", diventata il
    // cuore della navigazione — Tech e Approfondimenti sono le due
    // pagine secondarie.
    await page.goto(".");
    await expect(pageTab(page, "aitrader")).toHaveClass(/active/);
    await expect(pageTab(page, "tech")).not.toHaveClass(/active/);
    await expect(page.locator("#page-aitrader")).toBeVisible();
    await expect(techPage(page)).toBeHidden();

    await pageTab(page, "tech").click();
    await expect(pageTab(page, "tech")).toHaveClass(/active/);
    await expect(pageTab(page, "aitrader")).not.toHaveClass(/active/);
    await expect(techPage(page)).toBeVisible();
    await expect(page.locator("#page-aitrader")).toBeHidden();

    // Approfondimenti si apre sulla sotto-pagina Trend strutturali di
    // default (explore-btn-robotics già "active" in HTML): l'etichetta del
    // sotto-tab è solo "Trend", non più "Trend strutturali" come quando
    // era un tab di primo livello.
    await pageTab(page, "explore").click();
    await expect(pageTab(page, "explore")).toHaveClass(/active/);
    await expect(techPage(page)).toBeHidden();
    await expect(exploreSubTab(page, "robotics")).toHaveClass(/active/);
    await expect(exploreSubTab(page, "robotics")).toHaveText("Trend");
    await expect(roboticsPage(page)).toBeVisible();
    await expect(reportPage(page)).toBeHidden();

    // E si torna indietro: i tab sono un interruttore, non un vicolo
    // cieco (le pagine non vengono ricostruite, solo rivelate/nascoste).
    await pageTab(page, "tech").click();
    await expect(techPage(page)).toBeVisible();
    await expect(explorePage(page)).toBeHidden();
  });

  test("filtro asset: i cinque titoli del paniere, una card alla volta", async ({ page }) => {
    await gotoFresh(page);
    await openRoboticsPage(page);

    await expect(page.locator(S.roboticsAssetFilterHorizonBtn)).toHaveCount(
      ROBOTICS_ASSETS.length
    );
    // Vertiv (VRT) è l'aggiunta di 1fcb9c4, Teradyne (TER) quella
    // precedente, nVent Electric (NVT) la più recente (2026-09-18, quinto
    // titolo): se il paniere in index.html tornasse a un sottoinsieme più
    // corto questo test lo direbbe subito — il conteggio sopra confronta
    // sempre contro ROBOTICS_ASSETS, mai un numero scritto a mano.
    for (const { key, label } of ROBOTICS_ASSETS) {
      await expect(roboticsAssetFilterButton(page, key)).toHaveText(label);
    }
    await expect(roboticsAssetFilterButton(page, "THK")).toHaveClass(/active/);

    for (const { key } of ROBOTICS_ASSETS) {
      await selectRoboticsAsset(page, key);
      await expect(roboticsCard(page, key)).toBeVisible();
      for (const other of ROBOTICS_ASSETS.filter((a) => a.key !== key)) {
        await expect(roboticsCard(page, other.key)).toBeHidden();
      }
    }
  });

  test("ogni card mostra la lettura del ciclo (fase, CAGR, storico) o dichiara che non c'è ancora", async ({
    page,
  }) => {
    await gotoFresh(page);
    await openRoboticsPage(page);

    for (const { key, label } of ROBOTICS_ASSETS) {
      await selectRoboticsAsset(page, key);
      const card = roboticsCard(page, key);
      const body = roboticsBody(page, key);

      // Il corpo parte da "Caricamento…" e viene riscritto dal fetch di
      // trend.jsonl: aspettiamo che quello stato transitorio sia passato
      // invece di leggere un DOM a metà.
      await expect(body).not.toHaveText("Caricamento…", { timeout: 15_000 });

      const text = (await body.textContent()) ?? "";
      if (text.includes("Nessuna analisi trend ancora disponibile")) {
        // Asset appena aggiunto al paniere (o primo cron non ancora
        // partito): stato legittimo, non un errore di caricamento.
        continue;
      }

      await expect(body.locator(S.cycleBadge).first()).toContainText("Fase ciclo:");
      // CAGR su 1/3/5/10 anni: quattro celle sempre, con "—" dove lo
      // storico non arriva (10 anni per un titolo quotato da meno).
      await expect(body.locator(S.cagrGridCell)).toHaveCount(4);
      await expect(body).toContainText("Distanza da ATH:");
      await expect(body).toContainText("Distanza da massimo 52 sett.:");
      await expect(body).toContainText("Valutazione ciclo");
      // Lettura strutturale, non una previsione a un orizzonte: è la
      // distinzione che la pagina Tech NON fa, e che qui va detta.
      await expect(body).toContainText("Lettura strutturale");

      // Storico letture: richiudibile, chiuso di default, con una riga per
      // ogni lettura mai generata (verificabilità nel tempo).
      await expect(collapsibleContent(card, "Storico Letture")).toHaveClass(/collapsed/);
      await expandCollapsible(card, "Storico Letture");
      const historyRows = collapsibleContent(card, "Storico Letture").locator(S.tbodyTr);
      expect(await historyRows.count(), `${label}: storico letture vuoto`).toBeGreaterThan(0);
    }
  });

  test("se Chart.js non si carica, le card restano leggibili: nessuna resta su \"Caricamento…\"", async ({
    page,
  }) => {
    // Regressione reale: loadRoboticsData() disegna le card in un ciclo
    // sequenziale, e finché non ha avuto un try/catch bastava un errore su
    // una sola card (Chart.js assente = renderRoboticsCycleChart lancia) per
    // interrompere il for e lasciare TUTTI gli asset successivi su
    // "Caricamento…", per sempre e senza messaggio. Bloccare il CDN qui
    // riproduce esattamente quel caso — che in produzione capita quando
    // jsdelivr è irraggiungibile, non solo in un sandbox.
    //
    // Dal 2026-11-05 jsdelivr da solo non basta più: la pagina ripiega da
    // sola su cdnjs se `typeof Chart === 'undefined'` dopo il primo
    // <script> (16 "Chart is not defined" segnalati da Sentry quel giorno),
    // quindi va bloccato anche il CDN di ripiego perché Chart.js resti
    // DAVVERO assente, come intende questo test.
    await page.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
    await page.route(/cdnjs\.cloudflare\.com/, (route) => route.abort());
    await gotoFresh(page);
    await openRoboticsPage(page);

    for (const { key, label } of ROBOTICS_ASSETS) {
      await selectRoboticsAsset(page, key);
      const body = roboticsBody(page, key);
      await expect(body, `${label}: card ferma sullo scheletro di caricamento`).not.toHaveText(
        "Caricamento…",
        { timeout: 15_000 }
      );

      const text = (await body.textContent()) ?? "";
      if (text.includes("Nessuna analisi trend ancora disponibile")) continue;

      // Il contenuto che NON dipende da Chart.js resta tutto al suo posto…
      await expect(body.locator(S.cycleBadge).first()).toContainText("Fase ciclo:");
      await expect(body.locator(S.cagrGridCell)).toHaveCount(4);
      // …e al posto del grafico c'è un messaggio, non un riquadro vuoto.
      await expect(body.locator(S.chartEmpty)).toBeVisible();
    }
  });

  test("il pannello \"Come funziona questa pagina?\" spiega paniere, fasi cicliche e cadenze", async ({
    page,
  }) => {
    await gotoFresh(page);
    await openRoboticsPage(page);

    const panel = roboticsInfoPanel(page);
    await expect(panel).not.toHaveJSProperty("open", true);
    await panel.locator(S.summary).click();

    const body = panel.locator(S.infoPanelBody);
    await expect(body).toContainText("THK");
    await expect(body).toContainText("Harmonic Drive");
    await expect(body).toContainText("Teradyne");
    await expect(body).toContainText("Vertiv");
    // nVent Electric, quinto titolo del paniere (aggiunto il 2026-09-18):
    // stesso trattamento mensile di THK/Harmonic Drive/Teradyne, non di
    // Vertiv (trimestrale) — vedi ASSET_CADENCE_MONTHS in src/config.py.
    await expect(body).toContainText("nVent Electric");
    // Cadenza differenziata (mensile vs trimestrale per Vertiv, da 1fcb9c4)
    // e limiti dichiarati del modello: le due cose che rendono leggibile
    // una lettura mensile senza fraintenderla per una previsione.
    await expect(body).toContainText("trimestrale");
    await expect(body).toContainText("^SOX");
  });
});
