import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  assetCard,
  assetFilterButton,
  selectAsset,
  waitForAssetData,
  dataStatusNote,
  assetPriceLabel,
  snapshotStatus,
  ASSETS,
} from "../../fixtures/prova-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Nessun mock qui: la dashboard legge dati reali generati dalla pipeline
// Python (GitHub Actions), non un backend che possiamo controllare da questi
// test. L'obiettivo è verificare che la UI mostri correttamente QUALUNQUE
// previsione reale sia stata generata, non un contenuto specifico.
//
// Da settembre 2026 la pagina Tech mostra UNA card alla volta (filtro asset
// in cima, default ASSETS[0]): le altre restano nel DOM con
// display:none. Ogni test che legge qualcosa dentro una card passa quindi
// per selectAsset() — senza, tutte le asserzioni su AAPL/AMD/MU girerebbero
// su elementi invisibili (o andrebbero in timeout sui click).
test.describe("AI Predictor — caricamento dashboard", () => {
  test("header, statistiche riassuntive e una card asset alla volta", async ({ page }) => {
    await gotoFresh(page);

    await expect(page.locator("h1")).toContainText("AI Predictor");
    await expect(page.locator("#stat-accuracy")).toBeVisible();
    await expect(page.locator("#stat-outcomes")).toBeVisible();
    await expect(page.locator("#stat-pending")).toBeVisible();

    // Al caricamento è selezionato il primo asset del paniere: la sua card
    // è visibile, le altre esistono ma sono nascoste.
    await expect(assetCard(page, ASSETS[0])).toBeVisible();
    for (const asset of ASSETS.slice(1)) {
      await expect(assetCard(page, asset)).toBeHidden();
    }

    // Ogni asset, selezionato a turno, popola la sua card.
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      const card = assetCard(page, asset);
      await expect(card).toBeVisible();
      // Prima i dati, poi il badge: "Accuratezza: 0.0%" e' gia' nello
      // scheletro, da solo non prova che la card si sia popolata.
      await waitForAssetData(page, asset);
      await expect(card.locator(S.badgeAccuracy)).toContainText("Accuratezza:");
    }
  });

  test("filtro asset: un bottone per asset, uno solo attivo, cambia la card in vista", async ({
    page,
  }) => {
    await gotoFresh(page);

    await expect(page.locator(S.assetFilterHorizonBtn)).toHaveCount(ASSETS.length);
    await expect(assetFilterButton(page, ASSETS[0])).toHaveClass(/active/);
    for (const asset of ASSETS.slice(1)) {
      await expect(assetFilterButton(page, asset)).not.toHaveClass(/active/);
    }

    const other = ASSETS[1];
    await assetFilterButton(page, other).click();
    await expect(assetFilterButton(page, other)).toHaveClass(/active/);
    await expect(assetFilterButton(page, ASSETS[0])).not.toHaveClass(/active/);
    await expect(assetCard(page, other)).toBeVisible();
    await expect(assetCard(page, ASSETS[0])).toBeHidden();
  });

  test("il paniere Tech ha quattro asset, con AMD per ultimo: un bottone e una card ciascuno", async ({
    page,
  }) => {
    // Dalla modifica del 2026-10-01 (Prova 561233a). Gli altri test leggono
    // ASSETS.length e quindi si adattano da soli a qualunque numero: questo
    // fissa il numero e l'ordine reali, cosi' che un asset tolto o aggiunto
    // senza volerlo non passi inosservato.
    await gotoFresh(page);

    await expect(page.locator(S.assetFilterHorizonBtn)).toHaveCount(4);
    await expect(page.locator(S.assetFilterHorizonBtn)).toHaveText(["NVDA", "AAPL", "AMD", "MU"]);
    await expect(page.locator("#assets-grid .asset-card")).toHaveCount(4);

    // La card di AMD esiste, e' l'ultima, e partendo da NVDA resta nascosta
    // finche' non la si sceglie dal filtro.
    await expect(assetCard(page, "AMD")).toBeHidden();
    await assetFilterButton(page, "AMD").click();
    await expect(assetFilterButton(page, "AMD")).toHaveClass(/active/);
    await expect(assetCard(page, "AMD")).toBeVisible();
    await expect(assetCard(page, "NVDA")).toBeHidden();
    await expect(assetCard(page, "AMD").locator(S.badgeAccuracy)).toContainText("Accuratezza:");
  });

  test("AMD appena aggiunto: la card si carica anche senza esiti valutati e senza istantanea prezzo", async ({
    page,
  }) => {
    // Un asset nuovo ha le previsioni ma non ancora gli esiti (gli
    // orizzonti non sono scaduti) ne' data/amd/snapshot.json: sono stati
    // legittimi, non errori di caricamento. Il caso rilevante e' che la
    // card di AMD NON resti bloccata sullo scheletro e che il suo grafico
    // accuratezza mostri il messaggio "nessun dato" invece di un canvas
    // vuoto. Se AMD ha gia' esiti veri, il ramo "con dati" e' coperto dagli
    // altri test e questo si limita a non fallire.
    await gotoFresh(page);
    await selectAsset(page, "AMD");
    const card = assetCard(page, "AMD");

    // La card non e' rimasta sullo scheletro: le righe segnaposto sono state
    // sostituite. (Il badge "Accuratezza:" non basta come prova: c'e' gia'
    // nello scheletro.)
    await waitForAssetData(page, "AMD");
    await expect(card.locator(S.badgeAccuracy)).toContainText("Accuratezza:");
    // Il grafico accuratezza e' sempre visibile: canvas con dati, oppure il
    // messaggio "nessun dato" — mai niente (vedi asset-charts.spec.ts).
    await expect(card.locator("#accuracy-wrap-AMD").locator(S.canvasChartEmpty)).toHaveCount(1);
  });

  test("il banner di aggiornamento PWA resta nascosto quando non c'è una versione in attesa", async ({
    page,
  }) => {
    await gotoFresh(page);
    // Primo caricamento in un browser context pulito: nessun service worker
    // precedente, quindi showUpdateBanner() non viene mai chiamato.
    await expect(page.locator("#updateBanner")).toBeHidden();
  });

  test("SPY non compare più: rimosso dal paniere attivo, resta solo storico nel repo", async ({
    page,
  }) => {
    await gotoFresh(page);
    // Si guarda il PANIERE (filtro e titoli delle card), non tutto il testo
    // della griglia: da quando il dettaglio di una previsione include il
    // blocco "regime di mercato" ("S&P 500 (SPY)", "Nasdaq 100 (QQQ)"), la
    // sigla SPY compare legittimamente dentro una card aperta, come
    // benchmark e non come asset. Che questo non sia un asset lo verifica
    // market-regime.spec.ts dopo aver aperto un dettaglio.
    await expect(page.locator("#asset-filter")).not.toContainText("SPY");
    // Le card sono esattamente quelle del paniere, nell'ordine di ASSETS:
    // il titolo contiene anche il prezzo ("NVDA$228.38"), quindi si legge
    // l'attributo data-asset invece del testo.
    const cardAssets = await page
      .locator("#assets-grid .asset-card")
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.asset));
    expect(cardAssets).toEqual([...ASSETS]);
  });

  test("nota \"dati mancanti\": se visibile segnala cosa mancava nell'ultimo segnale, altrimenti resta nascosta", async ({
    page,
  }) => {
    await gotoFresh(page);
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      await waitForAssetData(page, asset);
      const note = dataStatusNote(page, asset);
      if (await note.isVisible()) {
        await expect(note.locator(S.iconSvg)).toBeVisible();
        await expect(note).toContainText("mancavano");
      } else {
        await expect(note).toBeHidden();
      }
    }
  });

  test("prezzo di riferimento accanto al ticker: se presente ha il formato $X.XX", async ({ page }) => {
    // Da 096dd0f: vuoto solo se non c'è ancora nessuna previsione salvata
    // per l'asset (caso limite, non atteso in produzione ma non un bug).
    await gotoFresh(page);
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      await waitForAssetData(page, asset);
      const price = assetPriceLabel(page, asset);
      const text = await price.textContent();
      if (text) {
        expect(text.trim()).toMatch(/^\$\d+\.\d{2}$/);
      }
    }
  });

  test('istantanea prezzo (da 40e3184): se visibile mostra un orario, un prezzo e un verdetto rispetto alla previsione 1g', async ({
    page,
  }) => {
    await gotoFresh(page);
    for (const asset of ASSETS) {
      await selectAsset(page, asset);
      await waitForAssetData(page, asset);
      const status = snapshotStatus(page, asset);
      if (await status.isVisible()) {
        await expect(status).toContainText(/Ora \(\d{2}:\d{2}\)/);
        await expect(status).toContainText(/\$\d+\.\d{2}/);
        // Con una previsione 1g disponibile compare anche il confronto in
        // percentuale; senza (previsione 1g non ancora generata) resta solo
        // l'orario+prezzo, comunque valido — non asseriamo sul verdetto.
      } else {
        await expect(status).toBeHidden();
      }
    }
  });
});
