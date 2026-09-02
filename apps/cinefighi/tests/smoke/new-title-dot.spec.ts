import { test, expect } from "@playwright/test";
import { clearBrowserStorage, seedLocalStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import { QA_USER, selectExistingUser, setWatchlistMode } from "../../fixtures/cinefighi-page.ts";

// Verifica il puntino discreto sui titoli aggiunti da altri dopo l'ultima
// apertura (storage.js::getLastSeenAt/setLastSeenAt, ui.js::renderShelf).
// Sola lettura: la libreria è interamente mockata (nessuna scrittura reale
// su Supabase), così controlliamo con precisione le date di creazione dei
// titoli — impossibile da garantire sulla libreria condivisa vera.

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const NEW_CREATED_AT = isoDaysAgo(0.01); // pochi minuti fa
const OLD_CREATED_AT = isoDaysAgo(400); // più di un anno fa

function fakeTitle(id: number, title: string, createdAt: string) {
  return {
    id,
    tmdb_id: id,
    media_type: "movie",
    title,
    year: "2024",
    poster_path: "",
    backdrop_path: "",
    overview: "",
    genre_names: [],
    director: "",
    status: "watchlist",
    added_by: "Un Amico",
    created_at: createdAt
  };
}

const TITLES = [
  fakeTitle(900001, "Titolo Recentissimo QA", NEW_CREATED_AT),
  fakeTitle(900002, "Titolo Antico QA", OLD_CREATED_AT)
];

/** Mocka l'intera libreria (utenti, titoli, voti) — va chiamato PRIMA di
 * qualunque navigazione, come da convenzione di questa suite. */
async function mockLibrary(page: import("@playwright/test").Page): Promise<void> {
  await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
  await mockJson(page, /rest\/v1\/titles/, TITLES);
  await mockJson(page, /rest\/v1\/votes/, []);
  // Questo file testa solo la vista "Gruppo" (setWatchlistMode "group"),
  // che non filtra su watchlist_by (d235f7a): basta un mock vuoto.
  await mockJson(page, /rest\/v1\/watchlist_adds/, []);
  // La richiesta reale a Google Fonts (@import in cima a styles.css) fallisce
  // sempre in questa sandbox (nessun accesso a internet reale) — ma il
  // fallimento diventa via via più lento sui reload ripetuti nella stessa
  // sessione (osservato: un reload che passa subito, il successivo va in
  // timeout anche solo su "domcontentloaded"), bloccando l'esecuzione dello
  // script che segue il foglio di stile. Interrompiamo la richiesta noi,
  // subito, invece di aspettare che fallisca da sola.
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());
}

/** Avvio pulito con libreria mockata: naviga, pulisce lo storage, ricarica,
 * seleziona l'utente di test (nessuna scrittura reale: la lista utenti è
 * mockata, "selezionare un profilo esistente" è solo un click in UI). */
async function gotoFreshWithMockedLibrary(page: import("@playwright/test").Page): Promise<void> {
  await mockLibrary(page);
  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
  const picked = await selectExistingUser(page, QA_USER);
  if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
  // I titoli finti sono tutti added_by "Un Amico" (il punto del test è il
  // puntino su roba aggiunta da altri): col default "Io" (d114b13) la
  // watchlist Home li nasconderebbe tutti. Passiamo a "Gruppo" per vederli.
  await setWatchlistMode(page, "group");
  await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });
}

