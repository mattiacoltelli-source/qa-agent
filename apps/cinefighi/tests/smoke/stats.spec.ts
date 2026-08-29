import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import { QA_USER, fakeTitle, selectExistingUser, setStatsMode } from "../../fixtures/cinefighi-page.ts";

// Verifica lo schermo Statistiche: card numeriche, media voto per genere
// (★, aggiunta di recente) e podio/classifica, sia in modalità "Io"
// (default — invertito da "Gruppo": prima era l'opposto) che "Gruppo" — le
// due usano formule diverse (average() su tutti i voti vs. il solo voto
// dell'utente corrente, vedi app.js::renderStats).
// Sola lettura: libreria interamente mockata (nessuna scrittura reale su
// Supabase), unico modo di conoscere con certezza medie e ordine attesi —
// impossibile da garantire sulla libreria condivisa vera.
//
// "Curiosità" (chi ha votato di più, coppie di gusto, estremi del gruppo)
// non vive più qui: si è spostata nel tab Gruppo dello schermo Report — vedi
// report.spec.ts.

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
  test('modalità "Io" (default): card, media voto per genere e classifica sui soli voti dell\'utente', async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);

    // myVoted = Film A (voto mio 8) + Film B (voto mio 6): Film C esclusa,
    // io non l'ho mai votata — stessi numeri già verificati sotto per il
    // click esplicito su "Io", ma qui SENZA toccare il toggle: è il default.
    await expect(page.locator("#statSeen")).toHaveText("2");
    await expect(page.locator("#statMovies")).toHaveText("2");

    const bars = page.locator("#genreBars .bar-row");
    await expect(bars).toHaveCount(1);
    await expect(bars.nth(0).locator(".bar-row__name")).toHaveText("Thriller");
    await expect(bars.nth(0).locator(".bar-row__vote")).toHaveText("★ 7,0");

    await expect(page.locator("#statsIoGruppoToggle .stats-toggle-btn[data-mode=\"me\"]")).toHaveClass(/active/);
    await expect(page.locator("#statsIoGruppoToggle .stats-toggle-btn[data-mode=\"group\"]")).not.toHaveClass(/active/);
  });

  test("modalità Gruppo (esplicita): card, media voto per genere e classifica su tutti i voti", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);
    await setStatsMode(page, "group");

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
    //
    // Ordine di DISEGNO del podio (ui.js::podiumOrder, introdotto insieme a
    // "Curiosità"): 2°-1°-3°, il 1° al centro con .podium-card--first (lo
    // stesso linguaggio riusato per i podi di Curiosità più sotto in
    // pagina) — quindi il 1° in classifica (Film C) è alla POSIZIONE 1 nel
    // DOM, non alla 0.
    await expect(page.locator("#rankingCountBadge")).toHaveText("3");
    const podium = page.locator("#rankingPodium .podium-card");
    await expect(podium).toHaveCount(3);
    await expect(podium.nth(0).locator(".podium-card__title")).toHaveText("Film A QA");
    await expect(podium.nth(1).locator(".podium-card__title")).toHaveText("Film C QA");
    await expect(podium.nth(1).locator(".podium-card__vote")).toHaveText("★ 9.0");
    await expect(podium.nth(1)).toHaveClass(/podium-card--first/);
    await expect(podium.nth(2).locator(".podium-card__title")).toHaveText("Film B QA");
    await expect(page.locator("#rankingList .rank-row")).toHaveCount(0);
  });

  test('modalità "Io" dopo un giro andata-ritorno da Gruppo: generi e classifica solo sui titoli che ho votato io', async ({ page }) => {
    await gotoFreshWithMockedLibrary(page);
    // init() (app.js) fa più giri di reloadLibrary() ravvicinati (uno al
    // boot, uno dopo la selezione utente): ognuno richiama renderStats()
    // nella modalità corrente al momento della chiamata — se uno di questi
    // arriva DOPO un click sul toggle invece che prima, è l'ultimo a
    // scrivere sui contatori animati e lascia a video il valore sbagliato
    // (osservato in CI, non un'ipotesi: gli stessi contatori restavano
    // fermi al valore precedente anche con animateValue corretto, mentre
    // generi/classifica — non animati — mostravano già il valore giusto).
    // Aspettiamo che la rete si calmi PRIMA di toccare il toggle, così il
    // click è garantito essere l'ultimo a ridisegnare. "Io" è ormai il
    // default (vedi test sopra): per esercitare davvero il render-race del
    // toggle passiamo prima da "Gruppo" e poi torniamo — la stessa
    // transizione, solo in direzione opposta rispetto a quando questo test
    // fu scritto.
    await page.waitForLoadState("networkidle");
    await setStatsMode(page, "group");
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

    // Con solo 2 titoli non c'è un 3° posto: podiumOrder produce solo
    // [2°, 1°] (nessuno slot vuoto per il 3°) — il 1° (Film A) resta
    // comunque il secondo nel DOM, con .podium-card--first.
    await expect(page.locator("#rankingCountBadge")).toHaveText("2");
    const podium = page.locator("#rankingPodium .podium-card");
    await expect(podium).toHaveCount(2);
    await expect(podium.nth(0).locator(".podium-card__title")).toHaveText("Film B QA");
    await expect(podium.nth(1).locator(".podium-card__title")).toHaveText("Film A QA");
    await expect(podium.nth(1).locator(".podium-card__vote")).toHaveText("★ 8.0");
    await expect(podium.nth(1)).toHaveClass(/podium-card--first/);
  });
});

