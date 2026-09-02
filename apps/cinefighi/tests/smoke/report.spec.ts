import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import {
  QA_USER,
  fakeTitle,
  selectExistingUser,
  ensureQaUserSelected,
  openScreen,
  setReportMode,
  tapReportTitleSevenTimes,
} from "../../fixtures/cinefighi-page.ts";

// Tab Report — due sotto-schede, Io (default) e Gruppo:
// - Io: analisi AI personale (dcd2ce1), sola lettura — non tocchiamo mai
//   #reportRefreshBtn, che invoca la funzione Supabase "generate-report"
//   (una vera chiamata a Claude, a pagamento, e scrive su user_report per
//   l'utente corrente — vedi storage.js).
// - Gruppo (spostato qui da Statistiche → Curiosità, vedi stats.spec.ts):
//   profilo del gruppo, chi siete uno per uno, chi ha votato di più, coppie
//   di gusto, estremi — calcolati lato client da cine-core.js. Il testo
//   narrativo (profilo/chi siete) può venire da Claude se esiste già un
//   group_report salvato, altrimenti resta il fallback templato — sempre
//   disponibile, MAI una chiamata a Claude solo per aprire il tab. Nessun
//   tasto "Aggiorna" per il Gruppo: si rigenera da solo una volta all'anno,
//   o subito col gesto nascosto dei 7 tap su #reportTitleTap.
test.describe("CineFighi — tab Report — Io (sola lettura)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
  });

  test("aprire il tab Report mostra il gate o il report, mai uno stato ambiguo — Io è il tab di default", async ({ page }) => {
    await openScreen(page, "report");
    await expect(page.locator("#screen-report")).toBeVisible();

    await expect(page.locator('#reportIoGruppoToggle .stats-toggle-btn[data-mode="io"]')).toHaveClass(/active/);
    await expect(page.locator('#reportIoGruppoToggle .stats-toggle-btn[data-mode="gruppo"]')).not.toHaveClass(/active/);
    await expect(page.locator("#groupReportBody")).toBeHidden();

    const gate = page.locator("#reportGate");
    const body = page.locator("#reportBody");
    // renderReport() (app.js) è async (attende Supabase prima di chiamare
    // renderReportScreen()): un .evaluate() secco subito dopo il click su
    // "Report" può leggere il markup statico pre-render, dove nessuno dei
    // due ha ancora la classe "hidden" applicata correttamente — da qui il
    // poll, che ritenta finché lo stato non si stabilizza (o va in timeout
    // se l'invariante è davvero violata).
    await expect
      .poll(
        async () => {
          const gateHidden = await gate.evaluate((el) => el.classList.contains("hidden"));
          const bodyHidden = await body.evaluate((el) => el.classList.contains("hidden"));
          return gateHidden !== bodyHidden;
        },
        { timeout: 10_000 }
      )
      .toBe(true);
  });
});

// ─── GRUPPO: fallback templato, nessun group_report mai generato ─────────
// Stessa fixture/aritmetica già verificata in stats.spec.ts quando questo
// contenuto si chiamava "Curiosità" (cine-core.js::votingLeaderboard/
// mostAffinePair/mostDivisive non sono cambiate) — solo selettori e schermo
// diversi: prima #curiositaSection dentro Statistiche, ora #groupReportBody
// dentro Report, dietro al toggle Gruppo (non più il default).

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

