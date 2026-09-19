// Helper specifici per la UI di CineFighi (selettori presi dal DOM reale
// dell'app: index.html + app.js). Non condivisi con le altre app: se la UI
// di CineFighi cambia, si tocca solo questo file.

import type { Page } from "@playwright/test";
import { clearBrowserStorage } from "../../../core/storage.ts";
import { S } from "./selectors.ts";

/** Nome dell'utente di test dedicato a questa suite. addUser() lato app è
 * idempotente (case-insensitive: se il nome esiste già nel gruppo, non lo
 * duplica — lo riusa), quindi è sicuro richiamarlo ad ogni run. */
export const QA_USER = "_QA_Agent_";

/** Fabbrica di titoli finti per le fixture mockate di Statistiche/Report —
 * condivisa tra i due file di test (prima duplicata solo in stats.spec.ts,
 * quando "Curiosità" viveva lì; ora che quel contenuto si è spostato nel tab
 * Gruppo di Report, entrambi i file ne hanno bisogno). */
export function fakeTitle(id: number, title: string, genre: string) {
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

/** Naviga sull'app partendo da uno stato di dispositivo pulito. Il reload
 * dopo il clear serve perché app.js legge currentUser/cache da localStorage
 * solo al boot: senza reload vedrebbe ancora lo stato letto al primo load. */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload();
  await page
    .locator("#splash")
    .waitFor({ state: "hidden", timeout: 5_000 })
    .catch(() => {
      /* lo splash sparisce da solo dopo ~850ms; se il selettore cambia non
       * vogliamo che sia questo a far fallire i test che seguono */
    });
}

/** La ricerca può restituire titoli GIÀ nella libreria condivisa del gruppo:
 * quella card mostra il tag "poster-card__tag" ("✓ Già in libreria...") al
 * posto dei bottoni Watchlist/Visto (vedi CineFighi/ui.js renderSearchResults).
 * Prendere sempre `.first()` rischia di beccare proprio quella e bloccarsi in
 * timeout aspettando un `button[data-status]` che nel DOM non esiste — è
 * quello che è successo cercando "Inception", già aggiunto da un membro vero
 * del gruppo. Restituisce la prima card SENZA quel tag, cioè aggiungibile. */
export function firstAddableSearchCard(page: Page) {
  return page
    .locator(S.resultsPosterCard)
    .filter({ hasNot: page.locator(S.posterCardTag) })
    .first();
}

/** Come firstAddableSearchCard, ma più stretta: garantisce un titolo NON
 * ancora in libreria in nessuna forma (né mio, né in watchlist di
 * qualcun altro). Serve dove firstAddableSearchCard non basta — il bottone
 * ".open-preview" ("Scheda →") compare solo quando `!lib` in
 * renderSearchResults (CineFighi/ui.js), cioè MAI per una card
 * "canJoinWatchlist" (già in watchlist di un altro membro, niente tag ma
 * niente Scheda neanche: solo "♡ Anche a me"/"✓ Visto" — vedi ui.js). Una
 * card così passerebbe comunque il filtro hasNot(.poster-card__tag) di
 * firstAddableSearchCard, quindi affidarsi solo a quella per aprire la
 * scheda di consultazione rischierebbe un timeout su ".open-preview" mai
 * apparso, su un titolo reale già in watchlist di un amico. */
export function firstPreviewableSearchCard(page: Page) {
  return page
    .locator(S.resultsPosterCard)
    .filter({ has: page.locator(S.openPreview) })
    .first();
}

export async function selectExistingUser(page: Page, name: string): Promise<boolean> {
  const btn = page.locator(`.user-pick-btn[data-user="${name}"]`);
  if ((await btn.count()) === 0) return false;
  await btn.first().click();
  return true;
}

/** Garantisce che QA_USER sia selezionato come utente corrente, aggiungendolo
 * al gruppo se non esiste ancora. Se il gruppo è già al completo (15/15) e
 * QA_USER non ne fa parte, i test non hanno modo di procedere: fallisce con
 * un messaggio esplicito invece di un timeout muto. */
