import { test, expect } from "@playwright/test";
import { mockJson } from "../../../../core/network.ts";
import { gotoFresh, openScreen } from "../../fixtures/cinetracker-page.ts";
import { S } from "../../fixtures/selectors.ts";

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
  await page.locator(S.genreBarsGenreBubble).first().waitFor({ state: "visible", timeout: 10_000 });
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
      page.locator(S.genreViewToggleGenreViewBtnBubbles)
    ).toHaveClass(/active/);
    await expect(page.locator("#genreLegend")).toContainText("Riempimento");

    const bubbles = page.locator(S.genreBarsGenreBubble);
    await expect(bubbles).toHaveCount(2);

    const thriller = bubbles.nth(0);
    await expect(thriller.locator(S.genreBubbleTextName)).toHaveText("THRILLER");
    await expect(thriller.locator(S.genreBubbleTextCount)).toHaveText("4");
    await expect(thriller.locator(S.genreBubbleTextLabel)).toHaveText("titoli");
    // Il voto medio resta nascosto finché la bolla non viene toccata.
    await expect(thriller.locator(S.genreBubbleTextVote)).toBeHidden();
    await thriller.click();
    await expect(thriller.locator(S.genreBubbleTextVote)).toBeVisible();
    await expect(thriller.locator(S.genreBubbleTextVote)).toHaveText("★ 7,5");

    const commedia = bubbles.nth(1);
    await expect(commedia.locator(S.genreBubbleTextName)).toHaveText("COMMEDIA");
    await expect(commedia.locator(S.genreBubbleTextCount)).toHaveText("1");
    await commedia.click();
    await expect(commedia.locator(S.genreBubbleTextVote)).toHaveText("★ 9,0");
    // Solo una bolla attiva alla volta: aprirne una chiude l'altra.
    await expect(thriller.locator(S.genreBubbleTextVote)).toBeHidden();
  });

  test("vista Barre per genere (toggle #genreViewToggle)", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    await page.locator(S.genreViewToggleGenreViewBtnBars).click();
    await expect(
      page.locator(S.genreViewToggleGenreViewBtnBars)
    ).toHaveClass(/active/);
    await expect(page.locator("#genreLegend")).toHaveText("★ media voto");

    const bars = page.locator(S.genreBarsBarRow);
    await expect(bars).toHaveCount(2);
    await expect(bars.nth(0).locator(S.barRowName)).toHaveText("Thriller");
    // .bar-row__avg è annidato dentro .bar-row__count (stesso span), non un
    // fratello separato come in CineFighi — vedi ui.js::renderGenreBars.
    await expect(bars.nth(0).locator(S.barRowCount)).toContainText("4 titoli");
    await expect(bars.nth(0).locator(S.barRowAvg)).toHaveText("★ 7,5");
    await expect(bars.nth(1).locator(S.barRowName)).toHaveText("Commedia");
    await expect(bars.nth(1).locator(S.barRowCount)).toContainText("1 titolo");
    await expect(bars.nth(1).locator(S.barRowAvg)).toHaveText("★ 9,0");

    // Il toggle persiste in localStorage: riaprendo Statistiche (senza
    // ricaricare la pagina) resta su "Barre" invece di tornare a "Bolle".
    await openScreen(page, "home");
    await openScreen(page, "stats");
    await expect(page.locator(S.genreBarsBarRow)).toHaveCount(2);
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
    const moviePodium = page.locator(S.top100PodiumPodiumCard);
    await expect(moviePodium).toHaveCount(3);
    await expect(moviePodium.nth(0).locator(S.podiumCardTitle)).toHaveText("Film C QA");
    await expect(moviePodium.nth(0).locator(S.podiumCardVote)).toHaveText("★ 9");
    await expect(moviePodium.nth(1).locator(S.podiumCardTitle)).toHaveText("Film A QA");
    await expect(moviePodium.nth(2).locator(S.podiumCardTitle)).toHaveText("Film B QA");
    await expect(page.locator(S.top100ListRankRow)).toHaveCount(0);
    // Con solo 3 film (tutti in podio) non c'è nulla da espandere.
    await expect(page.locator("#top100ExpandBtn")).toHaveClass(/hidden/);

    // Il tab Serie TV mostra/nasconde i due pannelli, i dati sono già
    // calcolati per entrambi da renderRanking() — non serve ricaricare nulla.
    await page.locator("#rankingToggleSeries").click();
    await expect(page.locator("#rankingPanelSeries")).toBeVisible();
    await expect(page.locator("#rankingPanelMovies")).toBeHidden();
    await expect(page.locator("#top100SeriesCountBadge")).toHaveText("2");
    const seriesPodium = page.locator(S.top100SeriesPodiumPodiumCard);
    await expect(seriesPodium).toHaveCount(2);
    await expect(seriesPodium.nth(0).locator(S.podiumCardTitle)).toHaveText("Serie B QA");
    await expect(seriesPodium.nth(0).locator(S.podiumCardVote)).toHaveText("★ 9");
    await expect(seriesPodium.nth(1).locator(S.podiumCardTitle)).toHaveText("Serie A QA");
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
    await page.locator(S.top100PodiumPodiumCard).first().waitFor({ state: "visible", timeout: 10_000 });

    await expect(page.locator("#top100CountBadge")).toHaveText("10");
    await expect(page.locator(S.top100PodiumPodiumCard)).toHaveCount(3);

    const list = page.locator(S.top100ListRankRow);
    const expandBtn = page.locator("#top100ExpandBtn");
    await expect(list).toHaveCount(4);
    await expect(list.first().locator(S.rankRowTitle)).toHaveText("Rank D");
    await expect(list.first().locator(S.rankRowPos)).toHaveText("4");
    await expect(expandBtn).not.toHaveClass(/hidden/);
    await expect(expandBtn.locator(S.rankExpandBtnLabel)).toHaveText("Mostra tutti");
    await expect(expandBtn.locator(S.rankExpandBtnCount)).toHaveText("· 3");

    await expandBtn.click();
    await expect(list).toHaveCount(7);
    await expect(list.last().locator(S.rankRowTitle)).toHaveText("Rank J");
    await expect(list.last().locator(S.rankRowPos)).toHaveText("10");
    await expect(expandBtn.locator(S.rankExpandBtnLabel)).toHaveText("Mostra meno");
    await expect(expandBtn.locator(S.rankExpandBtnCount)).toHaveClass(/hidden/);

    await expandBtn.click();
    await expect(list).toHaveCount(4);
    await expect(expandBtn.locator(S.rankExpandBtnLabel)).toHaveText("Mostra tutti");

    // Pannello Serie TV: solo 2 titoli, tutti in podio, niente da espandere.
    await page.locator("#rankingToggleSeries").click();
    await expect(page.locator(S.top100SeriesPodiumPodiumCard)).toHaveCount(2);
    await expect(page.locator(S.top100SeriesListRankRow)).toHaveCount(0);
    await expect(page.locator("#top100SeriesExpandBtn")).toHaveClass(/hidden/);
  });
});

