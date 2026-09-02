import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import { QA_USER, selectExistingUser } from "../../fixtures/cinefighi-page.ts";

// A differenza di CineTracker, CineFighi non ha un banner offline globale
// (nessun elemento #offlineBanner: verificato sul sorgente, app.js non lo
// crea da nessuna parte). Gestisce l'offline per singola azione, con un
// controllo navigator.onLine appena prima di ogni chiamata di rete che
// mostra un messaggio inline o un toast invece di un banner persistente —
// vedi recommendTonightFive()/discoverByTaste()/handleReportRefresh().
// Verifichiamo qui la più semplice e raggiungibile delle tre: "Stasera".
//
// recommendTonightFive() controlla PRIMA "hai votato almeno 3 titoli?" e
// solo dopo "sei online?": con lo storico voti reale di QA_USER (quasi
// sempre sotto i 3) il ramo offline non sarebbe mai raggiunto. Mockiamo
// quindi una libreria minima con 3 titoli già votati da QA_USER, così il
// test arriva sempre al controllo che vogliamo verificare.
function fakeTitle(id: number, title: string) {
  return {
    id,
    tmdb_id: id,
    media_type: "movie",
    title,
    year: "2024",
    poster_path: "",
    backdrop_path: "",
    overview: "",
    genre_names: ["Thriller"],
    director: "",
    status: "seen",
    added_by: QA_USER,
    created_at: new Date().toISOString()
  };
}

const TITLES = [
  fakeTitle(950001, "Film Uno QA"),
  fakeTitle(950002, "Film Due QA"),
  fakeTitle(950003, "Film Tre QA")
];

const VOTES = [
  { title_id: 950001, user_name: QA_USER, vote: 7 },
  { title_id: 950002, user_name: QA_USER, vote: 8 },
  { title_id: 950003, user_name: QA_USER, vote: 6 }
];

test.describe("CineFighi — gestione offline per azione (nessun banner globale)", () => {
  test.beforeEach(async ({ page }) => {
    await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
    await mockJson(page, /rest\/v1\/titles/, TITLES);
    await mockJson(page, /rest\/v1\/votes/, VOTES);
    // Tutti i titoli qui sono "seen": nessuno passa dalla watchlist per
    // persona (d235f7a), quindi basta un mock vuoto.
    await mockJson(page, /rest\/v1\/watchlist_adds/, []);
    // Vedi commento gemello in new-title-dot.spec.ts: la richiesta a Google
    // Fonts fallisce sempre in sandbox e rallenta i reload ripetuti.
    await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

    await page.goto(".");
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
    await page.locator('.nav__btn[data-screen="tonight"]').click();
  });

  test("chiedere consigli da offline mostra un invito a riconnettersi, non resta bloccata in silenzio", async ({
    page,
    context
  }) => {
    await context.setOffline(true);
    // Nessun banner su cui aspettare (a differenza di CineTracker): usiamo
    // navigator.onLine direttamente per lo stesso motivo — garantire che il
    // browser abbia già osservato l'evento "offline" prima del click,
    // altrimenti recommendTonightFive() può ancora leggerlo true e tentare
    // una vera fetch di rete.
    await page.waitForFunction(() => !navigator.onLine);

    await page.locator("#tonightBtn").click();
    await expect(page.locator("#tonightResult")).toContainText(/offline/i, { timeout: 10_000 });

    await context.setOffline(false);
  });
});