test.describe("CineFighi — puntino discreto sui titoli nuovi", () => {
  test("alla primissima apertura in assoluto nessun titolo è marcato come nuovo", async ({ page }) => {
    // Senza una "ultima visita" salvata (localStorage appena pulito), non c'è
    // un confronto sensato: meglio non riempire di puntini tutta la libreria
    // esistente al primo avvio (vedi ui.js::renderShelf, isNew richiede
    // lastSeenAt truthy).
    await gotoFreshWithMockedLibrary(page);
    await expect(page.locator(".shelf-card__new-dot")).toHaveCount(0);
  });

  test("un titolo aggiunto dopo l'ultima visita riceve il puntino, uno precedente no", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    // Simuliamo che l'ultima apertura registrata sia caduta tra i due
    // titoli: init() (app.js) legge questo valore PRIMA di sovrascriverlo,
    // quindi basta impostarlo ora e ricaricare.
    const between = new Date(
      (new Date(OLD_CREATED_AT).getTime() + new Date(NEW_CREATED_AT).getTime()) / 2
    ).toISOString();
    await seedLocalStorage(page, "cinefighiLastSeenAt", between);
    await page.reload({ waitUntil: "domcontentloaded" });
    // watchlistMode (app.js) è una variabile in memoria, non persistita: ogni
    // reload la resetta al default "me" ("Io"), che nasconderebbe di nuovo i
    // titoli finti (added_by "Un Amico").
    await setWatchlistMode(page, "group");
    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });

    const newCard = page.locator(".shelf-card", { hasText: "Titolo Recentissimo QA" });
    const oldCard = page.locator(".shelf-card", { hasText: "Titolo Antico QA" });
    await expect(newCard.locator(".shelf-card__new-dot")).toHaveCount(1);
    await expect(oldCard.locator(".shelf-card__new-dot")).toHaveCount(0);
  });

  test("riaprendo subito dopo, il puntino è già sparito", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    const between = new Date(
      (new Date(OLD_CREATED_AT).getTime() + new Date(NEW_CREATED_AT).getTime()) / 2
    ).toISOString();
    await seedLocalStorage(page, "cinefighiLastSeenAt", between);
    await page.reload({ waitUntil: "domcontentloaded" });
    // watchlistMode (app.js) è una variabile in memoria, non persistita: ogni
    // reload la resetta al default "me" ("Io"), che nasconderebbe di nuovo i
    // titoli finti (added_by "Un Amico").
    await setWatchlistMode(page, "group");
    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator(".shelf-card__new-dot")).toHaveCount(1); // precondizione: il puntino c'era

    // init() aggiorna subito "l'ultima visita" a ora: una seconda apertura,
    // senza nulla di nuovo aggiunto nel frattempo, non deve più mostrarlo.
    await page.reload({ waitUntil: "domcontentloaded" });
    // watchlistMode (app.js) è una variabile in memoria, non persistita: ogni
    // reload la resetta al default "me" ("Io"), che nasconderebbe di nuovo i
    // titoli finti (added_by "Un Amico").
    await setWatchlistMode(page, "group");
    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator(".shelf-card__new-dot")).toHaveCount(0);
  });

  test("lasciando la Home per Statistiche e tornando indietro (tab bar), il puntino sparisce senza reload", async ({ page }) => {
    // Prima di questo fix, "ultima visita" veniva aggiornata solo all'avvio
    // dell'app: il puntino restava visibile per tutta la sessione anche dopo
    // aver visto il titolo, sparendo solo con un reload completo della pagina
    // (vedi app.js::goToScreen/markHomeSeen).
    await gotoFreshWithMockedLibrary(page);

    const between = new Date(
      (new Date(OLD_CREATED_AT).getTime() + new Date(NEW_CREATED_AT).getTime()) / 2
    ).toISOString();
    await seedLocalStorage(page, "cinefighiLastSeenAt", between);
    await page.reload({ waitUntil: "domcontentloaded" });
    // watchlistMode (app.js) è una variabile in memoria, non persistita: ogni
    // reload la resetta al default "me" ("Io"), che nasconderebbe di nuovo i
    // titoli finti (added_by "Un Amico").
    await setWatchlistMode(page, "group");
    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator(".shelf-card__new-dot")).toHaveCount(1); // precondizione: il puntino c'era

    await page.locator('.nav__btn[data-screen="stats"]').click();
    await page.locator("#screen-stats").waitFor({ state: "visible", timeout: 5_000 });

    await page.locator('.nav__btn[data-screen="home"]').click();
    await page.locator("#screen-home").waitFor({ state: "visible", timeout: 5_000 });

    await expect(page.locator(".shelf-card__new-dot")).toHaveCount(0);
  });

  test("tornando alla Home col bottone indietro del browser dopo aver aperto un dettaglio, il puntino è già sparito", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    const between = new Date(
      (new Date(OLD_CREATED_AT).getTime() + new Date(NEW_CREATED_AT).getTime()) / 2
    ).toISOString();
    await seedLocalStorage(page, "cinefighiLastSeenAt", between);
    await page.reload({ waitUntil: "domcontentloaded" });
    // watchlistMode (app.js) è una variabile in memoria, non persistita: ogni
    // reload la resetta al default "me" ("Io"), che nasconderebbe di nuovo i
    // titoli finti (added_by "Un Amico").
    await setWatchlistMode(page, "group");
    await page.locator("#watchShelf .shelf-card").first().waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator(".shelf-card__new-dot")).toHaveCount(1); // precondizione: il puntino c'era

    await page.locator(".shelf-card").first().click();
    await page.locator("#screen-detail").waitFor({ state: "visible", timeout: 5_000 });

    await page.goBack();
    await page.locator("#screen-home").waitFor({ state: "visible", timeout: 5_000 });

    await expect(page.locator(".shelf-card__new-dot")).toHaveCount(0);
  });
});
