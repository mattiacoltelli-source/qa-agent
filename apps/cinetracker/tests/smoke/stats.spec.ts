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
// generi (4 vs 1), quindi l'ordine delle voci (bar-row o bolle, stessi
// dati) è deterministico: Thriller prima, Commedia dopo.
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

// Da 16896c1/d048d72: "Generi preferiti" ha ora due viste intercambiabili
// (#genreViewToggle, persistita in localStorage — storage.js::getGenreView),
// che renderizzano nello stesso container #genreBars: "bars" (righe, vecchio
// comportamento) e "bubbles" (bolle Cinema DNA). Su storage pulito
// (gotoFresh cancella localStorage) getGenreView() ritorna "bubbles" di
// default — attendere .bar-row qui andrebbe in timeout, il DOM ha solo
// .genre-bubble-wrap/.genre-bubble finché non si passa esplicitamente a
// "Barre" (vedi test dedicato sotto).
async function gotoFreshWithMockedLibrary(page: import("@playwright/test").Page): Promise<void> {
  await mockJson(page, /rest\/v1\/Coltel/, COLTEL_ROWS);
  await gotoFresh(page);
  await openScreen(page, "stats");
  await page.locator("#genreBars .genre-bubble").first().waitFor({ state: "visible", timeout: 10_000 });
}

