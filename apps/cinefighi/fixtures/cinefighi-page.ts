// Helper specifici per la UI di CineFighi (selettori presi dal DOM reale
// dell'app: index.html + app.js). Non condivisi con le altre app: se la UI
// di CineFighi cambia, si tocca solo questo file.

import type { Page } from "@playwright/test";
import { clearBrowserStorage } from "../../../core/storage.ts";

/** Nome dell'utente di test dedicato a questa suite. addUser() lato app è
 * idempotente (case-insensitive: se il nome esiste già nel gruppo, non lo
 * duplica — lo riusa), quindi è sicuro richiamarlo ad ogni run. */
export const QA_USER = "_QA_Agent_";

/** Naviga sull'app partendo da uno stato di dispositivo pulito. Il reload
 * dopo il clear serve perché app.js legge currentUser/cache da localStorage
 * solo al boot: senza reload vedrebbe ancora lo stato letto al primo load. */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload();
  await page
    .locator("#splash")
    .waitFor({ state: "hidden", timeout: 5_000 })
    .catch(() => {
      /* lo splash sparisce da solo dopo ~850ms; se il selettore cambia non
       * vogliamo che sia questo a far fallire i test che seguono */
    });
}

export async function selectExistingUser(page: Page, name: string): Promise<boolean> {
  const btn = page.locator(`.user-pick-btn[data-user="${name}"]`);
  if ((await btn.count()) === 0) return false;
  await btn.first().click();
  return true;
}

/** Garantisce che QA_USER sia selezionato come utente corrente, aggiungendolo
 * al gruppo se non esiste ancora. Se il gruppo è già al completo (15/15) e
 * QA_USER non ne fa parte, i test non hanno modo di procedere: fallisce con
 * un messaggio esplicito invece di un timeout muto. */
export async function ensureQaUserSelected(page: Page): Promise<void> {
  await gotoFresh(page);
  const overlay = page.locator("#userPickerOverlay");
  if (await overlay.isVisible()) {
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) {
      const addRowVisible = await page.locator("#userPickerAddRow").isVisible();
      if (!addRowVisible) {
        throw new Error(
          `Gruppo CineFighi al completo (15/15) e "${QA_USER}" non è tra i membri: ` +
            `aggiungilo manualmente una volta dall'app prima di far girare questi test.`
        );
      }
      await page.locator("#userPickerInput").fill(QA_USER);
      await page.locator("#userPickerAddBtn").click();
    }
  }
  await page.locator("#app").waitFor({ state: "visible" });
}

export async function openScreen(
  page: Page,
  screen: "home" | "stats" | "tonight"
): Promise<void> {
  await page.locator(`.nav__btn[data-screen="${screen}"]`).click();
}
