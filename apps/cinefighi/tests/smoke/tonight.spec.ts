import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import {
  QA_USER,
  MIN_VOTED_FOR_GROUP_TONIGHT,
  ensureQaUserSelected,
  openScreen,
  selectExistingUser,
  toggleTonightPeoplePanel,
  toggleTonightPerson,
  tonightPeopleRow,
} from "../../fixtures/cinefighi-page.ts";

// "Stasera" legge lo storico voti REALE su Supabase, che persiste tra una
// run e l'altra (i test @write puliscono i titoli che aggiungono, ma non
// c'è garanzia assoluta che lo storico voti sia sempre vuoto). I test su
// dati veri verificano quindi che l'app gestisca bene TUTTI gli stati
// possibili, invece di assumerne uno — restano a sola lettura.
//
// Da ddd93e3 lo schermo non è più solo "cosa guardo io": c'è la modalità di
// gruppo ("chi c'è"), con un selettore di persone e un algoritmo diverso da
// quello solitario. La parte deterministica di quella modalità è coperta più
// sotto con libreria e TMDB mockati, l'unico modo di conoscere in anticipo
// quante persone sono invitabili e quanti consigli devono uscire.
test.describe("CineFighi — Stasera cosa guardo (TMDB discover live)", () => {
  test.beforeEach(async ({ page }) => {
    await ensureQaUserSelected(page);
    await openScreen(page, "tonight");
  });

  test("il pulsante consigli produce sempre un esito valido, mai un errore silenzioso o un caricamento infinito", async ({ page }) => {
    await page.locator("#tonightBtn").click();
    const result = page.locator("#tonightResult");
    // Il testo di caricamento reale (app.js) è "🔍 Sto cercando 6 titoli
    // adatti…" — stesso fix del file gemello in CineTracker
    // (tonight.spec.ts), dove la stringa sbagliata ha causato un
    // fallimento reale in CI (hintVisible letto a metà del re-render).
    await expect(result).not.toContainText("Sto cercando", { timeout: 15_000 });

    const hint = result.locator(".tonight__hint");
    const cards = result.locator(".poster-card");
    const hintVisible = await hint.isVisible().catch(() => false);
    const cardCount = await cards.count();

    if (hintVisible) {
      // Profilo senza voti a sufficienza: deve invitare a votare, non
      // mostrare card vuote.
      expect(cardCount).toBe(0);
    } else {
      // Profilo con voti: 6 consigli, non più 5 — il pulsante stesso dice
      // "Dammi 6 consigli" e l'algoritmo solitario è 4 slot ad alta
      // affinità + 2 fuori dai generi soliti (a4de81f), quello di gruppo 3
      // fasce temporali × 1/2/3 titoli. Un tetto a 5 qui era il bug più
      // banale possibile: passava in verde su un profilo vuoto e falliva
      // solo sui profili veri.
      expect(cardCount).toBeGreaterThan(0);
      expect(cardCount).toBeLessThanOrEqual(6);
      await expect(cards.first().locator(".tonight-card__affinity")).toBeVisible();
    }
  });

  test("il selettore \"chi c'è\" parte da te solo, e dice cosa serve per invitare gli altri", async ({
    page,
  }) => {
    // Stato iniziale, con qualunque storico voti: sei solo tu, il titolo è
    // al singolare e il pannello è chiuso.
    await expect(page.locator("#tonightTitle")).toHaveText("Stasera cosa guardo?");
    await expect(page.locator("#tonightPeopleNames")).toHaveText("Tu");
    await expect(page.locator("#tonightPeopleStack .avatar")).toHaveCount(1);
    await expect(page.locator("#tonightPeoplePanel")).toBeHidden();

    await toggleTonightPeoplePanel(page);
    await expect(page.locator("#tonightPeoplePanel")).toBeVisible();

    // Una riga per ogni membro del gruppo, la propria sempre attiva e non
    // disattivabile (sei sempre incluso).
    const rows = page.locator("#tonightPeoplePanel .tonight-people-row");
    expect(await rows.count()).toBeGreaterThan(0);
    await expect(tonightPeopleRow(page, QA_USER)).toHaveClass(/active/);
    await expect(tonightPeopleRow(page, QA_USER)).not.toBeDisabled();

    // Con pochi voti (lo stato normale di QA_USER sui dati veri) la nota
    // spiega la soglia e TUTTE le altre righe sono disabilitate; con
    // abbastanza voti la nota sparisce. Entrambi gli esiti sono corretti:
    // dipende dallo storico voti reale, non dal codice.
    const note = page.locator("#tonightPeopleNote");
    // Escludere la propria riga va fatto con :not() sull'ATTRIBUTO della
    // riga stessa: `filter({ hasNot })` cerca un DISCENDENTE che matcha, e
    // qui data-user sta sul <button> della riga, non dentro — quindi non
    // escludeva nulla e il ciclo qui sotto finiva per pretendere disabled
    // anche sulla riga di QA_USER, che è sempre attiva (sei sempre incluso).
    const others = page.locator(
      `#tonightPeoplePanel .tonight-people-row:not([data-user="${QA_USER}"])`
    );
    if (await note.isVisible()) {
      await expect(note).toContainText(`almeno ${MIN_VOTED_FOR_GROUP_TONIGHT} titoli votati`);
      const otherCount = await others.count();
      for (let i = 0; i < otherCount; i++) {
        await expect(others.nth(i)).toBeDisabled();
      }
    } else {
      await expect(note).toBeHidden();
    }
  });
});

