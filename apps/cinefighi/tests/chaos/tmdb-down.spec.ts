import { test, expect } from "@playwright/test";
import { ensureQaUserSelected } from "../../fixtures/cinefighi-page.ts";
import { abortRoute } from "../../../../core/network.ts";

// "Chaos test" (vedi apps/cinetracker/tests/chaos/ per la spiegazione della
// categoria): TMDB irraggiungibile durante una ricerca. doSearch() in
// app.js ha già un try/catch dedicato — qui verifichiamo che funzioni
// davvero. A differenza di CineTracker, qui il catch aggiorna solo il testo
// di #resultsEmpty, senza toast — verificato sul sorgente reale, non
// assunto identico solo perché l'altra app si comporta così.
//
// abortRoute() applicato SOLO a TMDB, non a Supabase: ensureQaUserSelected
// deve poter creare/selezionare l'utente di test normalmente.
test.describe("CineFighi — TMDB irraggiungibile durante una ricerca", () => {
  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
  });

  test("la ricerca fallisce con un messaggio chiaro, non resta bloccata in silenzio", async ({ page }) => {
    await abortRoute(page, /api\.themoviedb\.org/);

    await page.locator("#searchInput").fill("Inception");

    const empty = page.locator("#resultsEmpty");
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty).toContainText("Errore di ricerca");
  });
});
