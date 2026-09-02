import { test, expect } from "@playwright/test";
import { gotoFresh, infoPanel, predictionTimeItalian } from "../../fixtures/prova-page.ts";

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

    await panel.locator("summary").click();
    await expect(panel).toHaveJSProperty("open", true);

    const body = panel.locator(".info-panel-body");
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
    await infoPanel(page).locator("summary").click();

    // Calcolato lato client da PREDICTION_SLOTS_ET (ora US/Eastern) ad
    // ogni caricamento, non un valore fisso: cambia con l'ora legale/
    // solare, quindi qui si verifica solo il FORMATO (HH:MM), mai un
    // orario esatto che smetterebbe di essere vero due volte l'anno.
    await expect(predictionTimeItalian(page)).toHaveText(/^\d{2}:\d{2}$/);
  });
});
