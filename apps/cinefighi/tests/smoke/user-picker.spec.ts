import { test, expect } from "@playwright/test";
import { gotoFresh, ensureQaUserSelected, QA_USER } from "../../fixtures/cinefighi-page.ts";

test.describe("CineFighi — selezione utente", () => {
  test("senza utente selezionato, mostra lo user picker bloccante", async ({ page }) => {
    await gotoFresh(page);
    const overlay = page.locator("#userPickerOverlay");
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("data-blocking", "1");
    await expect(page.locator("#userPickerClose")).toBeHidden();
    await expect(page.locator("#app")).toBeHidden();
  });

  test(
    "selezionare un profilo esistente sblocca l'app " +
      "(comportamento PREVISTO: chiunque può scegliere il profilo di chiunque altro, non c'è auth)",
    async ({ page }) => {
      await ensureQaUserSelected(page);
      await expect(page.locator("#app")).toBeVisible();
      await expect(page.locator("#userChip")).toContainText(QA_USER);
    }
  );

  test("il profilo scelto resta selezionato dopo un reload della pagina", async ({ page }) => {
    await ensureQaUserSelected(page);
    await page.reload();
    await expect(page.locator("#userPickerOverlay")).toBeHidden();
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("#userChip")).toContainText(QA_USER);
  });

  test("il chip utente in alto apre di nuovo il picker, questa volta chiudibile", async ({ page }) => {
    await ensureQaUserSelected(page);
    await page.locator("#userChip").click();
    const overlay = page.locator("#userPickerOverlay");
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("data-blocking", "0");
    await expect(page.locator("#userPickerClose")).toBeVisible();
    await page.locator("#userPickerClose").click();
    await expect(overlay).toBeHidden();
  });
});