async function gotoFreshWithMockedLibrary(
  page: import("@playwright/test").Page,
  users: string[],
  titles: unknown[],
  votes: unknown[]
): Promise<void> {
  await mockJson(page, /rest\/v1\/users/, users.map((name) => ({ name })));
  await mockJson(page, /rest\/v1\/titles/, titles);
  await mockJson(page, /rest\/v1\/votes/, votes);
  // Il Report non dipende dallo scoping Io/Gruppo della watchlist
  // (d235f7a): basta un mock vuoto perché fetchLibrary() non fallisca.
  await mockJson(page, /rest\/v1\/watchlist_adds/, []);
  // Nessun group_report mai generato: 404/array vuoto, così renderGroupReport
  // usa il fallback templato client-side, mai il testo scritto da Claude.
  await mockJson(page, /rest\/v1\/group_report/, []);
  // renderReport() (app.js) attende ANCHE loadLatestReport() (report
  // personale) prima di disegnare il Gruppo, indipendentemente da quale
  // sotto-tab è aperto — senza questo mock è una vera richiesta di rete a
  // Supabase mai intercettata, che in questo sandbox impiega più dei 30s di
  // timeout del test a fallire (net::ERR_CONNECTION_RESET lento, non
  // immediato): il podio non compare mai in tempo, non per un bug reale.
  await mockJson(page, /rest\/v1\/user_report/, []);
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
  const picked = await selectExistingUser(page, QA_USER);
  if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
  await openScreen(page, "report");
  await setReportMode(page, "gruppo");
  await page.locator("#groupReportVoting .podium-card").first().waitFor({ state: "visible", timeout: 10_000 });
}

