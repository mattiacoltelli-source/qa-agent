// Helper specifici per la UI di CineFighi (selettori presi dal DOM reale
// dell'app: index.html + app.js). Non condivisi con le altre app: se la UI
// di CineFighi cambia, si tocca solo questo file.

import type { Page } from "@playwright/test";
import { clearBrowserStorage } from "../../../core/storage.ts";

/** Nome dell'utente di test dedicato a questa suite. addUser() lato app è
 * idempotente (case-insensitive: se il nome esiste già nel gruppo, non lo
 * duplica — lo riusa), quindi è sicuro richiamarlo ad ogni run. */
export const QA_USER = "_QA_Agent_";

/** Fabbrica di titoli finti per le fixture mockate di Statistiche/Report —
 * condivisa tra i due file di test (prima duplicata solo in stats.spec.ts,
 * quando "Curiosità" viveva lì; ora che quel contenuto si è spostato nel tab
 * Gruppo di Report, entrambi i file ne hanno bisogno). */
export function fakeTitle(id: number, title: string, genre: string) {
  return {
    id,
    tmdb_id: id,
    media_type: "movie",
    title,
    year: "2024",
    poster_path: "",
    backdrop_path: "",
    overview: "",
    genre_names: [genre],
    director: "",
    status: "seen",
    added_by: "Un Amico",
    created_at: new Date().toISOString()
  };
}

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

/** La ricerca può restituire titoli GIÀ nella libreria condivisa del gruppo:
 * quella card mostra il tag "poster-card__tag" ("✓ Già in libreria...") al
 * posto dei bottoni Watchlist/Visto (vedi CineFighi/ui.js renderSearchResults).
 * Prendere sempre `.first()` rischia di beccare proprio quella e bloccarsi in
 * timeout aspettando un `button[data-status]` che nel DOM non esiste — è
 * quello che è successo cercando "Inception", già aggiunto da un membro vero
 * del gruppo. Restituisce la prima card SENZA quel tag, cioè aggiungibile. */
export function firstAddableSearchCard(page: Page) {
  return page
    .locator("#results .poster-card")
    .filter({ hasNot: page.locator(".poster-card__tag") })
    .first();
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
  screen: "home" | "stats" | "tonight" | "report"
): Promise<void> {
  await page.locator(`.nav__btn[data-screen="${screen}"]`).click();
}

/** Compila #searchInput e lancia la ricerca. Da fix 45a67f8: non c'è più
 * ricerca live al variare del testo, serve un click su #searchBtn (o Invio,
 * gestito a parte da app.js sullo stesso handler doSearch) — un .fill() da
 * solo non innesca più nulla. */
export async function search(page: Page, query: string): Promise<void> {
  await page.locator("#searchInput").fill(query);
  await page.locator("#searchBtn").click();
}

/** Cambia il filtro Mia/Gruppo della watchlist in Home (d114b13). Di default
 * è "me" ("Io"): mostra solo i titoli aggiunti dall'utente corrente. */
export async function setWatchlistMode(page: Page, mode: "me" | "group"): Promise<void> {
  await page.locator(`#watchlistModeToggle .stats-toggle-btn[data-mode="${mode}"]`).click();
}

/** Cambia il filtro Io/Gruppo delle Statistiche — di default "me" ("Io"):
 * card numeriche, generi e classifica calcolati sui soli voti dell'utente
 * corrente (invertito da "group": prima il default era l'opposto). Toggle
 * indipendente da quello della watchlist in Home (stessa classe CSS
 * .stats-toggle-btn, id diverso). */
export async function setStatsMode(page: Page, mode: "me" | "group"): Promise<void> {
  await page.locator(`#statsIoGruppoToggle .stats-toggle-btn[data-mode="${mode}"]`).click();
}

/** Cambia il filtro Io/Gruppo del tab Report — di default "io": il report
 * personale scritto da Claude (#reportBody, gate/tasto Aggiorna). "gruppo"
 * mostra invece #groupReportBody (profilo del gruppo, chi siete uno per
 * uno, chi ha votato di più, coppie di gusto, estremi) — calcolato lato
 * client da cine-core.js, con testo opzionale scritto da Claude sopra se
 * è mai stato generato un group_report (altrimenti resta il fallback
 * templato, sempre disponibile). Nessun tasto "Aggiorna" per "gruppo": si
 * aggiorna da solo una volta all'anno, o con 7 tap rapidi su #reportTitleTap
 * (vedi tapReportTitleSevenTimes sotto). */
export async function setReportMode(page: Page, mode: "io" | "gruppo"): Promise<void> {
  await page.locator(`#reportIoGruppoToggle .stats-toggle-btn[data-mode="${mode}"]`).click();
}

/** Simula il gesto nascosto dei 7 tap rapidi su #reportTitleTap che apre la
 * conferma per forzare una rigenerazione del report (Io o Gruppo, a seconda
 * del tab aperto al momento) — vedi app.js::bindGlobalEvents. Il conteggio
 * si azzera da solo dopo 2,5s di inattività: i click qui sono deliberatamente
 * ravvicinati (nessun delay tra l'uno e l'altro) per restare dentro quella
 * finestra anche su una macchina CI lenta. */
export async function tapReportTitleSevenTimes(page: Page): Promise<void> {
  const title = page.locator("#reportTitleTap");
  for (let i = 0; i < 7; i++) {
    await title.click();
  }
}
