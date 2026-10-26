import { test, expect } from "@playwright/test";
import { gotoFresh } from "../../fixtures/voicebrief-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Senza vocali l'app mostra la schermata iniziale. Nessun errore JS: la
// pagina è un'unica app statica, un errore all'avvio la rompe per intero.
test.describe("VoiceBrief — avvio", () => {
  test("schermata iniziale senza errori JavaScript", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await gotoFresh(page);

    await expect(page.locator(S.idle)).toBeVisible();
    await expect(page.locator(`${S.idle} h1`)).toContainText("Nessun vocale");
    await expect(page.locator(S.recStart)).toBeVisible();
    await expect(page.locator(S.pick)).toBeHidden();
    await expect(page.locator(S.env)).toContainText(/v\d+/);
    expect(errors).toEqual([]);
  });

  test("il manifest espone la condivisione dei vocali (share target)", async ({ page, request, baseURL }) => {
    const res = await request.get(new URL("manifest.webmanifest", baseURL).href);
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.share_target?.method).toBe("POST");
    expect(m.share_target?.params?.files?.[0]?.name).toBe("audio");
    expect(m.display).toBe("standalone");
    await page.goto(".");
  });

  test("dopo il primo caricamento l'app si apre anche senza rete (cache del service worker)", async ({ page, context }) => {
    await gotoFresh(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // ora la pagina è controllata dal service worker
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(S.idle)).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);
  });
});