// ─── MODALITÀ DI GRUPPO, CON DATI MOCKATI ───────────────────────────────────
// Sola lettura come tutto il resto (nessuna scrittura su Supabase), ma con
// libreria e voti mockati: la soglia per invitare altri è
// MIN_VOTED_FOR_GROUP_TONIGHT titoli votati A TESTA, impossibile da
// garantire sui dati reali del gruppo — e senza raggiungerla la modalità di
// gruppo non si può esercitare affatto.

const OTHER_USER = "Un Amico";
const UNDER_THRESHOLD_USER = "Poco Votante";

/** Libreria finta abbastanza grande da superare la soglia di gruppo: metà
 * Thriller, metà Crime (due generi, così i "generi del gruppo" esistono ma
 * non ci sono abbastanza generi per gli slot "per variare" — quelli
 * richiedono un 4°-6° genere preferito, vedi rankedGroupGenres). */
const GROUP_TITLES = Array.from({ length: MIN_VOTED_FOR_GROUP_TONIGHT }, (_, i) => ({
  id: 970001 + i,
  tmdb_id: 970001 + i,
  media_type: "movie",
  title: `Gruppo Film ${i + 1}`,
  year: String(2015 + (i % 5)),
  poster_path: "",
  backdrop_path: "",
  overview: "",
  genre_names: [i % 2 === 0 ? "Thriller" : "Crime"],
  director: "",
  status: "seen",
  added_by: OTHER_USER,
  created_at: new Date().toISOString(),
}));

// Entrambi votano tutto: due profili sopra soglia, quindi invitabili a
// vicenda. "Poco Votante" vota un solo titolo: resta sotto soglia e serve a
// verificare il gate dal lato dell'invitato.
const GROUP_VOTES = [
  ...GROUP_TITLES.map((t) => ({ title_id: t.id, user_name: QA_USER, vote: 8 })),
  ...GROUP_TITLES.map((t) => ({ title_id: t.id, user_name: OTHER_USER, vote: 7 })),
  { title_id: GROUP_TITLES[0].id, user_name: UNDER_THRESHOLD_USER, vote: 9 },
];

/** Pool TMDB finto per "Dammi 6 consigli": ids ben lontani da quelli della
 * libreria mockata (che in gruppo viene esclusa solo oltre il tetto di
 * "già visto", vedi seenCapForGroupSize), vote_average sopra la soglia
 * qualità del gruppo (6.5 per i non-horror, passesGroupQualityBar) e
 * vote_count sopra il minimo di tmdbFetchDiscoverLevel (20). Anni diversi:
 * i 6 consigli finali vengono ordinati per anno crescente. */