export async function ensureQaUserSelected(page: Page): Promise<void> {
  await gotoFresh(page);
  const overlay = page.locator(S.userPickerOverlay);
  if (await overlay.isVisible()) {
    const picked = await selectExistingUser(page, QA_USER);
    if (!picked) {
      const addRowVisible = await page.locator("#userPickerAddRow").isVisible();
      if (!addRowVisible) {
        throw new Error(
          `Gruppo CineFighi al completo (15/15) e "${QA_USER}" non è tra i membri: ` +
            `aggiungilo manualmente una volta dall'app prima di far girare questi test.`
        );
      }
      await page.locator("#userPickerInput").fill(QA_USER);
      await page.locator("#userPickerAddBtn").click();
    }
  }
  await page.locator(S.app).waitFor({ state: "visible" });
}

export async function openScreen(
  page: Page,
  screen: "home" | "stats" | "tonight" | "report"
): Promise<void> {
  await page.locator(`.nav__btn[data-screen="${screen}"]`).click();
}

/** Compila #searchInput e lancia la ricerca. Da fix 45a67f8: non c'è più
 * ricerca live al variare del testo, serve un click su #searchBtn (o Invio,
 * gestito a parte da app.js sullo stesso handler doSearch) — un .fill() da
 * solo non innesca più nulla. */
export async function search(page: Page, query: string): Promise<void> {
  await page.locator(S.searchInput).fill(query);
  await page.locator(S.searchBtn).click();
}

/** I tre toggle Io/Gruppo (watchlist in Home, Statistiche, Report) hanno
 * cambiato vestito con fc3a5c2/8d70923/25e57bd: erano
 * `.stats-toggle-btn`, ora sono `.io-gruppo-btn` dentro una pillola
 * `.io-gruppo-toggle` con slider animato (`.io-gruppo-toggle__thumb`).
 * Gli id dei tre contenitori e l'attributo data-mode non sono cambiati, e
 * il bottone attivo porta ancora la classe `active` (vedi renderHome/
 * renderStats/renderReport in app.js) — cambia solo il nome della classe
 * del bottone, quindi un selettore sbagliato qui si manifesta come timeout
 * su ogni test che tocca un toggle, non come un'asserzione fallita. */
const IO_GRUPPO_BTN = ".io-gruppo-btn";

/** Cambia il filtro Mia/Gruppo della watchlist in Home (d114b13). Di default
 * è "me" ("Io"): mostra solo i titoli aggiunti dall'utente corrente. */
export async function setWatchlistMode(page: Page, mode: "me" | "group"): Promise<void> {
  await page.locator(`#watchlistModeToggle ${IO_GRUPPO_BTN}[data-mode="${mode}"]`).click();
}

/** Cambia il filtro Io/Gruppo delle Statistiche — di default "me" ("Io"):
 * card numeriche, generi e classifica calcolati sui soli voti dell'utente
 * corrente (invertito da "group": prima il default era l'opposto). Toggle
 * indipendente da quello della watchlist in Home (stessa classe CSS
 * .io-gruppo-btn, id diverso). */
export async function setStatsMode(page: Page, mode: "me" | "group"): Promise<void> {
  await page.locator(`#statsIoGruppoToggle ${IO_GRUPPO_BTN}[data-mode="${mode}"]`).click();
}

/** Cambia il filtro Io/Gruppo del tab Report — di default "io": il report
 * personale scritto da Claude (#reportBody, gate/tasto Aggiorna). "gruppo"
 * mostra invece #groupReportBody (profilo del gruppo, chi siete uno per
 * uno, chi ha votato di più, coppie di gusto, estremi) — calcolato lato
 * client da cine-core.js, con testo opzionale scritto da Claude sopra se
 * è mai stato generato un group_report (altrimenti resta il fallback
 * templato, sempre disponibile). Nessun tasto "Aggiorna" per "gruppo": si
 * aggiorna da solo — ma non con la stessa cadenza del personale ("io" è
 * annuale, vedi nextReportDate in ui.js). Il gruppo si aggiorna a date fisse
 * di calendario — 1° gennaio, 1° maggio, 1° settembre alle 8:00 italiane —
 * via cron reale su Supabase (migrazione 005_group_report_cron_4_months,
 * nextGroupReportDate in ui.js, testo in #groupReportMetaLine; prima era
 * ogni lunedì) — o con 7 tap rapidi su #reportTitleTap
 * (vedi tapReportTitleSevenTimes sotto) per forzarlo prima. */