test.describe("CineTracker — Statistiche", () => {
  test("card numeriche e vista Bolle (default) per genere", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await expect(page.locator("#statSeen")).toHaveText("5");
    await expect(page.locator("#statWatch")).toHaveText("1");
    await expect(page.locator("#statMovies")).toHaveText("3");
    await expect(page.locator("#statSeries")).toHaveText("2");

    // Il toggle è in vista "Bolle" di default (vedi commento sopra).
    await expect(
      page.locator('#genreViewToggle .genre-view-btn[data-genre-view="bubbles"]')
    ).toHaveClass(/active/);
    await expect(page.locator("#genreLegend")).toContainText("Riempimento");

    const bubbles = page.locator("#genreBars .genre-bubble");
    await expect(bubbles).toHaveCount(2);

    const thriller = bubbles.nth(0);
    await expect(thriller.locator(".genre-bubble-text .name")).toHaveText("THRILLER");
    await expect(thriller.locator(".genre-bubble-text .count")).toHaveText("4");
    await expect(thriller.locator(".genre-bubble-text .label")).toHaveText("titoli");
    // Il voto medio resta nascosto finché la bolla non viene toccata.
    await expect(thriller.locator(".genre-bubble-text .vote")).toBeHidden();
    await thriller.click();
    await expect(thriller.locator(".genre-bubble-text .vote")).toBeVisible();
    await expect(thriller.locator(".genre-bubble-text .vote")).toHaveText("★ 7,5");

    const commedia = bubbles.nth(1);
    await expect(commedia.locator(".genre-bubble-text .name")).toHaveText("COMMEDIA");
    await expect(commedia.locator(".genre-bubble-text .count")).toHaveText("1");
    await commedia.click();
    await expect(commedia.locator(".genre-bubble-text .vote")).toHaveText("★ 9,0");
    // Solo una bolla attiva alla volta: aprirne una chiude l'altra.
    await expect(thriller.locator(".genre-bubble-text .vote")).toBeHidden();
  });

  test("vista Barre per genere (toggle #genreViewToggle)", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await page.locator('#genreViewToggle .genre-view-btn[data-genre-view="bars"]').click();
    await expect(
      page.locator('#genreViewToggle .genre-view-btn[data-genre-view="bars"]')
    ).toHaveClass(/active/);
    await expect(page.locator("#genreLegend")).toHaveText("★ media voto");

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

    // Il toggle persiste in localStorage: riaprendo Statistiche (senza
    // ricaricare la pagina) resta su "Barre" invece di tornare a "Bolle".
    await openScreen(page, "home");
    await openScreen(page, "stats");
    await expect(page.locator("#genreBars .bar-row")).toHaveCount(2);
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
    // Con solo 3 film (tutti in podio) non c'è nulla da espandere.
    await expect(page.locator("#top100ExpandBtn")).toHaveClass(/hidden/);

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

  test('classifica: "Mostra tutti"/"Mostra meno" oltre i primi 4 sotto il podio', async ({ page }) => {
    // Dataset dedicato: 10 film con voti tutti distinti (nessuna parità,
    // ordine deterministico). Podio = i primi 3; #top100List parte dalla
    // posizione 4 (offset fisso passato a renderRankingList, non la
    // lunghezza reale del podio — vedi app.js::renderRanking) e mostra solo
    // RANKING_LIST_INITIAL=4 righe finché non si espande (ui.js).
    const RANK_SEEN = [
      fakeItem(950001, "movie", "Rank A", "Drama", "9"),
      fakeItem(950002, "movie", "Rank B", "Drama", "8,5"),
      fakeItem(950003, "movie", "Rank C", "Drama", "8"),
      fakeItem(950004, "movie", "Rank D", "Drama", "7,5"),
      fakeItem(950005, "movie", "Rank E", "Drama", "7"),
      fakeItem(950006, "movie", "Rank F", "Drama", "6,5"),
      fakeItem(950007, "movie", "Rank G", "Drama", "6"),
      fakeItem(950008, "movie", "Rank H", "Drama", "5,5"),
      fakeItem(950009, "movie", "Rank I", "Drama", "5"),
      fakeItem(950010, "movie", "Rank J", "Drama", "4,5"),
      // Poche serie, ben sotto la soglia di espansione: il bottone deve
      // restare nascosto sul pannello Serie TV.
      fakeItem(950011, "tv", "Rank Serie A", "Drama", "9"),
      fakeItem(950012, "tv", "Rank Serie B", "Drama", "8")
    ];
    await mockJson(page, /rest\/v1\/Coltel/, RANK_SEEN.map((data) => ({ list: "seen", data })));
    await gotoFresh(page);
    await openScreen(page, "stats");
    await page.locator("#top100Podium .podium-card").first().waitFor({ state: "visible", timeout: 10_000 });

    await expect(page.locator("#top100CountBadge")).toHaveText("10");
    await expect(page.locator("#top100Podium .podium-card")).toHaveCount(3);

    const list = page.locator("#top100List .rank-row");
    const expandBtn = page.locator("#top100ExpandBtn");
    await expect(list).toHaveCount(4);
    await expect(list.first().locator(".rank-row__title")).toHaveText("Rank D");
    await expect(list.first().locator(".rank-row__pos")).toHaveText("4");
    await expect(expandBtn).not.toHaveClass(/hidden/);
    await expect(expandBtn.locator(".rank-expand-btn__label")).toHaveText("Mostra tutti");
    await expect(expandBtn.locator(".rank-expand-btn__count")).toHaveText("· 3");

    await expandBtn.click();
    await expect(list).toHaveCount(7);
    await expect(list.last().locator(".rank-row__title")).toHaveText("Rank J");
    await expect(list.last().locator(".rank-row__pos")).toHaveText("10");
    await expect(expandBtn.locator(".rank-expand-btn__label")).toHaveText("Mostra meno");
    await expect(expandBtn.locator(".rank-expand-btn__count")).toHaveClass(/hidden/);

    await expandBtn.click();
    await expect(list).toHaveCount(4);
    await expect(expandBtn.locator(".rank-expand-btn__label")).toHaveText("Mostra tutti");

    // Pannello Serie TV: solo 2 titoli, tutti in podio, niente da espandere.
    await page.locator("#rankingToggleSeries").click();
    await expect(page.locator("#top100SeriesPodium .podium-card")).toHaveCount(2);
    await expect(page.locator("#top100SeriesList .rank-row")).toHaveCount(0);
    await expect(page.locator("#top100SeriesExpandBtn")).toHaveClass(/hidden/);
  });
});
