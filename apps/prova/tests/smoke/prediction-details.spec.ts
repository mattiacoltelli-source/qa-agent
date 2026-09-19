import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  assetCard,
  openAssetTable,
  collapsibleHeight,
  predictionRows,
  predictionDetailRow,
  outcomeRows,
  outcomeDetailRow,
  ASSETS,
} from "../../fixtures/prova-page.ts";
import { S } from "../../fixtures/selectors.ts";

// I dati sono reali e cambiano ogni giorno (nuove previsioni/valutazioni
// generate dalla pipeline Python): questi test verificano il COMPORTAMENTO
// (apertura/chiusura del dettaglio, contenuto minimo atteso), mai valori
// fissi come la classe predetta o la confidence di una previsione specifica
// — quelli cambiano da un giorno all'altro e non sono ciò che questa suite
// deve garantire.
//
// Da 23dc826 le due tabelle sono richiudibili e partono CHIUSE
// (.collapsible-content.collapsed: max-height 0 + overflow hidden): le righe
// restano nel DOM e per Playwright sono perfino "visible", ma il click su
// una di esse va comunque in timeout perché il punto da colpire è
// ritagliato via. openAssetTable() seleziona l'asset nel filtro (una card
// alla volta) e apre la sezione toccandone l'intestazione, come farebbe un
// utente.
test.describe("AI Predictor — dettaglio previsioni e risultati on-tap", () => {
  for (const asset of ASSETS) {
    test(`${asset}: aprire una riga di "Ultimi Segnali Generati" mostra la motivazione, richiuderla la nasconde`, async ({
      page,
    }) => {
      await gotoFresh(page);
      await openAssetTable(page, asset, "predictions");
      const card = assetCard(page, asset);
      const rows = predictionRows(page, asset);
      const count = await rows.count();

      if (count === 0) {
        await expect(card).toContainText("Nessuna predizione registrata.");
        test.skip(true, `${asset}: nessuna previsione ancora generata, nulla da espandere`);
      }

      const detail = predictionDetailRow(page, asset, 0);
      await expect(detail).toBeHidden();

      await rows.nth(0).click();
      await expect(detail).toBeVisible();
      await expect(detail).toContainText("Motivazione del modello");
      // La riga "Soglia di volatilità: ±X%" è diventata il range di prezzo
      // effettivo ("Resta FLAT se il prezzo è tra $X e $Y..."): "FLAT"
      // resta la sottostringa stabile in entrambe le forme (con o senza
      // prezzo disponibile), vedi flatRangeLine() in Prova/index.html. Ogni
      // previsione reale salvata ha sempre price_at_generation (campo
      // obbligatorio in predict_run.py), quindi il formato con i due
      // prezzi in $ è quello davvero atteso qui, non solo il fallback.
      await expect(detail).toContainText("FLAT");
      await expect(detail).toContainText(/Resta FLAT se il prezzo è tra \$[\d.,]+ e \$[\d.,]+/);

      // Da 3a962b3: predictionDetailHtml() aggiunge una riga di probabilità
      // reali (UP/DOWN/FLAT) tra la motivazione e il range FLAT —
      // probabilityLine() in index.html ritorna null (niente riga) per le
      // previsioni salvate prima di quella modifica, quindi il campo può
      // mancare su un segnale vecchio: verifichiamo il formato solo quando
      // c'è, mai un valore fisso (le probabilità reali cambiano ogni giorno).
      const detailText = (await detail.textContent()) ?? "";
      const probMatch = detailText.match(/Probabilità:\s*UP\s*(\d+)%\s*·\s*DOWN\s*(\d+)%\s*·\s*FLAT\s*(\d+)%/);
      if (probMatch) {
        const [, up, down, flat] = probMatch.map(Number);
        for (const p of [up, down, flat]) {
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(100);
        }
        // Tre probabilità mutuamente esclusive: devono sommare a 100 a meno
        // di un piccolo scarto di arrotondamento (pct() in index.html usa
        // Math.round su ciascuna singolarmente, non su una distribuzione
        // già normalizzata agli interi).
        expect(up + down + flat).toBeGreaterThanOrEqual(97);
        expect(up + down + flat).toBeLessThanOrEqual(103);
      }

      await rows.nth(0).click();
      await expect(detail).toBeHidden();
    });

    test(`${asset}: aprire una riga di "Ultimi Risultati Valutati" mostra anche il confronto di prezzo`, async ({
      page,
    }) => {
      await gotoFresh(page);
      await openAssetTable(page, asset, "outcomes");
      const card = assetCard(page, asset);
      const rows = outcomeRows(page, asset);
      const count = await rows.count();

      if (count === 0) {
        await expect(card).toContainText("Nessuna valutazione ancora.");
        test.skip(true, `${asset}: nessun esito ancora valutato`);
      }

      const detail = outcomeDetailRow(page, asset, 0);
      await rows.nth(0).click();
      await expect(detail).toBeVisible();
      await expect(detail).toContainText("prezzo reale");
      await expect(detail).toContainText("Motivazione del modello");
    });

    test(`${asset}: le due tabelle partono chiuse e si aprono toccando l'intestazione`, async ({
      page,
    }) => {
      // Regressione sul comportamento introdotto da 23dc826: prima le liste
      // erano sempre aperte e mostravano tutto lo storico. Se tornassero
      // aperte di default non sarebbe un errore visibile altrove nella
      // suite (gli altri test le aprono con un helper idempotente), quindi
      // serve un test che guardi proprio lo stato iniziale.
      await gotoFresh(page);
      const card = assetCard(page, asset);
      await expect(card.locator(S.collapsibleContentCollapsed)).toHaveCount(2);
      // "Chiuso" è max-height:0 + overflow:hidden, non display:none: le
      // righe restano "visible" per Playwright (è il click a mancare il
      // bersaglio, sull'hit test), quindi l'asserzione onesta è che la
      // sezione non occupi spazio — non che la riga sia nascosta.
      expect(await collapsibleHeight(card, "Ultimi Segnali Generati")).toBe(0);
      expect(await collapsibleHeight(card, "Ultimi Risultati Valutati")).toBe(0);

      await openAssetTable(page, asset, "predictions");
      await expect(card.locator(S.collapsibleContentCollapsed)).toHaveCount(1);
      expect(await collapsibleHeight(card, "Ultimi Segnali Generati")).toBeGreaterThan(0);
    });
  }
});