// ─── REGRESSIONI SU RENDER RIPETUTI ─────────────────────────────────────────
// renderStats() gira ad ogni renderAll() (12 punti diversi in app.js, più il
// boot) e ogni apertura della tab la richiama: un listener legato lì dentro
// invece che in bindEvents() finisce doppio-legato. È esattamente il bug
// trovato scrivendo la copertura di "Mostra tutti" e corretto in Cos90 con
// 64ee2a2: il bottone espandeva e richiudeva nello stesso click, sempre a
// somma zero, quindi inerte dalla SECONDA apertura di Statistiche in poi. Il
// test sopra apre Statistiche una volta sola e non lo avrebbe mai visto.

const MANY_SEEN = Array.from({ length: 10 }, (_, i) =>
  fakeItem(960001 + i, "movie", `Render Film ${i + 1}`, "Drama", String(9 - i * 0.4).replace(".", ","))
);

test.describe("CineTracker — Statistiche — stabilità su render ripetuti", () => {
  test('"Mostra tutti" funziona ancora dopo aver riaperto Statistiche più volte', async ({
    page,
  }) => {
    await mockJson(page, /rest\/v1\/Coltel/, MANY_SEEN.map((data) => ({ list: "seen", data })));
    await gotoFresh(page);

    // Tre aperture della tab: con il listener legato dentro renderStats()
    // il bottone qui sarebbe legato 3+ volte (una per render) e un click
    // applicherebbe il toggle un numero pari di volte, senza effetto
    // visibile.
    //
    // La pausa tra un tap e l'altro NON è cosmetica: 7 click entro 500ms
    // l'uno dall'altro, ovunque nella pagina, aprono #screen-backup (il
    // gesto nascosto, vedi lo script in index.html e
    // openBackupViaSecretGesture nella fixture). Sette navigazioni di fila
    // senza pause lo fanno scattare e i test finiscono a guardare la
    // schermata sbagliata: il podio resta nel DOM ma dentro uno
    // #screen-stats nascosto.
    for (let i = 0; i < 3; i++) {
      await openScreen(page, "stats");
      await page.locator(S.top100PodiumPodiumCard).first().waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForTimeout(600);
      await openScreen(page, "home");
      await page.waitForTimeout(600);
    }
    await openScreen(page, "stats");
    await page.locator(S.top100PodiumPodiumCard).first().waitFor({ state: "visible", timeout: 10_000 });

    const list = page.locator(S.top100ListRankRow);
    const expandBtn = page.locator("#top100ExpandBtn");
    await expect(list).toHaveCount(4);

    await expandBtn.click();
    await expect(list).toHaveCount(7);
    await expect(expandBtn.locator(S.rankExpandBtnLabel)).toHaveText("Mostra meno");

    // E il ritorno funziona allo stesso modo (un click = un toggle, non due).
    await expandBtn.click();
    await expect(list).toHaveCount(4);
    await expect(expandBtn.locator(S.rankExpandBtnLabel)).toHaveText("Mostra tutti");
  });
});

