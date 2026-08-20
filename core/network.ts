// Utility generiche per intercettare/mockare chiamate di rete nei test.
// Non conoscono nulla di una app specifica: ricevono pattern URL e payload
// dal chiamante (vedi apps/<app>/fixtures per i mock concreti).

import type { Page } from "@playwright/test";

/** Risponde a ogni richiesta che matcha `urlPattern` con un body JSON fisso. */
export async function mockJson(
  page: Page,
  urlPattern: string | RegExp,
  body: unknown,
  status = 200
): Promise<void> {
  await page.route(urlPattern, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    })
  );
}

/** Simula un errore del server (per testare i percorsi di gestione errore). */
export async function mockFailure(
  page: Page,
  urlPattern: string | RegExp,
  status = 500
): Promise<void> {
  await page.route(urlPattern, (route) =>
    route.fulfill({ status, contentType: "text/plain", body: "mocked failure" })
  );
}

/** Simula un errore di rete (fetch che rigetta, non solo status non-ok). */
export async function abortRoute(
  page: Page,
  urlPattern: string | RegExp
): Promise<void> {
  await page.route(urlPattern, (route) => route.abort("failed"));
}