test.describe("CineFighi — tab Report — Gruppo", () => {
  test("podio voti, coppia affine e film divisivo, dietro al toggle Gruppo", async ({ page }) => {
    // Più passi di una verifica media (setup mockato + apertura dettaglio +
    // ritorno + doppio giro di toggle): il timeout di default di 30s basta
    // a malapena anche in un ambiente scarico — su questa macchina, con
    // l'avvio di Chromium già sopra i 27s da solo, sfora per pochi secondi.
    test.setTimeout(45_000);
    await gotoFreshWithMockedLibrary(page, [QA_USER, "Amico1", "Amico2"], CURIOSITA_TITLES, CURIOSITA_VOTES);

    await expect(page.locator("#groupReportBody")).toBeVisible();
    await expect(page.locator("#groupReportRefreshBtn")).toHaveCount(0);

    // Chi ha votato di più: QA_USER 7, Amico1 6, Amico2 1 — nessun pareggio.
    // Ordine di disegno 2°-1°-3° (vedi ui.js::podiumOrder): Amico1, QA_USER
    // (al centro, evidenziato), Amico2.
    const votingPodium = page.locator("#groupReportVoting .podium-card");
    await expect(votingPodium).toHaveCount(3);
    await expect(votingPodium.nth(0).locator(".podium-card__title")).toHaveText("Amico1");
    await expect(votingPodium.nth(0).locator(".podium-card__vote")).toHaveText("6 voti");
    await expect(votingPodium.nth(1).locator(".podium-card__title")).toHaveText(QA_USER);
    await expect(votingPodium.nth(1).locator(".podium-card__vote")).toHaveText("7 voti");
    await expect(votingPodium.nth(1)).toHaveClass(/podium-card--first/);
    await expect(votingPodium.nth(2).locator(".podium-card__title")).toHaveText("Amico2");
    await expect(votingPodium.nth(2).locator(".podium-card__vote")).toHaveText("1 voti");

    // Le coppie di gusto: stessa aritmetica di sempre (0,58 punti su 6
    // titoli in comune, unica coppia sopra la soglia minShared).
    const pairCallouts = page.locator("#groupReportPair .affinity-callout");
    await expect(pairCallouts).toHaveCount(2);
    await expect(page.locator("#groupReportPair .curiosita-stack__label").nth(0)).toHaveText("Più affini");
    await expect(page.locator("#groupReportPair .curiosita-stack__label").nth(1)).toHaveText("Più litigiose");
    for (const callout of await pairCallouts.all()) {
      await expect(callout.locator(".affinity-callout__names")).toHaveText(`${QA_USER} & Amico1`);
      await expect(callout.locator(".affinity-callout__detail")).toContainText("0,58 punti");
      await expect(callout.locator(".affinity-callout__detail")).toContainText("6 titoli");
    }

    // Gli estremi del gruppo: T6 è l'unico titolo con almeno 3 voti (9, 8,
    // 2), quindi l'unica card sia tra i "Più divisivi" sia tra i "Più
    // unanimi". Entrambi i podi sono impilati e sempre visibili insieme.
    const divisivePodium = page.locator("#groupReportDivisive .podium-card");
    const unanimousPodium = page.locator("#groupReportUnanimous .podium-card");
    await expect(page.locator("#groupReportDivisive")).toBeVisible();
    await expect(page.locator("#groupReportUnanimous")).toBeVisible();
    await expect(divisivePodium).toHaveCount(1);
    await expect(divisivePodium.nth(0).locator(".podium-card__title")).toHaveText("Curio T6 Divisivo");
    await expect(divisivePodium.nth(0)).toHaveClass(/podium-card--first/);
    await expect(unanimousPodium).toHaveCount(1);
    await expect(unanimousPodium.nth(0).locator(".podium-card__title")).toHaveText("Curio T6 Divisivo");

    // Tap sull'unica card divisiva -> apre il dettaglio del titolo giusto.
    await divisivePodium.first().click();
    await page.locator("#screen-detail:not(.hidden)").waitFor({ state: "visible", timeout: 10_000 });
    await expect(page.locator("#detailTitle")).toHaveText("Curio T6 Divisivo");
    await page.locator("#detailBackBtn").click();
    await openScreen(page, "report");

    // Tornando su "Io" il Gruppo sparisce; tornando su "Gruppo" riappare,
    // ricalcolato al volo (nessuna cache da invalidare, sempre dal vivo).
    await setReportMode(page, "io");
    await expect(page.locator("#groupReportBody")).toBeHidden();
    await setReportMode(page, "gruppo");
    await expect(page.locator("#groupReportBody")).toBeVisible();
    await expect(page.locator("#groupReportVoting .podium-card")).toHaveCount(3);
  });

  // Fixture dedicata: sopra, un solo candidato-coppia rende "più affine" e
  // "più litigiosa" per forza uguali (caso limite già coperto). Qui invece
  // 3 utenti votano GLI STESSI 5 titoli con scarti diversi per coppia, così
  // mostAffinePair (minimo) e mostDivergentPair (massimo) devono restituire
  // DUE coppie DIVERSE — la verifica vera che il "rovescio" funzioni.
  const PAIR_TITLES = Array.from({ length: 5 }, (_, i) => fakeTitle(934000 + i + 1, `Coppia T${i + 1}`, "Thriller"));
  const PAIR_VOTES = PAIR_TITLES.flatMap((t, i) => [
    { title_id: t.id, user_name: QA_USER, vote: 5 },
    // scarto costante di 0,5 da QA_USER -> coppia più affine
    { title_id: t.id, user_name: "Amico1", vote: i % 2 === 0 ? 5.5 : 4.5 },
    // scarto costante di 3 da QA_USER (e ~2,9 da Amico1) -> coppia più litigiosa
    { title_id: t.id, user_name: "Amico2", vote: 8 },
  ]);

  test("coppia più affine e più litigiosa sono due coppie diverse quando ce n'è più di una", async ({ page }) => {
    await gotoFreshWithMockedLibrary(page, [QA_USER, "Amico1", "Amico2"], PAIR_TITLES, PAIR_VOTES);

    const pairCallouts = page.locator("#groupReportPair .affinity-callout");
    await expect(pairCallouts).toHaveCount(2);
    await expect(pairCallouts.nth(0).locator(".affinity-callout__names")).toHaveText(`${QA_USER} & Amico1`);
    await expect(pairCallouts.nth(0).locator(".affinity-callout__detail")).toContainText("0,50 punti");
    await expect(pairCallouts.nth(1).locator(".affinity-callout__names")).toHaveText(`${QA_USER} & Amico2`);
    await expect(pairCallouts.nth(1).locator(".affinity-callout__detail")).toContainText("3,00 punti");
  });
});

// ─── GRUPPO: testo scritto da Claude, quando un group_report esiste già ──
// A differenza del blocco sopra, qui mockiamo /rest/v1/group_report con un
// payload reale (stessa forma salvata dalla Edge Function
// generate-group-report) per verificare il percorso "scritto da Claude":
// badge visibile, blurb lunga con clamp a 4 righe + "Leggi tutto"/"Mostra
// meno" (ui.js::userCardHtml, needsClamp oltre 200 caratteri).