export async function setReportMode(page: Page, mode: "io" | "gruppo"): Promise<void> {
  await page.locator(`#reportIoGruppoToggle ${IO_GRUPPO_BTN}[data-mode="${mode}"]`).click();
}

/** Simula il gesto nascosto dei 7 tap rapidi su #reportTitleTap che apre la
 * conferma per forzare una rigenerazione del report (Io o Gruppo, a seconda
 * del tab aperto al momento) — vedi app.js::bindGlobalEvents. Il conteggio
 * si azzera da solo dopo 4s di inattività (era 2,5s fino a 7a3e2bc): i click
 * qui sono deliberatamente ravvicinati (nessun delay tra l'uno e l'altro)
 * per restare dentro quella finestra anche su una macchina CI lenta. */
export async function tapReportTitleSevenTimes(page: Page): Promise<void> {
  const title = page.locator(S.reportTitleTap);
  for (let i = 0; i < 7; i++) {
    await title.click();
  }
}

/** Cambia la vista dei "Generi più votati" in Statistiche: "bars" (default
 * su storage pulito, vedi getGenreView in storage.js — al contrario di
 * CineTracker, che di default apre su "bubbles") o "bubbles" (bolle, dal
 * 7a3e2bc: stessa disposizione a 6 di Cos90, colori di CineFighi). La
 * preferenza è per-dispositivo e persiste in localStorage. */
export async function setGenreView(page: Page, view: "bars" | "bubbles"): Promise<void> {
  await page.locator(`#genreViewToggle .genre-view-btn[data-genre-view="${view}"]`).click();
}

/** Cambia il pannello Film/Serie TV della Classifica. Da 48a2886 questo
 * toggle usa la stessa pillola dei generi (.genre-view-btn, non più una
 * classe propria), ma resta un contenitore distinto (#rankingMediaToggle)
 * con data-media al posto di data-genre-view. */
export async function setRankingMedia(page: Page, media: "movie" | "tv"): Promise<void> {
  await page.locator(`#rankingMediaToggle .genre-view-btn[data-media="${media}"]`).click();
}

// ─── STASERA: MODALITÀ DI GRUPPO ("chi c'è") ────────────────────────────────
// Da ddd93e3 lo schermo Stasera non è più solo "cosa guardo io": si scelgono
// le persone presenti (stack di avatar + pannello, proposta 1 di 2d96e5f) e
// i consigli diventano quelli buoni per TUTTI i coinvolti (affinità = minimo
// tra i presenti, non media). Invitare altri richiede che sia l'utente
// corrente SIA l'invitato abbiano almeno MIN_VOTED_FOR_GROUP_TONIGHT titoli
// votati: sotto quella soglia le righe del pannello restano disabilitate.

/** Soglia di titoli votati per la modalità di gruppo — in app.js è
 * MIN_VOTED_FOR_GROUP_TONIGHT = MIN_VOTED_FOR_REPORT (50). Un profilo con
 * pochi voti non può invitare nessuno, ed è lo stato normale di QA_USER sui
 * dati reali: i test sulla UI di gruppo con dati veri devono accettarlo. */
export const MIN_VOTED_FOR_GROUP_TONIGHT = 50;

/** Apre/chiude il pannello "chi c'è" col tasto matita accanto agli avatar. */
export async function toggleTonightPeoplePanel(page: Page): Promise<void> {
  await page.locator("#tonightPeopleEditBtn").click();
}

/** Riga di una persona nel pannello "chi c'è". La propria riga è sempre
 * attiva e non si può togliere; le altre sono `disabled` finché la soglia
 * di voti non è raggiunta da entrambi. */
export function tonightPeopleRow(page: Page, name: string) {
  return page.locator(`#tonightPeoplePanel .tonight-people-row[data-user="${name}"]`);
}

/** Aggiunge/toglie una persona dalla serata (il pannello deve essere già
 * aperto: la riga non esiste in un pannello chiuso — è `hidden`). */
export async function toggleTonightPerson(page: Page, name: string): Promise<void> {
  await tonightPeopleRow(page, name).click();
}
