import { test, expect } from "@playwright/test";
import { gotoFresh, seedSharedAudio, mockApi } from "../../fixtures/voicebrief-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Affidabilità: un errore transitorio del backend si ritenta una volta da
// solo; gli altri errori (tetto di spesa, servizio giù) si mostrano subito,
// senza perdere l'audio, e si può riprovare con lo stesso vocale.
test.describe("VoiceBrief — errori e ritentativi", () => {
  test("un 503 transitorio sulla trascrizione viene ritentato e va a buon fine", async ({ page }) => {
    const calls = await mockApi(page, {
      transcribe: (n) => (n === 0 ? { status: 503, body: { error: "provider", message: "Errore del servizio di trascrizione." } } : { status: 200, body: { text: "Ciao a tutti, ci vediamo domani sera da Luca.", seconds: 1 } }),
    });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();
    await expect(page.locator(S.result)).toBeVisible({ timeout: 20_000 });
    expect(calls.filter((c) => c.kind === "transcribe")).toHaveLength(2);
  });

  test("una caduta di rete momentanea viene ritentata", async ({ page }) => {
    const calls = await mockApi(page, {
      transcribe: (n) => (n === 0 ? "abort" : { status: 200, body: { text: "Ciao a tutti, ci vediamo domani sera da Luca.", seconds: 1 } }),
    });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();
    await expect(page.locator(S.result)).toBeVisible({ timeout: 20_000 });
    expect(calls.filter((c) => c.kind === "transcribe")).toHaveLength(2);
  });

  test("servizio giù in modo persistente: errore chiaro, audio conservato, si può riprovare", async ({ page }) => {
    let down = true;
    const calls = await mockApi(page, {
      transcribe: () => (down ? { status: 502, body: { error: "provider", message: "Errore del servizio di trascrizione." } } : { status: 200, body: { text: "Ciao a tutti, ci vediamo domani sera da Luca.", seconds: 1 } }),
    });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();

    await expect(page.locator(S.status)).toContainText("Errore del servizio di trascrizione", { timeout: 20_000 });
    await expect(page.locator(S.pick)).toBeVisible();
    expect(calls.filter((c) => c.kind === "transcribe")).toHaveLength(2); // un tentativo + un solo ritentativo

    down = false;
    await page.reload(); // l'audio è ancora lì
    await expect(page.locator(S.pick)).toBeVisible();
    await page.locator(S.go).click();
    await expect(page.locator(S.result)).toBeVisible({ timeout: 20_000 });
  });

  test("tetto di spesa raggiunto: messaggio subito, nessun ritentativo", async ({ page }) => {
    const calls = await mockApi(page, {
      transcribe: () => ({ status: 429, body: { error: "budget", message: "Tetto di spesa mensile raggiunto. Si sblocca il mese prossimo." } }),
    });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();
    await expect(page.locator(S.status)).toContainText("Tetto di spesa", { timeout: 10_000 });
    expect(calls.filter((c) => c.kind === "transcribe")).toHaveLength(1);
  });

  test("errore nel riassunto: messaggio e ritorno alla scelta", async ({ page }) => {
    await mockApi(page, { summarize: () => ({ status: 500, body: { error: "server", message: "Errore interno." } }) });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();
    await expect(page.locator(S.status)).toContainText("Errore interno", { timeout: 10_000 });
    await expect(page.locator(S.pick)).toBeVisible();
  });
});
