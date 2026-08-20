import { test, expect } from "@playwright/test";
import { gotoFresh } from "../../fixtures/cinetracker-page.ts";

// Simula la perdita/ripristino di connessione con context.setOffline(): non
// scrive nulla su Supabase, gira sempre (nessun gate @write).
test.describe("CineTracker — banner offline", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  test("andare offline mostra il banner, tornare online lo rimuove con un toast", async ({ page, context }) => {
    await context.setOffline(true);
    const banner = page.locator("#offlineBanner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("offline");

    await context.setOffline(false);
    await expect(banner).toBeHidden();
    await expect(page.locator(".toast.success")).toContainText("Connessione ripristinata");
  });

  test("una ricerca avviata da offline viene rifiutata subito, senza tentare la chiamata di rete", async ({
    page,
    context,
  }) => {
    await context.setOffline(true);
    // Aspettiamo che il banner offline compaia PRIMA di cercare: garantisce
    // che l'evento "offline" del browser (e quindi navigator.onLine=false)
    // sia già stato osservato dalla pagina. Senza questa attesa c'è una
    // finestra di race in cui doSearch() legge ancora navigator.onLine=true
    // e tenta una vera fetch di rete (che fallisce comunque, ma mostra un
    // toast "Errore di ricerca." diverso, senza la parola "offline" — da qui
    // la flakiness osservata in CI).
    await expect(page.locator("#offlineBanner")).toBeVisible();

    // Andare offline fa comparire ANCHE il toast generico di sincronizzazione
    // (stesso evento "offline" del banner): ".toast.error" da solo è
    // ambiguo (strict mode, 2 match). Scopiamo su quello specifico della
    // ricerca tramite il suo titolo ("Ricerca", passato a showToast()).
    await page.locator("#searchInput").fill("Inception");
    await page.locator("#searchBtn").click();
    const searchToast = page.locator(".toast.error", { hasText: "Ricerca" });
    await expect(searchToast).toContainText(/offline/i);
    await context.setOffline(false);
  });
});
