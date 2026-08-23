import { test, expect } from "@playwright/test";
import { ensureQaUserSelected, firstAddableSearchCard } from "../../fixtures/cinefighi-page.ts";

// "Chaos test" (vedi apps/cinetracker/tests/chaos/ per la spiegazione della
// categoria), variante "crash recovery": qui non interrompiamo la rete
// PRIMA di un'azione (come negli altri due chaos test di questa app), ma
// A META' di una scrittura reale, poi verifichiamo con un reload che non sia
// rimasto nulla di parziale. handleSaveVote() (app.js) NON è ottimistico:
// aggiorna lo stato locale solo dopo aver ricevuto conferma da Supabase —
// qui lo mettiamo alla prova con un fallimento di rete vero sulla singola
// scrittura (POST upsert su "votes"), lasciando intatte le letture, per non
// falsare la verifica finale col reload.
//
// SCRIVE su Supabase (aggiunge un titolo condiviso, ripulito nel finally):
// stessa eccezione "@write" delle altre scritture reali di questa app, vedi
// voting.write.spec.ts e il README di questa cartella.
test.describe("CineFighi — interruzione di rete durante il salvataggio del voto @write", () => {
  test.skip(
    process.env.RUN_WRITE_TESTS !== "true",
    "Test di scrittura disattivati di default: scrivono sul DB condiviso del gruppo. " +
      "Esegui con RUN_WRITE_TESTS=true (npm run test:write) per abilitarli."
  );

  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
  });

  test("un'interruzione di rete a metà salvataggio non registra il voto a metà, né lo mostra come salvato", async ({
    page,
  }) => {
    await page.locator("#searchInput").fill("Inception");
    const firstCard = firstAddableSearchCard(page);
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    // Il click ha già scritto il titolo su Supabase: da qui il try/finally
    // deve coprire anche l'attesa di #screen-detail (vedi commento gemello
    // in voting.write.spec.ts).
    await firstCard.locator('button[data-status="seen"]').click();

    try {
      await expect(page.locator("#screen-detail")).toBeVisible({ timeout: 10_000 });

      // Interrompiamo SOLO la scrittura (POST upsert) sulla tabella votes,
      // non le letture: reloadLibrary la interroga di nuovo più sotto, e
      // deve continuare a funzionare per non falsare la verifica finale.
      await page.route(/supabase\.co\/rest\/v1\/votes/, (route) =>
        route.request().method() === "GET" ? route.continue() : route.abort("failed")
      );

      await page.locator("#detailVoteSlider").fill("8");
      await page.locator("#detailSaveVoteBtn").click();

      await expect(
        page.locator(".toast.error", { hasText: "Errore nel salvare il voto" })
      ).toBeVisible();

      // Non ottimistico: né il bottone né la lista voti devono cambiare come
      // se il voto fosse stato registrato.
      await expect(page.locator("#detailSaveVoteBtn")).toHaveText("Salva voto");
      await expect(page.locator(".vote-row", { hasText: "(tu)" })).toHaveCount(0);

      await page.unroute(/supabase\.co\/rest\/v1\/votes/);

      // Rete ripristinata: un reload completo rilegge tutto da Supabase
      // (questa app non tiene una cache locale della libreria), non solo lo
      // stato in memoria — se il voto fosse stato scritto a metà lato
      // server, qui emergerebbe.
      await page.reload();
      await expect(page.locator("#app")).toBeVisible({ timeout: 15_000 });
      await page.locator(".shelf-card.open-detail", { hasText: "Inception" }).first().click();
      await expect(page.locator("#screen-detail")).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("#detailSaveVoteBtn")).toHaveText("Salva voto");
      await expect(page.locator(".vote-row", { hasText: "(tu)" })).toHaveCount(0);
    } finally {
      if (!(await page.locator("#screen-detail").isVisible())) {
        await page.locator(".shelf-card.open-detail", { hasText: "Inception" }).first().click();
        await expect(page.locator("#screen-detail")).toBeVisible({ timeout: 10_000 });
      }
      await page.locator("#detailRemoveBtn").click();
      await page.locator("#confirmYesBtn").click();
      await expect(page.locator("#screen-home")).toBeVisible();
    }
  });
});
