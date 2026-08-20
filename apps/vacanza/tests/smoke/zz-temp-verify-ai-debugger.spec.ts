import { test, expect } from "@playwright/test";

// File TEMPORANEO, solo per verificare dal vivo l'analisi Claude dei
// fallimenti (scripts/analyze-failures.mjs) prima di considerarla pronta.
// Fallisce di proposito. Da rimuovere subito dopo la verifica — non fa
// parte della suite vera.
test("verifica temporanea: questo test fallisce di proposito", async ({ page }) => {
  await page.goto(".");
  await expect(page.locator("#questo-elemento-non-esiste-di-proposito")).toBeVisible({ timeout: 3_000 });
});
