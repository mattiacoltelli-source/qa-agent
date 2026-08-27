import { test, expect } from "@playwright/test";
import { mockJson } from "../../../../core/network.ts";
import { gotoFresh, openScreen } from "../../fixtures/cinetracker-page.ts";

// Verifica lo schermo Statistiche: card numeriche, media voto per genere
// (★, aggiunta di recente) e podio/classifica separati Film/Serie TV.
// CineTracker è single-user (nessun toggle Io/Gruppo come in CineFighi):
// tutto qui è calcolato sull'unica libreria dell'utente.
//
// Sola lettura ma interamente mockata, non sulla libreria reale: sia
// perché servono medie e ordine noti in anticipo (impossibile da garantire
// sui dati veri), sia perché renderStats() richiede almeno 3 titoli visti
// per disegnare generi e classifica (sotto soglia mostra solo gli stati
// vuoti) — una soglia che la libreria reale potrebbe anche non superare.

function fakeItem(
  id: number,
  mediaType: "movie" | "tv",
  title: string,
  genre: string,
  vote: string
) {
  return {
    id,
    tmdb_id: id,
    media_type: mediaType,
    title,
    year: "2024",
    poster_path: "",
    backdrop_path: "",
    overview: "",
    genre_names: [genre],
    vote
  };
}

// Film A/B e le due Serie condividono il genere "Thriller" (genreCount non
// distingue per media_type): media = (8+6+7+9)/4 = 7.5. Film C è l'unico
// titolo "Commedia": media 9.0. Nessuna parità di conteggio tra i due
// generi (4 vs 1), quindi l'ordine dei bar-row è deterministico.
const SEEN = [
  fakeItem(940001, "movie", "Film A QA", "Thriller", "8"),
  fakeItem(940002, "movie", "Film B QA", "Thriller", "6"),
  fakeItem(940003, "movie", "Film C QA", "Commedia", "9"),
  fakeItem(940004, "tv", "Serie A QA", "Thriller", "7"),
  fakeItem(940005, "tv", "Serie B QA", "Thriller", "9")
];
const WATCHLIST = [fakeItem(940006, "movie", "Film D QA", "Thriller", "")];

const COLTEL_ROWS = [
  ...SEEN.map((data) => ({ list: "seen", data })),
  ...WATCHLIST.map((data) => ({ list: "watchlist", data }))
];

async function gotoFreshWithMockedLibrary(page: import("@playwright/test").Page): Promise<void> {
  await mockJson(page, /rest\/v1\/Coltel/, COLTEL_ROWS);
  await gotoFresh(page);
  await openScreen(page, "stats");
  await page.locator("#genreBars .bar-row").first().waitFor({ state: "visible", timeout: 10_000 });
}

test.describe("CineTracker — Statistiche", () => {
  test("card numeriche e media voto per genere", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await expect(page.locator("#statSeen")).toHaveText("5");
    await expect(page.locator("#statWatch")).toHaveText("1");
    await expect(page.locator("#statMovies")).toHaveText("3");
    await expect(page.locator("#statSeries")).toHaveText("2");

    const bars = page.locator("#genreBars .bar-row");
    await expect(bars).toHaveCount(2);
    await expect(bars.nth(0).locator(".bar-row__name")).toHaveText("Thriller");
    // .bar-row__avg è annidato dentro .bar-row__count (stesso span), non un
    // fratello separato come in CineFighi — vedi ui.js::renderGenreBars.
    await expect(bars.nth(0).locator(".bar-row__count")).toContainText("4 titoli");
    await expect(bars.nth(0).locator(".bar-row__avg")).toHaveText("★ 7,5");
    await expect(bars.nth(1).locator(".bar-row__name")).toHaveText("Commedia");
    await expect(bars.nth(1).locator(".bar-row__count")).toContainText("1 titolo");
    await expect(bars.nth(1).locator(".bar-row__avg")).toHaveText("★ 9,0");
  });

  test("classifica Film: podio ordinato per voto, il tab Serie TV è un pannello separato", async ({
    page
  }) => {
    await gotoFreshWithMockedLibrary(page);

    // Pannello Film attivo di default: podio ordinato per voto desc, il
    // voto mostrato è il valore grezzo salvato (item.vote), non ricalcolato.
    await expect(page.locator("#rankingPanelMovies")).toBeVisible();
    await expect(page.locator("#rankingPanelSeries")).toBeHidden();
    await expect(page.locator("#top100CountBadge")).toHaveText("3");
    const moviePodium = page.locator("#top100Podium .podium-card");
    await expect(moviePodium).toHaveCount(3);
    await expect(moviePodium.nth(0).locator(".podium-card__title")).toHaveText("Film C QA");
    await expect(moviePodium.nth(0).locator(".podium-card__vote")).toHaveText("★ 9");
    await expect(moviePodium.nth(1).locator(".podium-card__title")).toHaveText("Film A QA");
    await expect(moviePodium.nth(2).locator(".podium-card__title")).toHaveText("Film B QA");
    await expect(page.locator("#top100List .rank-row")).toHaveCount(0);

    // Il tab Serie TV mostra/nasconde i due pannelli, i dati sono già
    // calcolati per entrambi da renderRanking() — non serve ricaricare nulla.
    await page.locator("#rankingToggleSeries").click();
    await expect(page.locator("#rankingPanelSeries")).toBeVisible();
    await expect(page.locator("#rankingPanelMovies")).toBeHidden();
    await expect(page.locator("#top100SeriesCountBadge")).toHaveText("2");
    const seriesPodium = page.locator("#top100SeriesPodium .podium-card");
    await expect(seriesPodium).toHaveCount(2);
    await expect(seriesPodium.nth(0).locator(".podium-card__title")).toHaveText("Serie B QA");
    await expect(seriesPodium.nth(0).locator(".podium-card__vote")).toHaveText("★ 9");
    await expect(seriesPodium.nth(1).locator(".podium-card__title")).toHaveText("Serie A QA");
  });
});
