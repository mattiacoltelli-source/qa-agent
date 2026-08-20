// Helper generici per lo stato del browser (localStorage/sessionStorage).
// Tutte e tre le app tengono stato "di dispositivo" in localStorage (utente
// corrente, preferiti, cache), quindi ogni test deve partire da uno stato
// pulito e noto, non da quello lasciato da un test precedente.

import type { Page } from "@playwright/test";

/** Svuota localStorage/sessionStorage per l'origine corrente.
 *
 * Va chiamata DOPO una navigazione reale (page.goto), mai su about:blank —
 * fallirebbe per mancanza di un'origine. Le fixture di ogni app la
 * richiamano internamente dentro gotoFresh() (goto → clear → reload), così
 * l'app "vede" storage vuoto fin dal primo caricamento.
 *
 * Deliberatamente NON è un page.addInitScript(): quello girerebbe ad OGNI
 * navigazione successiva della stessa pagina, cancellando anche stato che
 * un test scrive apposta per poi verificarne la persistenza dopo un
 * page.reload() (es. "il profilo scelto resta selezionato dopo un reload").
 * Chiamarla una volta in gotoFresh() è sufficiente: un nuovo browser
 * context Playwright parte già isolato per ogni test.
 */
export async function clearBrowserStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* storage non disponibile (raro) — non bloccare il test per questo */
    }
    try {
      window.sessionStorage.clear();
    } catch {
      /* vedi sopra */
    }
  });
}

/** Imposta una singola chiave di localStorage — va chiamata dopo una
 * navigazione reale, come clearBrowserStorage(). Utile per pre-seedare lo
 * stato (es. modalità sail già attiva) senza rifare l'onboarding a mano. */
export async function seedLocalStorage(
  page: Page,
  key: string,
  value: string
): Promise<void> {
  await page.evaluate(
    ([k, v]) => {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* ignorato */
      }
    },
    [key, value]
  );
}
