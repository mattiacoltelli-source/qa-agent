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
      // Il titolo resta in libreria, solo lo stato cambia (niente ritorno a home).
      await expect(page.locator("#screen-detail")).toBeVisible();
    } finally {
      await removeCurrentDetail(page);
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });
});