// 50 voti, non 1: da 6b4e1f2 "Chi siete" mostra una card solo per chi
// raggiunge MIN_VOTED_FOR_REPORT (50) — con un solo voto QA_USER non
// entrerebbe più nella griglia e la card da testare non renderizzerebbe.
const CLAMP_TITLES = Array.from({ length: 50 }, (_, i) => fakeTitle(935001 + i, `Clamp T${i + 1}`, "Thriller"));
const CLAMP_VOTES = CLAMP_TITLES.map((t) => ({ title_id: t.id, user_name: QA_USER, vote: 8 }));
const LONG_BLURB =
  "Con 8 voti di media molto alta, " + QA_USER +
  " si conferma un osservatore attento del genere Thriller, capace di premiare con costanza i titoli " +
  "più elaborati e di riconoscere il lavoro di regia anche nei casi meno scontati, restando comunque " +
  "un votante estremamente selettivo quando la sceneggiatura non regge fino alla fine.";

test.describe("CineFighi — tab Report — Gruppo — testo scritto da Claude", () => {
  test('paragrafo lungo parte chiuso a 4 righe, "Leggi tutto"/"Mostra meno" lo espande e richiude', async ({ page }) => {
    await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
    await mockJson(page, /rest\/v1\/titles/, CLAMP_TITLES);
    await mockJson(page, /rest\/v1\/votes/, CLAMP_VOTES);
    await mockJson(page, /rest\/v1\/watchlist_adds/, []);
    // Vedi commento in gotoFreshWithMockedLibrary sopra: senza questo mock
    // renderReport() resta appeso sulla vera rete per il report personale.
    await mockJson(page, /rest\/v1\/user_report/, []);
    await mockJson(page, /rest\/v1\/group_report/, [
      {
        generated_at: new Date().toISOString(),
        payload: {
          group_profile: ["Il gruppo ha un solo membro attivo in questa fixture di prova."],
          members: [{ user: QA_USER, blurb: LONG_BLURB }],
        },
      },
    ]);
    await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

    await page.goto(".");
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
    await openScreen(page, "report");
    await setReportMode(page, "gruppo");
    await page.locator("#groupReportMembers .user-card").first().waitFor({ state: "visible", timeout: 10_000 });

    // Badge "scritto da Claude" sui due titoli di sezione, non presente
    // quando resta il fallback templato (vedi blocco sopra).
    await expect(page.locator("#groupReportProfileTitle .by")).toHaveText("scritto da Claude");
    await expect(page.locator("#groupReportMembersTitle .by")).toHaveText("scritto da Claude");

    const wrap = page.locator("#groupReportMembers .user-card__fact-wrap");
    const expandBtn = wrap.locator(".user-card__expand");
    await expect(wrap).toHaveClass(/is-clamped/);
    await expect(expandBtn.locator(".user-card__expand-label")).toHaveText("Leggi tutto");

    await expandBtn.click();
    await expect(wrap).not.toHaveClass(/is-clamped/);
    await expect(wrap).toHaveClass(/is-open/);
    await expect(expandBtn.locator(".user-card__expand-label")).toHaveText("Mostra meno");
    await expect(page.locator("#groupReportMembers .user-card__fact")).toContainText("selettivo quando la sceneggiatura");

    await expandBtn.click();
    await expect(wrap).toHaveClass(/is-clamped/);
    await expect(expandBtn.locator(".user-card__expand-label")).toHaveText("Leggi tutto");
  });
});

// ─── GRUPPO: soglia minima di 50 voti per "Chi siete, uno per uno" ───────
// cine-core.js::groupMemberProfiles(db, users, { minVotes }) filtra alla
// fine, dopo l'assegnazione delle etichette "costante"/"polarizzato": chi
// non raggiunge MIN_VOTED_FOR_REPORT (50, stessa soglia del report
// personale) sparisce sia dalla griglia di card sia dal grafico a barre
// sopra (ui.js::renderGroupReport — leggono lo stesso array), non solo
// dalla card. Niente placeholder "vota ancora N titoli": chi è sotto
// soglia non compare affatto.

const THRESHOLD_TITLES = Array.from({ length: 50 }, (_, i) => fakeTitle(937001 + i, `Soglia T${i + 1}`, "Thriller"));
// QA_USER vota tutti e 50 (supera la soglia), Amico1 solo i primi 3 degli
// stessi titoli (sotto soglia), Amico2 nessuno.
const THRESHOLD_VOTES_QA = THRESHOLD_TITLES.map((t) => ({ title_id: t.id, user_name: QA_USER, vote: 7 }));
const THRESHOLD_VOTES_AMICO1 = THRESHOLD_TITLES.slice(0, 3).map((t) => ({ title_id: t.id, user_name: "Amico1", vote: 6 }));