// ─── GENERI: quanti ne entrano nelle bolle ──────────────────────────────────
// Da 03eb233 le bolle sono SEI (griglia a nido d'ape su 3 righe), non più
// cinque: app.js::renderStats taglia topGenres a slice(0, 6). Con più di sei
// generi in libreria i meno frequenti restano fuori — l'unico modo di
// accorgersi di una regressione qui è una fixture con più generi del posto
// disponibile.
const SEVEN_GENRES = [
  "Drama",
  "Thriller",
  "Commedia",
  "Azione",
  "Horror",
  "Fantascienza",
  "Western",
];
// Conteggi decrescenti (7, 6, 5, 4, 3, 2, 1 titoli): nessuna parità, quindi
// l'ordine è deterministico e il genere tagliato fuori è sempre il Western.
const MANY_GENRE_SEEN = SEVEN_GENRES.flatMap((genre, gi) =>
  Array.from({ length: SEVEN_GENRES.length - gi }, (_, i) =>
    fakeItem(961000 + gi * 100 + i, "movie", `${genre} ${i + 1}`, genre, "8")
  )
);

test.describe("CineTracker — Statistiche — sei generi al massimo", () => {
  test("con sette generi in libreria le bolle restano sei, tagliando il meno frequente", async ({
    page,
  }) => {
    await mockJson(page, /rest\/v1\/Coltel/, MANY_GENRE_SEEN.map((data) => ({ list: "seen", data })));
    await gotoFresh(page);
    await openScreen(page, "stats");
    await page.locator(S.genreBarsGenreBubble).first().waitFor({ state: "visible", timeout: 10_000 });

    const bubbles = page.locator(S.genreBarsGenreBubble);
    await expect(bubbles).toHaveCount(6);
    await expect(bubbles.nth(0).locator(S.genreBubbleTextName)).toHaveText("DRAMA");
    await expect(bubbles.nth(5).locator(S.genreBubbleTextName)).toHaveText("FANTASCIENZA");
    await expect(page.locator("#genreBars")).not.toContainText("WESTERN");

    // Stesso taglio nella vista Barre: sono gli stessi topGenres disegnati
    // in due modi (renderGenreView in app.js), non due calcoli diversi.
    await page.locator(S.genreViewToggleGenreViewBtnBars).click();
    await expect(page.locator(S.genreBarsBarRow)).toHaveCount(6);
    await expect(page.locator("#genreBars")).not.toContainText("Western");
  });
});