// ─── CLASSIFICA: "Mostra tutti" / "Mostra meno" ──────────────────────────
// Un solo votante (QA_USER): media di gruppo e voto personale coincidono,
// quindi lo stesso ordine vale sia in "Gruppo" che in "Io" — utile qui
// proprio per verificare che il tasto si comporti allo stesso modo in
// entrambe le modalità, senza dover costruire due fixture.
//
// Un solo tasto per entrambe le direzioni (non due): resta nel DOM, cambia
// testo/freccia/conteggio. Espandendo scende in fondo alla lista (dov'è
// sempre stato, la lista cresce sopra di lui); riducendo la vista torna a
// #classificaSection — verificato controllando che lo scroll diminuisca
// dopo il click, non serve un valore esatto.

const EXPAND_TITLES = Array.from({ length: 7 }, (_, i) =>
  fakeTitle(932000 + i + 1, `Expand Film ${i + 1}`, "Thriller")
);
const EXPAND_VOTES = EXPAND_TITLES.map((t, i) => ({ title_id: t.id, user_name: QA_USER, vote: 9 - i }));

test.describe("CineFighi — Statistiche — Classifica, tasto Mostra tutti/meno", () => {
  test("mostra podio + 2 di default, espande e riduce al tocco, in Gruppo e in Io", async ({ page }) => {
    await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
    await mockJson(page, /rest\/v1\/titles/, EXPAND_TITLES);
    await mockJson(page, /rest\/v1\/votes/, EXPAND_VOTES);
    await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

    await page.goto(".");
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
    await page.locator('.nav__btn[data-screen="stats"]').click();
    await page.locator("#rankingPodium .podium-card").first().waitFor({ state: "visible", timeout: 10_000 });

    // 7 titoli votati: podio (3) + 2 righe di default = 5, altri 2 dietro
    // al tasto.
    await expect(page.locator("#rankingCountBadge")).toHaveText("7");
    await expect(page.locator("#rankingPodium .podium-card")).toHaveCount(3);
    await expect(page.locator("#rankingList .rank-row")).toHaveCount(2);
    const expandBtn = page.locator("#rankingExpandBtn");
    const label = expandBtn.locator(".rank-expand-btn__label");
    await expect(expandBtn).toBeVisible();
    await expect(label).toHaveText("Mostra tutti");
    await expect(expandBtn.locator(".rank-expand-btn__count")).toHaveText("· 2");
    await expect(expandBtn).not.toHaveClass(/is-up/);

    // Espandi: il tasto resta (non sparisce), cambia testo/freccia.
    await expandBtn.click();
    await expect(page.locator("#rankingList .rank-row")).toHaveCount(4);
    await expect(expandBtn).toBeVisible();
    await expect(label).toHaveText("Mostra meno");
    await expect(expandBtn.locator(".rank-expand-btn__count")).toBeHidden();
    await expect(expandBtn).toHaveClass(/is-up/);

    // Riduci: torna a 2 righe, testo/freccia tornano com'erano, e la vista
    // risale (il tasto, in fondo alla lista espansa, non è più dove si è
    // cliccato: se non fosse risalita lo scroll resterebbe fermo laggiù).
    await page.mouse.wheel(0, 400);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await expandBtn.click();
    await expect(page.locator("#rankingList .rank-row")).toHaveCount(2);
    await expect(label).toHaveText("Mostra tutti");
    await expect(expandBtn.locator(".rank-expand-btn__count")).toHaveText("· 2");
    await expect(expandBtn).not.toHaveClass(/is-up/);
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 5_000 })
      .toBeLessThan(scrollBefore || 1);

    // In "Io" lo stesso comportamento: un nuovo render riparte collassato
    // (non resta espanso da prima), stesso tasto, stesso conteggio — unico
    // votante, quindi stesso ordine di "Gruppo".
    await setStatsMode(page, "me");
    await expect(page.locator("#rankingList .rank-row")).toHaveCount(2);
    await expect(expandBtn).toBeVisible();
    await expect(label).toHaveText("Mostra tutti");
    await expect(expandBtn.locator(".rank-expand-btn__count")).toHaveText("· 2");

    await expandBtn.click();
    await expect(page.locator("#rankingList .rank-row")).toHaveCount(4);
    await expect(label).toHaveText("Mostra meno");
  });
});

