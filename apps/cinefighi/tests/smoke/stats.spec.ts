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

// ─── CURIOSITÀ ────────────────────────────────────────────────────────────
// Fixture separata: le tre metriche (cine-core.js::votingLeaderboard/
// mostAffinePair/mostDivisive) hanno soglie minime (5 titoli in comune per
// la coppia, 3 voti per un titolo "divisivo") che la fixture di sopra non
// raggiunge apposta — qui invece sono costruite per superarle di poco, in
// modo deterministico.
//
// QA_USER e Amico1 votano gli stessi 5 titoli (T1-T5) con un distacco
// costante di 0.5 punti, PIÙ entrambi T6 (scarto 1.0, serve a renderlo
// "divisivo" — vedi sotto): 6 titoli in comune in totale, scarto medio
// 0,58. È l'unica coppia che arriva a 5+ titoli in comune, quindi è per
// forza quella "più affine". Amico2 vota solo T6: T6 è l'UNICO titolo con
// 3+ voti (QA_USER, Amico1, Amico2), quindi l'unico che può finire tra i
// "più divisivi". Un settimo titolo (T7), votato solo da QA_USER, serve
// solo a rompere il pareggio 6-6 in classifica voti tra QA_USER e Amico1
// (7 vs 6 vs 1 — nessuna parità, nessun ordine ambiguo).

const CURIOSITA_TITLES = [
  fakeTitle(931001, "Curio T1", "Thriller"),
  fakeTitle(931002, "Curio T2", "Thriller"),
  fakeTitle(931003, "Curio T3", "Thriller"),
  fakeTitle(931004, "Curio T4", "Thriller"),
  fakeTitle(931005, "Curio T5", "Thriller"),
  fakeTitle(931006, "Curio T6 Divisivo", "Thriller"),
  fakeTitle(931007, "Curio T7", "Thriller")
];

const CURIOSITA_VOTES = [
  { title_id: 931001, user_name: QA_USER, vote: 7 },
  { title_id: 931001, user_name: "Amico1", vote: 7.5 },
  { title_id: 931002, user_name: QA_USER, vote: 7.5 },
  { title_id: 931002, user_name: "Amico1", vote: 7 },
  { title_id: 931003, user_name: QA_USER, vote: 8 },
  { title_id: 931003, user_name: "Amico1", vote: 8.5 },
  { title_id: 931004, user_name: QA_USER, vote: 6.5 },
  { title_id: 931004, user_name: "Amico1", vote: 7 },
  { title_id: 931005, user_name: QA_USER, vote: 7 },
  { title_id: 931005, user_name: "Amico1", vote: 6.5 },
  { title_id: 931006, user_name: QA_USER, vote: 9 },
  { title_id: 931006, user_name: "Amico1", vote: 8 },
  { title_id: 931006, user_name: "Amico2", vote: 2 },
  { title_id: 931007, user_name: QA_USER, vote: 6 }
];

test.describe("CineFighi — Statistiche — Curiosità", () => {
  test("podio voti, coppia affine e film divisivo, solo in modalità Gruppo", async ({ page }) => {
    await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }, { name: "Amico1" }, { name: "Amico2" }]);
    await mockJson(page, /rest\/v1\/titles/, CURIOSITA_TITLES);
    await mockJson(page, /rest\/v1\/votes/, CURIOSITA_VOTES);
    await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

    await page.goto(".");
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
    await page.locator('.nav__btn[data-screen="stats"]').click();
    await page.locator("#curiositaVoting .podium-card").first().waitFor({ state: "visible", timeout: 10_000 });

    await expect(page.locator("#curiositaSection")).toBeVisible();

    // Chi ha votato di più: QA_USER 7, Amico1 6, Amico2 1 — nessun pareggio.
    // Ordine di disegno 2°-1°-3° (vedi ui.js::podiumOrder): Amico1, QA_USER
    // (al centro, evidenziato), Amico2.
    const votingPodium = page.locator("#curiositaVoting .podium-card");
    await expect(votingPodium).toHaveCount(3);
    await expect(votingPodium.nth(0).locator(".podium-card__title")).toHaveText("Amico1");
    await expect(votingPodium.nth(0).locator(".podium-card__vote")).toHaveText("6 voti");
    await expect(votingPodium.nth(1).locator(".podium-card__title")).toHaveText(QA_USER);
    await expect(votingPodium.nth(1).locator(".podium-card__vote")).toHaveText("7 voti");
    await expect(votingPodium.nth(1)).toHaveClass(/podium-card--first/);
    await expect(votingPodium.nth(2).locator(".podium-card__title")).toHaveText("Amico2");
    await expect(votingPodium.nth(2).locator(".podium-card__vote")).toHaveText("1 voti");

    // Coppia più affine: QA_USER e Amico1 votano ENTRAMBI anche T6 (serve
    // per renderlo "divisivo" più sotto), quindi condividono 6 titoli, non
    // solo i 5 pensati apposta per l'affinità — scarto 0.5 su T1-T5 e 1.0
    // su T6: media (0.5×5 + 1.0) / 6 = 0,58. Amico2 non arriva a 5 titoli
    // in comune con nessuno (1 solo, T6), quindi resta l'unica coppia
    // possibile comunque.
    const pair = page.locator("#curiositaPair .affinity-callout");
    await expect(pair).toBeVisible();
    await expect(pair.locator(".affinity-callout__names")).toHaveText(`${QA_USER} & Amico1`);
    await expect(pair.locator(".affinity-callout__detail")).toContainText("0,58 punti");
    await expect(pair.locator(".affinity-callout__detail")).toContainText("6 titoli");

    // Film più divisivi: T6 è l'unico titolo con almeno 3 voti (9, 8, 2),
    // quindi l'unica card mostrata — nessun 2°/3° posto disponibile.
    const divisivePodium = page.locator("#curiositaDivisive .podium-card");
    await expect(divisivePodium).toHaveCount(1);
    await expect(divisivePodium.nth(0).locator(".podium-card__title")).toHaveText("Curio T6 Divisivo");
    await expect(divisivePodium.nth(0)).toHaveClass(/podium-card--first/);

    // Tap sull'unica card divisiva -> apre il dettaglio del titolo giusto
    // (stesso meccanismo open-detail della Classifica).
    await divisivePodium.first().click();
    await page.locator("#screen-detail:not(.hidden)").waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator("#detailTitle")).toHaveText("Curio T6 Divisivo");
    await page.locator("#detailBackBtn").click();
    await page.locator('.nav__btn[data-screen="stats"]').click();

    // In modalità "Io", Curiosità non ha senso individuale e sparisce.
    await setStatsMode(page, "me");
    await expect(page.locator("#curiositaSection")).toBeHidden();

    // Tornando a "Gruppo" riappare, correttamente ripopolata.
    await setStatsMode(page, "group");
    await expect(page.locator("#curiositaSection")).toBeVisible();
    await expect(page.locator("#curiositaVoting .podium-card")).toHaveCount(3);
  });
});
