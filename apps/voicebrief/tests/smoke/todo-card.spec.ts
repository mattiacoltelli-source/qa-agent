import { test, expect } from "@playwright/test";
import { gotoFresh, seedSharedAudio, mockApi } from "../../fixtures/voicebrief-page.ts";
import { S } from "../../fixtures/selectors.ts";

// "Da fare": richieste e promesse concrete estratte dal vocale. L'estrazione
// vera (e il controllo che poggi su parole dette) sta nel backend; qui si
// verifica come l'app mostra ciò che riceve, con il backend mockato.
const TASKS = [
  { what: "portare il furgone", owner: "listener", name: null, when: "sabato mattina" },
  { what: "mandare il file", owner: "speaker", name: null, when: null },
  { what: "chiamare il fornitore", owner: "other", name: "Marco", when: null },
];

test.describe("VoiceBrief — Da fare", () => {
  test("mostra le cose da fare con chi le deve fare e la scadenza", async ({ page }) => {
    await mockApi(page, { event: { events: [], tasks: TASKS } });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();

    await expect(page.locator(S.result)).toBeVisible({ timeout: 15_000 });
    const card = page.locator(S.tasks);
    await expect(card).toBeVisible();
    await expect(card).toContainText("Da fare");
    await expect(card.locator(".ev-row")).toHaveCount(3);
    await expect(card).toContainText("portare il furgone");
    await expect(card).toContainText("Chi ascolta · sabato mattina");
    await expect(card).toContainText("Chi parla");
    await expect(card).toContainText("Marco"); // il nome detto vince sull'etichetta generica
    await expect(page.locator(S.evNote)).toBeVisible();
  });

  test("il nome conta solo per le cose di una terza persona (chiama Marco ≠ lo fa Marco)", async ({ page }) => {
    // risposta reale del backend: per "chiama Marco" il modello mette name: "Marco" con owner listener
    await mockApi(page, { event: { events: [], tasks: [{ what: "chiama Marco per il preventivo", owner: "listener", name: "Marco", when: null }] } });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();
    const row = page.locator(`${S.tasks} .ev-row`);
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(row.locator("small")).toHaveText("Chi ascolta");
    await expect(row.locator("b")).toHaveText("chiama Marco per il preventivo");
  });

  test("senza cose da fare la card non compare (anche con un backend che non manda 'tasks')", async ({ page }) => {
    await mockApi(page, { event: { events: [] } });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();
    await expect(page.locator(S.result)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(S.tasks)).toBeHidden();
    await expect(page.locator(S.evNote)).toBeHidden();
  });

  test("al massimo 5 voci e senza duplicati", async ({ page }) => {
    const many = Array.from({ length: 8 }, (_, i) => ({ what: i < 2 ? "chiamare Marco" : `fare la cosa ${i}`, owner: "speaker", name: null, when: null }));
    await mockApi(page, { event: { events: [], tasks: many } });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();
    await expect(page.locator(S.tasks)).toBeVisible({ timeout: 15_000 });
    const n = await page.locator(`${S.tasks} .ev-row`).count();
    expect(n).toBeLessThanOrEqual(5);
    const texts = await page.locator(`${S.tasks} .ev-row b`).allTextContents();
    expect(new Set(texts).size).toBe(texts.length);
  });

  test("il testo è inserito come testo, non come HTML", async ({ page }) => {
    await mockApi(page, { event: { events: [], tasks: [{ what: "<img src=x onerror=window.__xss=1>chiamare", owner: "speaker", name: null, when: null }] } });
    await gotoFresh(page);
    await seedSharedAudio(page);
    await page.locator(S.go).click();
    await expect(page.locator(S.tasks)).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator(`${S.tasks} img`)).toHaveCount(0);
  });
});
