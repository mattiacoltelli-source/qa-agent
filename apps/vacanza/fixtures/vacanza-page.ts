// Helper specifici per la UI di Spot (selettori presi dal DOM reale:
// index.html + app.js/ui.js). Nessuna delle azioni qui sotto scrive su un
// backend condiviso — tutto lo stato (preferiti, itinerario, visitati) è
// localStorage locale al browser, isolato per test da clearBrowserStorage().

import type { Page, BrowserContext } from "@playwright/test";
import { clearBrowserStorage } from "../../../core/storage.ts";

export type VacanzaPage = "home" | "top" | "map" | "spots" | "detail";

/** Naviga sull'app partendo da uno stato di dispositivo pulito (vedi
 * commento gemello in apps/cinefighi/fixtures/cinefighi-page.ts). Importante
 * qui in particolare: preferiti/itinerario/visitati sono SOLO localStorage,
 * quindi senza questo reset i test si contaminerebbero a vicenda. */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload();
  await page.locator("#page-home").waitFor({ state: "visible", timeout: 10_000 });
}

export async function switchPage(page: Page, name: VacanzaPage): Promise<void> {
  await page.locator(`.nav-btn[data-page="${name}"]`).click();
  await page.locator(`#page-${name}`).waitFor({ state: "visible" });
}

/** Concede il permesso di geolocalizzazione e fissa una posizione nota
 * (centro rotta Ionio di default) PRIMA della navigazione. */
export async function grantGeolocation(
  context: BrowserContext,
  lat = 38.9,
  lon = 20.3
): Promise<void> {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat, longitude: lon });
}

/** #sailModeToggle è una checkbox nativa resa invisibile via CSS (pattern
 * "toggle switch": input nascosto + <span> stilizzati dentro la <label>).
 * Cliccare l'input direttamente fallisce il controllo di visibilità di
 * Playwright — bisogna cliccare la <label> a cui è associato (comportamento
 * nativo del browser: il click sulla label attiva comunque l'input). */
export async function toggleSailModeSwitch(page: Page): Promise<void> {
  await page.locator('label[for="sailModeToggle"]').click();
}
