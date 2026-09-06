import { test, expect } from "@playwright/test";
import { gotoFresh } from "../../fixtures/vacanza-page.ts";

// Introdotto in 7a6c775 ("Aggiunge service worker con banner 'nuova versione
// disponibile'"): nessun test lo esercitava (vedi sw.js + app.js::
// registerServiceWorker/showUpdateBanner). In un browser context Playwright
// normale (sempre "fresh") il banner non compare mai — serve simulare un
// secondo deploy con contenuto di sw.js diverso nello STESSO context per
// forzare l'evento "updatefound" con un worker già in stato "installed" e
// un controller già presente, le due condizioni che app.js richiede prima
// di mostrare il banner.
test.describe("Spot — banner aggiornamento service worker", () => {
  test("un nuovo sw.js in background mostra il banner, e Aggiorna applica l'update e ricarica", async ({
    page,
    context,
  }) => {
    await gotoFresh(page);

    // registerServiceWorker() ricarica la pagina da solo (controllerchange →
    // location.reload(), vedi app.js) non appena il PRIMO service worker
    // prende il controllo via self.clients.claim() — capita anche al primo
    // avvio in assoluto, non solo dopo un update reale. Diamo a quel reload
    // una finestra per succedere ed esaurirsi PRIMA di intercettare sw.js,
    // altrimenti rischiamo di far partire l'update simulato a cavallo di
    // quella navigazione. Se non succede (claim già avvenuto prima o durante
    // il reload di gotoFresh) il timeout scade e si procede comunque.
    await page
      .waitForEvent("load", { timeout: 5_000 })
      .catch(() => { /* nessun reload extra osservato: va bene comunque */ });

    // Aspetta che il primo service worker abbia preso il controllo della
    // pagina: è la condizione richiesta da registerServiceWorker() prima che
    // un successivo "installed" mostri il banner (altrimenti sembrerebbe il
    // PRIMO install, che non deve mostrarlo).
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
      timeout: 15_000,
    });

    // Da qui in poi, ogni richiesta a sw.js riceve un CACHE_VERSION diverso:
    // per il browser è un file diverso da quello già installato, quindi un
    // reg.update() esplicito installa un nuovo worker invece di essere un no-op.
    await context.route("**/sw.js", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /const CACHE_VERSION = "v1";/,
        `const CACHE_VERSION = "v1-qa-test-${Date.now()}";`
      );
      await route.fulfill({ response, body });
    });

    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });

    const banner = page.locator("#updateBanner");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText("Nuova versione disponibile");
    await expect(page.locator("#updateBannerBtn")).toBeVisible();

    await Promise.all([
      page.waitForEvent("load", { timeout: 15_000 }),
      page.locator("#updateBannerBtn").click(),
    ]);

    // Dopo il reload (innescato da SKIP_WAITING → controllerchange in
    // app.js), il nuovo worker è già quello attivo: nessun reg.waiting
    // residuo, quindi il banner non deve ricomparire da solo.
    await page.locator("#page-home").waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator("#updateBanner")).toHaveCount(0);
  });
});
