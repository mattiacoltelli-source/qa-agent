import { test, expect } from "@playwright/test";
import { gotoFresh, infoPanel, predictionTimeItalian } from "../../fixtures/prova-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Regressione mirata: un <button> per errore dentro <summary> aveva rotto
// il click diretto sul pulsante (il bottone assorbiva l'evento senza farlo
// propagare al toggle nativo di <details>) — funzionava solo cliccando
// accanto al testo. Questo test clicca il summary così come lo trova un
// utente, non un elemento interno scelto per aggirare il bug.
test.describe("AI Predictor — pannello 'che dati analizza l'AI'", () => {
  test("è chiuso di default e si apre cliccando il pulsante, mostrando tutte le fonti dati", async ({
    page,
  }) => {
    await gotoFresh(page);
    const panel = infoPanel(page);

    await expect(panel).not.toHaveJSProperty("open", true);

    await panel.locator(S.summary).click();
    await expect(panel).toHaveJSProperty("open", true);

    const body = panel.locator(S.infoPanelBody);
    await expect(body).toContainText("FRED");
    await expect(body).toContainText("SEC EDGAR");
    await expect(body).toContainText("On-Balance Volume");
    await expect(body).toContainText("Chaikin Money Flow");
    await expect(body).toContainText("S&P 500");
  });

  test("mostra l'orario della previsione giornaliera in ora italiana, calcolato dinamicamente", async ({
    page,
  }) => {
    await gotoFresh(page);
    await infoPanel(page).locator(S.summary).click();

    // Calcolato lato client da PREDICTION_SLOTS_ET (ora US/Eastern) ad
    // ogni caricamento, non un valore fisso: cambia con l'ora legale/
    // solare, quindi qui si verifica solo il FORMATO (HH:MM), mai un
    // orario esatto che smetterebbe di essere vero due volte l'anno.
    await expect(predictionTimeItalian(page)).toHaveText(/^\d{2}:\d{2}$/);
  });
});

// Il pannello deve dire la verita' sulla cadenza. Dal 2026-09-30 (Prova
// fe43946) solo 1g resta giornaliera: 7g gira una volta a settimana e 1m due.
// Se questo testo tornasse a promettere "tutti gli orizzonti ogni giorno"
// sarebbe una dichiarazione falsa a chi legge la dashboard — ed e' proprio il
// tipo di scarto fra codice e pagina che nessun altro test puo' vedere,
// perche' il testo e' scritto a mano in index.html e non deriva dalla
// configurazione Python (HORIZON_CADENCE_DAYS).
//
// Si asseriscono frasi intere e non parole sparse: "1 volta a settimana" da
// sola comparirebbe anche in un contesto che non c'entra. I confronti di
// toContainText normalizzano gli a capo e gli spazi del sorgente HTML.
test.describe("AI Predictor — pannello info: cadenza e benchmark", () => {
  test("dichiara la cadenza per orizzonte: 1g ogni giorno di borsa, 7g una volta a settimana, 1m due", async ({
    page,
  }) => {
    await gotoFresh(page);
    const panel = infoPanel(page);
    await panel.locator(S.summary).click();
    const body = panel.locator(S.infoPanelBody);

    await expect(body).toContainText("1 giorno (ogni giorno di borsa)");
    await expect(body).toContainText("7 giorni (1 volta a settimana)");
    await expect(body).toContainText("1 mese (2 volte a settimana)");
    // La motivazione, perche' una cadenza ridotta senza spiegazione
    // sembrerebbe un malfunzionamento di chi vede meno previsioni 7g/1m.
    await expect(body).toContainText("Cadenze più basse per 7g/1m");
  });

  test("non promette piu' tutti e tre gli orizzonti ogni giorno", async ({ page }) => {
    await gotoFresh(page);
    const panel = infoPanel(page);
    await panel.locator(S.summary).click();
    const text = ((await panel.locator(S.infoPanelBody).textContent()) ?? "").replace(/\s+/g, " ");

    // Le formulazioni di prima della modifica: "1 giorno, 7 giorni, 1 mese"
    // elencati senza cadenza, ognuno implicitamente giornaliero.
    expect(text).not.toMatch(/1 giorno,\s*7 giorni,\s*1 mese/);
    expect(text).not.toMatch(/7 giorni \(ogni giorno/);
    expect(text).not.toMatch(/1 mese \(ogni giorno/);
  });

  test("il benchmark di settore dice quale asset usa quale: SMH per NVDA/AMD/MU, XLK per AAPL", async ({
    page,
  }) => {
    // AMD e MU condividono il benchmark di NVDA (src/config.py
    // SECTOR_BENCHMARK, tutti e tre semiconduttori): il testo e' scritto a
    // mano e va aggiornato insieme alla config, quindi e' qui che si vede
    // se ci si e' dimenticati di uno dei due gruppi.
    await gotoFresh(page);
    const panel = infoPanel(page);
    await panel.locator(S.summary).click();
    const body = panel.locator(S.infoPanelBody);

    await expect(body).toContainText("SMH per NVDA/AMD/MU");
    await expect(body).toContainText("XLK per AAPL");
  });
});
