import { test, expect } from "@playwright/test";
import { gotoFresh, seedSharedAudio, mockApi } from "../../fixtures/voicebrief-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Backend sempre mockato (vedi fixtures): si verifica il comportamento
// dell'app, non la qualità del riassunto, e non si spende nulla.
test.describe("VoiceBrief — elaborazione di un vocale", () => {
  test("un vocale condiviso arriva alla scelta, si elabora e mostra il risultato", async ({ page }) => {
    const calls = await mockApi(page);
    await gotoFresh(page);
    await seedSharedAudio(page);

    await expect(page.locator(S.modeRadio("bullets"))).toBeChecked();
    await page.locator(S.go).click();

    await expect(page.locator(S.result)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(S.resultTitle)).toHaveText("Riassunto per punti");
    await expect(page.locator(S.out)).toContainText("Cena da Luca");
    await expect(page.locator(`${S.out} .brief`)).toContainText("cena con Luca");
    expect(calls.filter((c) => c.kind === "transcribe")).toHaveLength(1);
    const sum = calls.find((c) => c.kind === "summarize");
    expect(JSON.parse(sum!.body!).mode).toBe("bullets");

    // "Indietro" riporta alla scelta senza perdere l'audio
    await page.locator(S.back).click();
    await expect(page.locator(S.pick)).toBeVisible();
  });

  test("la modalità scelta viene ricordata e inviata", async ({ page }) => {
    const calls = await mockApi(page, { summarize: () => ({ status: 200, body: { result: "Testo pulito di prova." } }) });
    await gotoFresh(page);
    await seedSharedAudio(page);

    await page.locator("label.mode", { has: page.locator(S.modeRadio("clean")) }).click();
    await page.locator(S.go).click();
    await expect(page.locator(S.resultTitle)).toHaveText("Testo pulito", { timeout: 15_000 });
    expect(JSON.parse(calls.find((c) => c.kind === "summarize")!.body!).mode).toBe("clean");

    await page.reload();
    await expect(page.locator(S.modeRadio("clean"))).toBeChecked();
  });

  test("elimina audio riporta alla schermata iniziale", async ({ page }) => {
    await mockApi(page);
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.clear).click();
    await expect(page.locator(S.idle)).toBeVisible();
    await page.reload();
    await expect(page.locator(S.idle)).toBeVisible(); // davvero cancellato, non solo nascosto
  });
});
