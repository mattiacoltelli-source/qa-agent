import { test, expect } from "@playwright/test";
import { ensureQaUserSelected, search } from "../../fixtures/cinefighi-page.ts";
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

    // Da fix 45a67f8: niente più ricerca live al variare del testo, serve
    // un click su Cerca/Invio per far partire doSearch() — un .fill() da
    // solo non innescherebbe mai il catch che vogliamo verificare qui.
    await search(page, "Inception");

    const empty = page.locator("#resultsEmpty");
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty).toContainText("Errore di ricerca");
  });
});
