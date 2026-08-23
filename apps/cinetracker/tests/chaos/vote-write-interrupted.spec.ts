import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  search,
  firstAddableSearchCard,
  addSearchResultAs,
  removeCurrentDetail,
} from "../../fixtures/cinetracker-page.ts";
import { abortRoute } from "../../../../core/network.ts";
import { CINETRACKER_MARKER } from "../../../../scripts/cleanup-write-residue.mjs";

// "Chaos test" variante "crash recovery" (vedi apps/cinefighi/tests/chaos/
// vote-write-interrupted.spec.ts per la stessa idea sull'altra app — qui il
// comportamento reale è DIVERSO, non copiato: CineTracker è "local-first"
// (vedi storage.js::saveDB), non "ottimistico ma con rollback" come
// CineFighi. doSaveDetailNotes() (app.js) salva SUBITO in localStorage
// (saveLocalCache, sincrono) e il toast di successo dipende SOLO da
// quell'esito; il push su Supabase parte in background con retry
// automatico (withRetry, storage.js) e un suo fallimento non tocca né la UI
// né il toast. Qui verifichiamo che questo funzioni davvero: un
// salvataggio con Supabase del tutto irraggiungibile deve comunque
// riuscire, mostrare successo, e sopravvivere a un reload — perché dopo un
// reload la vera fonte di verità è la cache locale (loadDB() è
// cache-first, vedi chaos/supabase-down.spec.ts di questa stessa app).
//
// SCRIVE nella libreria REALE dell'utente (stessa eccezione @write delle
// altre scritture di questa app, vedi vote-formats.write.spec.ts): aggiunge
// un titolo con CINETRACKER_MARKER nel commento, rimosso nel finally.
test.describe("CineTracker — salvataggio voto con Supabase irraggiungibile @write", () => {
  test.skip(
    process.env.RUN_WRITE_TESTS !== "true",
    "Test di scrittura disattivati di default: scrivono nella tua libreria reale. " +
      "Esegui con RUN_WRITE_TESTS=true (npm run test:write) per abilitarli."
  );

  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("un salvataggio con la rete giù riesce comunque in locale e sopravvive a un reload", async ({
    page,
  }) => {
    await search(page, "Inception");
    const card = firstAddableSearchCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });
    // Non assumiamo che il titolo scelto sia letteralmente "Inception":
    // firstAddableSearchCard salta i risultati già in libreria (vedi il suo
    // commento), quindi potrebbe finire su un altro titolo della stessa
    // ricerca. Catturiamo il titolo vero per le verifiche più sotto.
    const addedTitle = await card.locator(".poster-card__title").textContent();
    await addSearchResultAs(card, "seen");
    await expect(page.locator("#screen-detail")).toBeVisible();

    try {
      // Interrompiamo Supabase SOLO da qui: aggiungere il titolo (sopra)
      // deve funzionare normalmente, vogliamo isolare il salvataggio voto.
      await abortRoute(page, /quwkqaovjxczuahjcmmh\.supabase\.co/);

      await page.locator("#detailVoteInput").fill("8,5");
      await page.locator("#detailCommentInput").fill(CINETRACKER_MARKER);
      await page.locator("#detailSaveNoteBtn").click();

      // Non "ottimistico con rollback" come CineFighi: qui il successo è
      // reale, perché il salvataggio locale non dipende da Supabase.
      await expect(
        page.locator(".toast.success", { hasText: "Voto e commento salvati" })
      ).toBeVisible();
      await expect(page.locator("#detailVoteInput")).toHaveValue("8,5");

      // Reload con Supabase ANCORA irraggiungibile: se il voto fosse solo
      // in memoria (non davvero in localStorage), sparirebbe qui.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(".app.app--ready").waitFor({ state: "attached", timeout: 15_000 });

      const card2 = page.locator(".shelf-card.open-stored-detail", { hasText: addedTitle! }).first();
      await expect(card2).toBeVisible({ timeout: 10_000 });
      await expect(card2.locator(".shelf-card__vote")).toHaveText("★ 8,5");
      await card2.click();
      await expect(page.locator("#screen-detail")).toBeVisible();
      await expect(page.locator("#detailVoteInput")).toHaveValue("8,5");
      await expect(page.locator("#detailCommentInput")).toHaveValue(CINETRACKER_MARKER);

      // Ripristiniamo la rete prima della pulizia, così la rimozione qui
      // sotto sincronizza davvero su Supabase invece di affidarsi solo alla
      // rete di sicurezza indipendente (scripts/cleanup-write-residue.mjs).
      await page.unroute(/quwkqaovjxczuahjcmmh\.supabase\.co/);
    } finally {
      await removeCurrentDetail(page);
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });
});
