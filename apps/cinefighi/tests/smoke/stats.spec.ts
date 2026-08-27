import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import { QA_USER, selectExistingUser, setStatsMode } from "../../fixtures/cinefighi-page.ts";

// Verifica lo schermo Statistiche: card numeriche, media voto per genere
// (★, aggiunta di recente) e podio/classifica, sia in modalità "Gruppo"
// (default) che "Io" — le due usano formule diverse (average() su tutti i
// voti vs. il solo voto dell'utente corrente, vedi app.js::renderStats).
// Sola lettura: libreria interamente mockata (nessuna scrittura reale su
// Supabase), unico modo di conoscere con certezza medie e ordine attesi —
// impossibile da garantire sulla libreria condivisa vera.

function fakeTitle(id: number, title: string, genre: string) {
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

// Film A: votato da entrambi (media gruppo 7.0, voto mio 8.0).
// Film B: votato solo da me (media gruppo e mia coincidono, 6.0).
// Film C: votato solo da "Un Amico" — in modalità "Io" sparisce del tutto,
// sia dai generi che dalla classifica, perché io non l'ho mai votato.
const TITLES = [
  fakeTitle(930001, "Film A QA", "Thriller"),
  fakeTitle(930002, "Film B QA", "Thriller"),
  fakeTitle(930003, "Film C QA", "Commedia")
];

const VOTES = [
  { title_id: 930001, user_name: "Un Amico", vote: 6 },
  { title_id: 930001, user_name: QA_USER, vote: 8 },
  { title_id: 930002, user_name: QA_USER, vote: 6 },
  { title_id: 930003, user_name: "Un Amico", vote: 9 }
];

async function gotoFreshWithMockedLibrary(page: import("@playwright/test").Page): Promise<void> {
  await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }, { name: "Un Amico" }]);
  await mockJson(page, /rest\/v1\/titles/, TITLES);
  await mockJson(page, /rest\/v1\/votes/, VOTES);
  // Vedi commento gemello in new-title-dot.spec.ts: la richiesta a Google
  // Fonts fallisce sempre in sandbox e rallenta i reload ripetuti.
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
  const picked = await selectExistingUser(page, QA_USER);
  if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
  await page.locator('.nav__btn[data-screen="stats"]').click();
  await page.locator("#genreBars .bar-row").first().waitFor({ state: "visible", timeout: 10_000 });
}

test.describe("CineFighi — Statistiche", () => {
  test("modalità Gruppo (default): card, media voto per genere e classifica su tutti i voti", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await expect(page.locator("#statSeen")).toHaveText("3");
    await expect(page.locator("#statMovies")).toHaveText("3");
    await expect(page.locator("#statSeries")).toHaveText("0");

    // Thriller: 2 titoli, media dei punteggi di gruppo per titolo
    // (Film A 7.0, Film B 6.0) = 6.5. Ordinato per conteggio, prima di
    // Commedia (1 titolo, Film C 9.0).
    const bars = page.locator("#genreBars .bar-row");
    await expect(bars).toHaveCount(2);
    await expect(bars.nth(0).locator(".bar-row__name")).toHaveText("Thriller");
    await expect(bars.nth(0).locator(".bar-row__count")).toHaveText("2 titoli");
    await expect(bars.nth(0).locator(".bar-row__vote")).toHaveText("★ 6,5");
    await expect(bars.nth(1).locator(".bar-row__name")).toHaveText("Commedia");
    await expect(bars.nth(1).locator(".bar-row__vote")).toHaveText("★ 9,0");

    // Classifica Film (default in #rankingMediaToggle): ordinata per media
    // di gruppo desc — Film C (9.0), Film A (7.0), Film B (6.0). Con solo 3
    // titoli finiscono tutti sul podio, nessuno nella lista sotto.
    await expect(page.locator("#rankingCountBadge")).toHaveText("3");
    const podium = page.locator("#rankingPodium .podium-card");
    await expect(podium).toHaveCount(3);
    await expect(podium.nth(0).locator(".podium-card__title")).toHaveText("Film C QA");
    await expect(podium.nth(0).locator(".podium-card__vote")).toHaveText("★ 9.0");
    await expect(podium.nth(1).locator(".podium-card__title")).toHaveText("Film A QA");
    await expect(podium.nth(2).locator(".podium-card__title")).toHaveText("Film B QA");
    await expect(page.locator("#rankingList .rank-row")).toHaveCount(0);
  });

  test('modalità "Io": generi e classifica solo sui titoli che ho votato io', async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);
    // init() (app.js) fa più giri di reloadLibrary() ravvicinati (uno al
    // boot, uno dopo la selezione utente): ognuno richiama renderStats() in
    // modalità "group", letta dal vivo al momento della chiamata — se uno di
    // questi arriva DOPO il click su "Io" invece che prima, è l'ultimo a
    // scrivere sui contatori animati e lascia a video il valore di gruppo
    // (osservato in CI, non un'ipotesi: gli stessi contatori restavano a "3"
    // anche con animateValue corretto, mentre generi/classifica — non
    // animati — mostravano già "Io" giusto). Aspettiamo che la rete si
    // calmi PRIMA di cambiare modalità, così il click è garantito essere
    // l'ultimo a ridisegnare.
    await page.waitForLoadState("networkidle");
    await setStatsMode(page, "me");

    // myVoted = Film A (voto mio 8) + Film B (voto mio 6): Film C esclusa,
    // io non l'ho mai votata.
    await expect(page.locator("#statSeen")).toHaveText("2");
    await expect(page.locator("#statMovies")).toHaveText("2");

    // Un solo genere: Commedia (solo su Film C) sparisce del tutto.
    const bars = page.locator("#genreBars .bar-row");
    await expect(bars).toHaveCount(1);
    await expect(bars.nth(0).locator(".bar-row__name")).toHaveText("Thriller");
    await expect(bars.nth(0).locator(".bar-row__count")).toHaveText("2 titoli");
    // Media dei MIEI voti su Thriller: (8 + 6) / 2 = 7.0 — diversa dalla
    // media di gruppo (6.5) vista nel test precedente, stesso genere.
    await expect(bars.nth(0).locator(".bar-row__vote")).toHaveText("★ 7,0");

    await expect(page.locator("#rankingCountBadge")).toHaveText("2");
    const podium = page.locator("#rankingPodium .podium-card");
    await expect(podium).toHaveCount(2);
    await expect(podium.nth(0).locator(".podium-card__title")).toHaveText("Film A QA");
    await expect(podium.nth(0).locator(".podium-card__vote")).toHaveText("★ 8.0");
    await expect(podium.nth(1).locator(".podium-card__title")).toHaveText("Film B QA");
  });
});
