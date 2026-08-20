// Helper specifici per la UI di CineTracker (selettori presi dal DOM reale
// dell'app: index.html + app.js/ui.js). CineTracker è single-user (nessuno
// user picker) e ha un formato voto testuale speciale ("7", "7,5", "7+",
// "8-"), diverso dallo slider 0-10 di CineFighi — non condividere questi
// helper con l'altra app anche quando sembrano simili.

import type { Page, Locator } from "@playwright/test";
import { clearBrowserStorage } from "../../../core/storage.ts";

/** Naviga sull'app partendo da uno stato di dispositivo pulito (vedi
 * commento gemello in apps/cinefighi/fixtures/cinefighi-page.ts). */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload();
  await page.locator("#screen-home").waitFor({ state: "visible", timeout: 10_000 });
  // #screen-home è visibile nel markup statico ancora prima che bootApp()
  // finisca: bindEvents() (che aggancia i listener su #searchBtn e sui
  // bottoni della nav) gira solo dopo l'await loadDB() (round-trip a
  // Supabase). Un'interazione immediata come .click() — a differenza di un
  // expect che ritenta — può quindi arrivare prima che il listener sia
  // agganciato e non fare nulla. app.js aggiunge la classe "app--ready" a
  // ".app" nel finally di bootApp(), subito dopo bindEvents(): è il segnale
  // affidabile che l'hydration è completa.
  await page.locator(".app.app--ready").waitFor({ state: "attached", timeout: 10_000 });
}

export async function openScreen(
  page: Page,
  screen: "home" | "stats" | "tonight" | "backup"
): Promise<void> {
  await page.locator(`.nav__btn[data-screen="${screen}"]`).click();
}

export async function search(page: Page, query: string): Promise<void> {
  await page.locator("#searchInput").fill(query);
  await page.locator("#searchBtn").click();
}

/** Le azioni rapide (Visto/Watchlist) su una card di ricerca sono nascoste
 * finché la card non viene "aperta": su mobile si apre toccando il poster
 * (stesso comportamento reale dell'app, non solo hover da desktop). */
export async function openSearchCardMenu(card: Locator): Promise<void> {
  await card.locator(".poster-card__img").click();
}

export async function addSearchResultAs(
  card: Locator,
  action: "seen" | "watch"
): Promise<void> {
  await openSearchCardMenu(card);
  await card.locator(`.action-${action}`).click();
}

/** Rimuove il titolo attualmente aperto nel dettaglio. Il pulsante innesca
 * un `confirm()` nativo del browser: va gestito PRIMA del click, altrimenti
 * Playwright lo respinge automaticamente. */
export async function removeCurrentDetail(page: Page): Promise<void> {
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#detailRemoveBtn").click();
}