// ─── CLASSIFICA: torna al film aperto dopo il dettaglio ──────────────────
// Riusa la stessa fixture EXPAND_TITLES/EXPAND_VOTES di sopra (7 titoli:
// podio 3 + 2 righe di default + 2 "dietro" al tasto Mostra tutti) per
// coprire sia il caso "il film era già visibile" sia "il film era nella
// parte da espandere" con un solo fixture.

test.describe("CineFighi — Statistiche — Classifica, torna al film dopo il dettaglio", () => {
  test("un film già visibile resta in vista dopo il dettaglio", async ({ page }) => {
    await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
    await mockJson(page, /rest\/v1\/titles/, EXPAND_TITLES);
    await mockJson(page, /rest\/v1\/votes/, EXPAND_VOTES);
    await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

    await page.goto(".");
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
    await page.locator('.nav__btn[data-screen="stats"]').click();
    await page.locator("#rankingPodium .podium-card").first().waitFor({ state: "visible", timeout: 10_000 });

    // Film C QA (2° in classifica, media 8) è nel podio — sempre visibile,
    // nessuna espansione necessaria.
    const podiumCard = page.locator('#rankingPodium .podium-card[data-id]').first();
    const id = await podiumCard.getAttribute("data-id");
    await podiumCard.click();
    await page.locator("#screen-detail:not(.hidden)").waitFor({ state: "visible", timeout: 10_000 });

    await page.goBack();
    await page.locator("#screen-stats:not(.hidden)").waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator(`#screen-stats [data-id="${id}"].open-detail`)).toBeInViewport();
  });

  test("un film oltre le prime 5 righe: la lista si riespande da sola e ci si torna sopra", async ({ page }) => {
    await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
    await mockJson(page, /rest\/v1\/titles/, EXPAND_TITLES);
    await mockJson(page, /rest\/v1\/votes/, EXPAND_VOTES);
    await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

    await page.goto(".");
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
    await page.locator('.nav__btn[data-screen="stats"]').click();
    await page.locator("#rankingPodium .podium-card").first().waitFor({ state: "visible", timeout: 10_000 });

    // Espande, apre l'ultimo film (7°, dietro al tasto "Mostra tutti" nel
    // render iniziale) e torna indietro.
    await page.locator("#rankingExpandBtn").click();
    const deepCard = page.locator("#rankingList .rank-row").last();
    const deepId = await deepCard.getAttribute("data-id");
    await deepCard.click();
    await page.locator("#screen-detail:not(.hidden)").waitFor({ state: "visible", timeout: 10_000 });

    await page.goBack();
    await page.locator("#screen-stats:not(.hidden)").waitFor({ state: "visible", timeout: 10_000 });

    // La Classifica riparte SEMPRE collassata dopo un render (vedi test
    // sopra) — qui deve essersi riespansa da sola per far riapparire la
    // card, altrimenti non esisterebbe nemmeno nel DOM. Il tasto resta
    // visibile (non sparisce mai con questa fixture, restano 2 righe
    // dietro anche da espanso) ma deve riflettere lo stato espanso.
    const expandBtn = page.locator("#rankingExpandBtn");
    await expect(expandBtn).toBeVisible();
    await expect(expandBtn.locator(".rank-expand-btn__label")).toHaveText("Mostra meno");
    await expect(expandBtn).toHaveClass(/is-up/);
    await expect(page.locator("#rankingList .rank-row")).toHaveCount(4);
    await expect(page.locator(`#screen-stats [data-id="${deepId}"].open-detail`)).toBeInViewport();
  });
});