test.describe('CineFighi — tab Report — Gruppo — soglia 50 voti per "Chi siete"', () => {
  test('solo chi ha almeno 50 voti entra nella griglia "Chi siete" e nel grafico a barre', async ({ page }) => {
    test.setTimeout(45_000);
    await gotoFreshWithMockedLibrary(
      page,
      [QA_USER, "Amico1", "Amico2"],
      THRESHOLD_TITLES,
      [...THRESHOLD_VOTES_QA, ...THRESHOLD_VOTES_AMICO1]
    );

    // Grafico a barre (dentro #groupReportProfile, sopra le card): una sola
    // riga, quella di QA_USER — Amico1 (3 voti) e Amico2 (0 voti) non ci sono.
    const bars = page.locator("#groupReportProfile .bar-row");
    await expect(bars).toHaveCount(1);
    await expect(bars.first().locator(".bar-row__name")).toContainText(QA_USER);

    // Card "Chi siete": una sola, quella di QA_USER — niente card striminzita
    // per Amico1 né "Ancora nessun voto" per Amico2.
    const cards = page.locator("#groupReportMembers .user-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first().locator(".user-card__name")).toContainText(QA_USER);
  });

  test("se nessuno supera i 50 voti, compare il messaggio di fallback invece della griglia", async ({ page }) => {
    test.setTimeout(45_000);
    await gotoFreshWithMockedLibrary(
      page,
      [QA_USER, "Amico1"],
      THRESHOLD_TITLES.slice(0, 5),
      THRESHOLD_VOTES_AMICO1
    );

    await expect(page.locator("#groupReportMembers .user-card")).toHaveCount(0);
    await expect(page.locator("#groupReportMembers .empty-hint")).toHaveText(
      "Nessuno ha ancora votato abbastanza titoli per un profilo personale."
    );
  });
});

// ─── GRUPPO: mini-grafico "Generi preferiti" dentro ogni user-card ───────
// cine-core.js::groupMemberProfiles ora calcola anche topGenres (fino a 3,
// min. 3 voti per genere — stessa soglia di topGenre), e ui.js::userCardHtml
// lo disegna con genreChartHtml SENZA toccare il testo sopra (templato o
// scritto da Claude, invariato): puramente additivo.
const GENRE_TITLES = [
  ...Array.from({ length: 20 }, (_, i) => fakeTitle(939001 + i, `Fanta T${i + 1}`, "Fantascienza")),
  ...Array.from({ length: 20 }, (_, i) => fakeTitle(939101 + i, `Horror T${i + 1}`, "Horror")),
  ...Array.from({ length: 10 }, (_, i) => fakeTitle(939201 + i, `Commedia T${i + 1}`, "Commedia")),
];
const GENRE_VOTES = [
  ...GENRE_TITLES.slice(0, 20).map((t) => ({ title_id: t.id, user_name: QA_USER, vote: 9 })),
  ...GENRE_TITLES.slice(20, 40).map((t) => ({ title_id: t.id, user_name: QA_USER, vote: 7 })),
  ...GENRE_TITLES.slice(40, 50).map((t) => ({ title_id: t.id, user_name: QA_USER, vote: 5 })),
];

test.describe("CineFighi — tab Report — Gruppo — mini-grafico Generi preferiti", () => {
  test("mostra fino a 3 generi per card, ordinati per media voto decrescente", async ({ page }) => {
    test.setTimeout(45_000);
    await gotoFreshWithMockedLibrary(page, [QA_USER], GENRE_TITLES, GENRE_VOTES);

    const card = page.locator("#groupReportMembers .user-card").first();
    await expect(card.locator(".genre-block__label")).toHaveText("Generi preferiti");

    const rows = card.locator(".mini-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator(".mini-row__name")).toHaveText("Fantascienza");
    await expect(rows.nth(0).locator(".mini-row__vote")).toHaveText("9,00");
    await expect(rows.nth(1).locator(".mini-row__name")).toHaveText("Horror");
    await expect(rows.nth(1).locator(".mini-row__vote")).toHaveText("7,00");
    await expect(rows.nth(2).locator(".mini-row__name")).toHaveText("Commedia");
    await expect(rows.nth(2).locator(".mini-row__vote")).toHaveText("5,00");

    // Il testo sopra (fallback templato, nessun group_report qui) resta
    // quello di sempre — il grafico è un'aggiunta, non una sostituzione.
    await expect(card.locator(".user-card__fact")).toContainText("Il genere che ama di più è");
  });
});

// ─── Gesto nascosto: 7 tap su #reportTitleTap forzano una rigenerazione ──
// Sola lettura anche qui: verifichiamo solo che il gesto apra la conferma
// col testo giusto per il tab attivo, e che "Annulla" la chiuda SENZA
// invocare handleReportRefresh/handleGroupReportRefresh (quindi senza
// nessuna vera chiamata a Claude) — mai testare il tasto "Conferma" contro
// dati reali, stessa regola di #reportRefreshBtn in cima a questo file.
// Dati mockati (non serve libreria vera: il gesto è puramente UI, non
// dipende dal contenuto del report) — vedi il commento sul mock di
// user_report in gotoFreshWithMockedLibrary più sopra, stesso motivo.

test.describe("CineFighi — tab Report — gesto nascosto 7 tap", () => {
  test.beforeEach(async ({ page }) => {
    await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }]);
    await mockJson(page, /rest\/v1\/titles/, CLAMP_TITLES);
    await mockJson(page, /rest\/v1\/votes/, CLAMP_VOTES);
    await mockJson(page, /rest\/v1\/watchlist_adds/, []);
    await mockJson(page, /rest\/v1\/user_report/, []);
    await mockJson(page, /rest\/v1\/group_report/, []);
    await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

    await page.goto(".");
    await clearBrowserStorage(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
    await page.locator("#app").waitFor({ state: "visible" });
  });

  test("7 tap su Io aprono la conferma per il report personale; Annulla non genera nulla", async ({ page }) => {
    await openScreen(page, "report");
    await expect(page.locator('#reportIoGruppoToggle .stats-toggle-btn[data-mode="io"]')).toHaveClass(/active/);

    await tapReportTitleSevenTimes(page);
    await expect(page.locator("#confirmOverlay")).toBeVisible();
    await expect(page.locator("#confirmText")).toContainText("report personale");
    await expect(page.locator("#confirmYesBtn")).toHaveText("Rigenera");
    await expect(page.locator("#confirmYesBtn")).not.toHaveClass(/btn--danger/);

    await page.locator("#confirmNoBtn").click();
    await expect(page.locator("#confirmOverlay")).toBeHidden();
  });

  test("7 tap su Gruppo aprono la conferma per il report di gruppo; Annulla non genera nulla", async ({ page }) => {
    await openScreen(page, "report");
    await setReportMode(page, "gruppo");

    await tapReportTitleSevenTimes(page);
    await expect(page.locator("#confirmOverlay")).toBeVisible();
    await expect(page.locator("#confirmText")).toContainText("report di gruppo");

    await page.locator("#confirmNoBtn").click();
    await expect(page.locator("#confirmOverlay")).toBeHidden();
  });

  test("meno di 7 tap, o troppo lenti, non aprono nulla", async ({ page }) => {
    // Contiene una pausa reale di 2,8s (sotto) per verificare il reset del
    // conteggio: sommata al setup mockato, sfora i 30s di default su questa
    // macchina già di per sé lenta ad avviare Chromium.
    test.setTimeout(45_000);
    await openScreen(page, "report");
    const title = page.locator("#reportTitleTap");
    for (let i = 0; i < 6; i++) await title.click();
    await expect(page.locator("#confirmOverlay")).toBeHidden();

    // Il conteggio si azzera da solo dopo 2,5s di inattività: un 7° tap
    // arrivato dopo la pausa non deve far scattare nulla.
    await page.waitForTimeout(2_800);
    await title.click();
    await expect(page.locator("#confirmOverlay")).toBeHidden();
  });
});
