import { test, expect } from "@playwright/test";
import { gotoFresh, search } from "../../fixtures/cinetracker-page.ts";
import { abortRoute } from "../../../../core/network.ts";

// "Chaos test" (vedi supabase-down.spec.ts per la spiegazione della
// categoria): TMDB irraggiungibile durante una ricerca. doSearch() in
// app.js ha già un try/catch dedicato a questo — qui verifichiamo che
// funzioni davvero, invece di fidarci che nessuno lo rompa per errore in
// un refactor futuro. Sola lettura, nessuna chiamata reale a TMDB toccata:
// solo intercettata e fallita di proposito.
test.describe("CineTracker — TMDB irraggiungibile durante una ricerca", () => {
  test("la ricerca fallisce con un messaggio chiaro, non resta bloccata in silenzio", async ({ page }) => {
    await gotoFresh(page);
    await abortRoute(page, /api\.themoviedb\.org/);

    await search(page, "Inception");

    await expect(page.locator(".toast.error", { hasText: "Errore di ricerca" })).toBeVisible();
    await expect(page.locator("#resultsEmpty")).toContainText("Errore di ricerca");
  });
});
