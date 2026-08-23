import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { abortRoute } from "../../../../core/network.ts";

// "Chaos test" (vedi apps/cinetracker/tests/chaos/ per la spiegazione della
// categoria): Supabase irraggiungibile al boot, cache fredda (nessun
// utente/libreria salvati in locale). init() ha già logica dedicata a
// questo scenario, aggiunta apposta perché un errore di rete non svuotasse
// silenziosamente la libreria condivisa del gruppo (vedi il commit storico
// "Fix toast di successo ingannevoli e liste che si svuotano su errore") —
// qui la mettiamo davvero alla prova. Sola lettura, nessuna scrittura
// reale: intercetta solo con abortRoute() (core/network.ts).
//
// Non usiamo gotoFresh(): il suo page.reload() aspetta l'evento "load"
// completo, che con Supabase irraggiungibile può arrivare tardi — stesso
// problema di timing trovato e corretto nel test gemello di CineTracker
// (il toast di errore sparisce da solo dopo ~3s, "load" può arrivare
// dopo). init() gira alla prima esecuzione di app.js (nessun listener
// DOMContentLoaded a parte): basta aspettare domcontentloaded.
test.describe("CineFighi — Supabase irraggiungibile", () => {
  test("l'app non si blocca, avvisa dell'errore e propone comunque la scelta utente", async ({ page }) => {
    await abortRoute(page, /dxzukpujouayxlomwryc\.supabase\.co/);

    await page.goto(".", { waitUntil: "domcontentloaded" });
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });

    // init() fa due fetch falliti in sequenza (utenti, poi libreria), ognuno
    // con il proprio avviso — verifichiamo entrambi, non solo il primo.
    await expect(
      page.locator(".toast.error", { hasText: "Impossibile contattare il server" })
    ).toBeVisible();
    await expect(
      page.locator(".toast.error", { hasText: "Impossibile aggiornare la libreria" })
    ).toBeVisible();

    // Senza sessione salvata l'app deve proporre la scelta utente invece di
    // restare bloccata sullo splash.
    await expect(page.locator("#userPickerOverlay")).toBeVisible({ timeout: 10_000 });
  });
});
