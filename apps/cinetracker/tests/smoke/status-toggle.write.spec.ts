import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  search,
  firstAddableSearchCard,
  addSearchResultAs,
  removeCurrentDetail,
} from "../../fixtures/cinetracker-page.ts";
import { CINETRACKER_MARKER } from "../../../../scripts/cleanup-write-residue.mjs";

// Questi test scrivono nella libreria REALE dell'utente (stesso avvertimento
// di vote-formats.write.spec.ts: CineTracker è single-user, non c'è un
// "utente di test" separabile). Girano solo con RUN_WRITE_TESTS=true.
//
// Copre il demote "Segna come non visto" introdotto in e0eaab4/6c3f48a
// ("stessa logica di CineFighi per Segna come visto/Rimuovi"): su un titolo
// già visto, #detailSeenBtn sparisce e #detailWatchBtn diventa un link
// discreto con testo "Segna come non visto" che sposta il titolo da "visti"
// a "watchlist" invece di aggiungerne uno nuovo — nessun test lo esercitava.
//
// Copre anche #detailSaveNoteBtn ("Salva voto/commento"): finché il titolo
// non è ancora visto, era un secondo pulsante pieno quasi identico a "Segna
// come visto" (la sola differenza — restare in watchlist invece di
// spostarsi ai visti — non si vedeva dall'interfaccia); ora resta visibile
// solo quando il titolo è già visto. Le due asserzioni su questo pulsante
// qui sotto sono anche un test di regressione indiretto per un bug trovato
// verificando questa modifica in locale: prima, `classList.toggle(classe,
// inSeen(src))` passava il risultato di un Array.find() (un oggetto o
// `undefined`) invece di un booleano vero — con `undefined` il browser
// tratta l'argomento come omesso e INVERTE lo stato invece di impostarlo,
// rendendo la visibilità di #detailSeenBtn/#detailWatchBtn dipendente
// dall'ordine di navigazione tra schede invece che dallo stato reale del
// titolo (risalente a e0eaab4, corretto insieme a questa modifica).
test.describe("CineTracker — toggle stato visto/watchlist @write", () => {
  test.skip(
    process.env.RUN_WRITE_TESTS !== "true",
    "Test di scrittura disattivati di default: scrivono nella tua libreria reale. " +
      "Esegui con RUN_WRITE_TESTS=true (npm run test:write) per abilitarli."
  );

  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test('demote da "Segna come non visto" sposta il titolo dai visti alla watchlist senza rimuoverlo', async ({
    page,
  }) => {
    await search(page, "Inception");
    const card = firstAddableSearchCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await addSearchResultAs(card, "seen");
    await expect(page.locator("#screen-detail")).toBeVisible();

    try {
      const seenBtn = page.locator("#detailSeenBtn");
      const watchBtn = page.locator("#detailWatchBtn");
      const removeBtn = page.locator("#detailRemoveBtn");

      await expect(seenBtn).toBeHidden();
      await expect(watchBtn).toHaveText("Segna come non visto");
      await expect(removeBtn).toHaveText("Rimuovi");
      // Già visto: "Salva voto/commento" resta l'unico modo di aggiornare voto/commento.
      await expect(page.locator("#detailSaveNoteBtn")).toBeVisible();

      // Marcatore nel commento PRIMA del click che scrive: il demote crea la
      // riga "watchlist" leggendo il commento corrente (vedi app.js), quindi
      // la riga risultante resta comunque riconoscibile dalla rete di
      // sicurezza indipendente (scripts/cleanup-write-residue.mjs) anche se
      // il finally qui sotto non arrivasse in fondo.
      await page.locator("#detailCommentInput").fill(CINETRACKER_MARKER);
      await watchBtn.click();

      await expect(seenBtn).toBeVisible();
      await expect(seenBtn).toHaveText("Segna come visto");
      await expect(watchBtn).toBeHidden();
      await expect(removeBtn).toHaveText("Rimuovi dalla mia watchlist");
      // Non ancora visto (di nuovo): "Salva voto/commento" sparisce, "Segna
      // come visto" da solo copre anche il salvataggio di voto/commento.
      await expect(page.locator("#detailSaveNoteBtn")).toBeHidden();
      // Il titolo resta in libreria, solo lo stato cambia (niente ritorno a home).
      await expect(page.locator("#screen-detail")).toBeVisible();
    } finally {
      await removeCurrentDetail(page);
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });
});
