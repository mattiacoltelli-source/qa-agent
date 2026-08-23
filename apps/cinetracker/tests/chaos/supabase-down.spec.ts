import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { abortRoute } from "../../../../core/network.ts";

// "Chaos test": non verifica che l'app funzioni, verifica che DEGRADI bene
// quando una dipendenza è irraggiungibile — categoria di test che oggi non
// esiste altrove nella suite (gli smoke test normali presuppongono Supabase
// raggiungibile). Sola lettura: non tocca mai Supabase per davvero,
// intercetta solo la richiesta con abortRoute() (core/network.ts) — stessa
// tecnica già usata per mockare il meteo di Spot, qui applicata per rompere
// di proposito invece che per restare deterministici.
//
// Cache fredda (localStorage svuotato): è lo scenario in cui storage.js
// NON ha una baseline affidabile da cui partire (vedi hasReliableBaseline())
// e deve quindi avvisare l'utente esplicitamente, invece di far finta che
// la libreria sia vuota per davvero.
//
// Non usiamo la fixture condivisa gotoFresh(): il suo page.reload() aspetta
// l'evento "load" completo, che con Supabase irraggiungibile può arrivare
// tardi (retry falliti sul WebSocket realtime, font esterni lenti a
// fallire) — ben oltre i ~3s in cui il toast di errore resta visibile
// prima di sparire da solo (verificato: con "load" il toast è già stato
// rimosso dal DOM quando il test arriva a controllarlo). bootApp() parte
// da DOMContentLoaded, non da "load": basta aspettare quello.
test.describe("CineTracker — Supabase irraggiungibile", () => {
  test("l'app resta utilizzabile e avvisa che la sincronizzazione è fallita", async ({ page }) => {
    await abortRoute(page, /quwkqaovjxczuahjcmmh\.supabase\.co/);

    await page.goto(".", { waitUntil: "domcontentloaded" });
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(
      page.locator(".toast.error", { hasText: "Sincronizzazione non riuscita" })
    ).toBeVisible();

    // Ora che abbiamo colto il toast, aspettiamo con calma che l'app sia
    // davvero pronta — e non basta "non essere bloccati": deve restare
    // navigabile, non solo mostrare un errore e poi restare inerte.
    await page.locator(".app.app--ready").waitFor({ state: "attached", timeout: 15_000 });
    await page.locator('.nav__btn[data-screen="stats"]').click();
    await expect(page.locator("#screen-stats")).toBeVisible();
  });
});