const TMDB_POOL = Array.from({ length: 12 }, (_, i) => ({
  id: 880001 + i,
  title: `Consiglio TMDB ${i + 1}`,
  poster_path: `/poster${i}.jpg`,
  backdrop_path: "",
  overview: "Trama di prova.",
  vote_average: 7.8,
  vote_count: 900,
  genre_ids: [i % 2 === 0 ? 53 : 80],
  release_date: `${2003 + i * 2}-05-01`,
}));

async function gotoFreshWithMockedGroup(
  page: import("@playwright/test").Page,
  users: string[]
): Promise<void> {
  await mockJson(page, /rest\/v1\/users/, users.map((name) => ({ name })));
  await mockJson(page, /rest\/v1\/titles/, GROUP_TITLES);
  await mockJson(page, /rest\/v1\/votes/, GROUP_VOTES);
  await mockJson(page, /rest\/v1\/watchlist_adds/, []);
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  // TMDB: le ricerche per persona (regista) e i discover per cast tornano
  // vuoti, così i 6 consigli restano quelli delle 3 fasce temporali —
  // gli slot "regista in comune" (3bfcb29) e "cast stellare" (97dfb0e)
  // sostituirebbero 1-3 card con titoli scelti da un pool diverso, e
  // renderebbero il conteggio per fascia non verificabile.
  // Attenzione all'ORDINE: Playwright valuta le route dalla più recente
  // alla più vecchia, quindi il pattern generico va registrato PRIMA di
  // quelli specifici che devono vincere su di lui.
  await mockJson(page, /api\.themoviedb\.org\/3\/discover\//, { results: TMDB_POOL });
  await mockJson(page, /api\.themoviedb\.org\/3\/discover\/[a-z]+\?.*with_cast=/, { results: [] });
  await mockJson(page, /api\.themoviedb\.org\/3\/search\/person/, { results: [] });

  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
  const picked = await selectExistingUser(page, QA_USER);
  if (!picked) throw new Error(`"${QA_USER}" non trovato nella lista utenti mockata`);
  await openScreen(page, "tonight");
  await page.locator("#tonightPeopleStack .avatar").first().waitFor({ state: "visible" });
}

test.describe("CineFighi — Stasera, modalità di gruppo (libreria mockata)", () => {
  test("invitare una persona cambia il titolo al plurale e dichiara su chi si basano i consigli", async ({
    page,
  }) => {
    await gotoFreshWithMockedGroup(page, [QA_USER, OTHER_USER]);

    await expect(page.locator("#tonightTitle")).toHaveText("Stasera cosa guardo?");
    await expect(page.locator("#tonightIntro")).toHaveText("Consigli basati sui tuoi voti.");
    // Sopra soglia: nessuna nota di gate.
    await expect(page.locator("#tonightPeopleNote")).toBeHidden();

    await toggleTonightPeoplePanel(page);
    await expect(tonightPeopleRow(page, OTHER_USER)).not.toBeDisabled();
    await toggleTonightPerson(page, OTHER_USER);

    // "guardiamo", non "guardo": il titolo segue chi c'è (13bb3c8).
    await expect(page.locator("#tonightTitle")).toHaveText("Stasera cosa guardiamo?");
    await expect(page.locator("#tonightIntro")).toHaveText(
      "Consigli basati sui gusti di 2 persone."
    );
    await expect(page.locator("#tonightPeopleNames")).toHaveText(`Tu, ${OTHER_USER}`);
    await expect(page.locator("#tonightPeopleStack .avatar")).toHaveCount(2);
    // Trasparenza (a1cff6e): la nota dice quanti voti ha ciascuno, così si
    // capisce su che base sono calcolati i consigli.
    await expect(page.locator("#tonightPeopleNote")).toHaveText(
      `Consigli basati sui gusti di: ${QA_USER} (${MIN_VOTED_FOR_GROUP_TONIGHT} voti), ${OTHER_USER} (${MIN_VOTED_FOR_GROUP_TONIGHT} voti).`
    );
    // Cambiare i presenti invalida i consigli mostrati: tornano all'invito
    // iniziale invece di restare quelli di un'altra composizione.
    await expect(page.locator("#tonightResult .tonight__hint")).toHaveText(
      "Premi un pulsante per ricevere un consiglio."
    );

    // E si torna indietro: togliendo la persona il titolo ritorna singolare.
    await toggleTonightPerson(page, OTHER_USER);
    await expect(page.locator("#tonightTitle")).toHaveText("Stasera cosa guardo?");
    await expect(page.locator("#tonightPeopleNames")).toHaveText("Tu");
  });

  test("chi non ha votato abbastanza non è invitabile, e il suo conteggio è in chiaro", async ({
    page,
  }) => {
    await gotoFreshWithMockedGroup(page, [QA_USER, OTHER_USER, UNDER_THRESHOLD_USER]);
    await toggleTonightPeoplePanel(page);

    const row = tonightPeopleRow(page, UNDER_THRESHOLD_USER);
    await expect(row).toBeDisabled();
    // Il conteggio "1/50" compare solo per chi è sotto soglia: è la
    // spiegazione del perché la riga è spenta, senza doverla indovinare.
    await expect(row.locator(".votes")).toHaveText(`1/${MIN_VOTED_FOR_GROUP_TONIGHT}`);
    await expect(tonightPeopleRow(page, OTHER_USER).locator(".votes")).toHaveCount(0);

    // Un click su una riga disabilitata non deve cambiare nulla.
    await row.click({ force: true });
    await expect(page.locator("#tonightTitle")).toHaveText("Stasera cosa guardo?");
    await expect(page.locator("#tonightPeopleNames")).toHaveText("Tu");
  });

  test("\"Dammi 6 consigli\" in gruppo: 6 card, con affinità e voto previsto per ciascun presente", async ({
    page,
  }) => {
    await gotoFreshWithMockedGroup(page, [QA_USER, OTHER_USER]);
    await toggleTonightPeoplePanel(page);
    await toggleTonightPerson(page, OTHER_USER);
    await toggleTonightPeoplePanel(page);

    await page.locator("#tonightBtn").click();
    const result = page.locator("#tonightResult");
    await expect(result).not.toContainText("Sto cercando", { timeout: 15_000 });

    // 3 fasce temporali fisse × 1/2/3 titoli (dfd034a): esattamente 6 con
    // un pool abbastanza ampio come quello mockato qui.
    const cards = result.locator(".poster-card");
    await expect(cards).toHaveCount(6);

    for (let i = 0; i < 6; i++) {
      const card = cards.nth(i);
      // Affinità di gruppo = MINIMO tra i presenti, non media: un titolo
      // che piace a uno e non all'altro non è un buon consiglio comune.
      await expect(card.locator(".tonight-card__affinity")).toHaveText(/^\d+%$/);
      await expect(card.locator(".tonight-card__reason")).toBeVisible();
      // Il breakdown per persona esiste SOLO in gruppo (a1cff6e): il voto
      // previsto per ciascuno, dai profili non normalizzati.
      const breakdown = card.locator(".tonight-card__breakdown");
      await expect(breakdown).toContainText(QA_USER);
      await expect(breakdown).toContainText(OTHER_USER);
      await expect(breakdown).toHaveText(/\d+%.+\d+%/);
    }

    // Ordinate per anno crescente (finalSix in app.js), non per punteggio:
    // è la forma con cui vengono presentate al gruppo.
    const years = await cards
      .locator(".poster-card__meta")
      .evaluateAll((els) => els.map((el) => Number((el.textContent ?? "").slice(0, 4))));
    expect(years).toEqual([...years].sort((a, b) => a - b));

    // Nessun duplicato tra i 6 (usedKeys in app.js).
    const titles = await cards
      .locator(".poster-card__title")
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));
    expect(new Set(titles).size).toBe(6);
  });
});
