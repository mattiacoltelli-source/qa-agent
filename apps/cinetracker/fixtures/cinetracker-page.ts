// Helper specifici per la UI di CineTracker (selettori presi dal DOM reale
// dell'app: index.html + app.js/ui.js). CineTracker è single-user (nessuno
// user picker) e ha un formato voto testuale speciale ("7", "7,5", "7+",
// "8-"), diverso dallo slider 0-10 di CineFighi — non condividere questi
// helper con l'altra app anche quando sembrano simili.

import type { Page, Locator } from "@playwright/test";
import { clearBrowserStorage } from "../../../core/storage.ts";
import { S } from "./selectors.ts";

/** Naviga sull'app partendo da uno stato di dispositivo pulito. */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload();
  await page.locator(S.screenHome).waitFor({ state: "visible", timeout: 10_000 });
  // #screen-home è visibile nel markup statico ancora prima che bootApp()
  // finisca: bindEvents() (che aggancia i listener su #searchBtn e sui
  // bottoni della nav) gira solo dopo l'await loadDB() (round-trip a
  // Supabase). Un'interazione immediata come .click() — a differenza di un
  // expect che ritenta — può quindi arrivare prima che il listener sia
  // agganciato e non fare nulla. app.js aggiunge la classe "app--ready" a
  // ".app" nel finally di bootApp(), subito dopo bindEvents(): è il segnale
  // affidabile che l'hydration è completa.
  await page.locator(S.appReady).waitFor({ state: "attached", timeout: 10_000 });
}

export async function openScreen(
  page: Page,
  screen: "home" | "stats" | "tonight" | "report"
): Promise<void> {
  await page.locator(`.nav__btn[data-screen="${screen}"]`).click();
}

/** Apre #screen-backup tramite il gesto nascosto (7 tap entro 500ms,
 * ovunque nella pagina — vedi lo script "ACCESSO NASCOSTO AL BACKUP" in
 * index.html). Da 52c529c "Backup" non ha più un bottone in nav: il tab è
 * stato sostituito da "Report". Il bottone Home attivo è un bersaglio
 * sicuro per i tap ripetuti — è già la schermata corrente, quindi i click
 * in più sono no-op per app.js. */
export async function openBackupViaSecretGesture(page: Page): Promise<void> {
  const homeBtn = page.locator(S.navBtnScreenHome);
  for (let i = 0; i < 7; i++) {
    await homeBtn.click();
  }
  await page.locator("#screen-backup").waitFor({ state: "visible", timeout: 5_000 });
}

export async function search(page: Page, query: string): Promise<void> {
  await page.locator(S.searchInput).fill(query);
  await page.locator(S.searchBtn).click();
}

/** Il primo risultato di ricerca potrebbe essere già in libreria (per
 * CineTracker: la libreria REALE dell'utente, non un dataset di prova —
 * "Inception" può benissimo essere già stato votato in passato): in quel
 * caso la card non ha .action-seen/.action-watch, solo un tag "Già in
 * libreria" (vedi ui.js::renderSearchResults), e un click sull'azione
 * resterebbe in attesa per sempre. */
export function firstAddableSearchCard(page: Page): Locator {
  return page
    .locator(S.resultsPosterCard)
    .filter({ hasNot: page.locator(S.posterCardTag) })
    .first();
}

export async function addSearchResultAs(
  card: Locator,
  action: "seen" | "watch"
): Promise<void> {
  await card.locator(`.action-${action}`).click();
}

/** Rimuove il titolo attualmente aperto nel dettaglio. #detailRemoveBtn NON
 * innesca un confirm() nativo del browser (verificato sul sorgente: askConfirm()
 * in app.js apre una modale in-page, #confirmOverlay, con conferma esplicita
 * su #confirmYesBtn) — serve un secondo click, non basta gestire un evento
 * "dialog" che qui non arriva mai. */
export async function removeCurrentDetail(page: Page): Promise<void> {
  await page.locator(S.detailRemoveBtn).click();
  await page.locator(S.confirmYesBtn).click();
}

// ─── Libreria finta ──────────────────────────────────────────────────────
// CineTracker e' "local-first": storage.js::loadDB legge subito la cache in
// localStorage e sincronizza Supabase in background. Seedando la cache e
// bloccando Supabase si controlla con precisione la libreria mostrata senza
// mai toccare l'archivio personale reale ne' dipendere dalla rete.
//
// Il blocco di Supabase qui NON e' un dettaglio di comodo, e' la sicurezza:
// la cache seedata contiene titoli finti, e _pushToSupabase() fa mirror sync
// (cancella da remoto le righe assenti in `db`). Se una scrittura passasse
// davvero, cancellerebbe la libreria vera. Per questo blockSupabase()
// intercetta OGNI metodo e restituisce una guardia che il test usa per
// verificare, alla fine, che nemmeno una richiesta sia arrivata a
// destinazione: un route che per qualunque motivo non avesse agganciato si
// vedrebbe lì invece di passare in silenzio.

export const FAKE_DB_CACHE_KEY = "cineTrackerDBCache";

export type FakeItem = {
  id: number;
  media_type: "movie" | "tv";
  title: string;
  vote?: string;
  comment?: string;
};

/** La chiave con cui l'app identifica un titolo nelle liste
 * (ui.js: data-key="${media_type}_${id}"). */
export function fakeKey(item: FakeItem): string {
  return `${item.media_type}_${item.id}`;
}

/** Un item di libreria finto, con gli id fuori scala (9xxxxx) gia' usati
 * dagli altri test mockati: non collidono con nessun id TMDB reale. */
export function fakeItem(item: FakeItem) {
  return {
    id: item.id,
    tmdb_id: item.id,
    media_type: item.media_type,
    title: item.title,
    year: "2024",
    poster_path: "",
    backdrop_path: "",
    overview: "Trama finta per i test.",
    genre_names: ["Drama"],
    director: "",
    vote: item.vote ?? "",
    comment: item.comment ?? "",
  };
}

export type SupabaseGuard = { assertNessunaScrittura: () => void };

/** Blocca ogni traffico verso Supabase e tiene il conto di quanto passa. */
export async function blockSupabase(page: Page): Promise<SupabaseGuard> {
  const passate: string[] = [];
  page.on("response", (res) => {
    if (/supabase\.co/.test(res.url())) passate.push(`${res.request().method()} ${res.url()}`);
  });
  await page.route(/supabase\.co/, (route) => route.abort("failed"));
  return {
    assertNessunaScrittura() {
      if (passate.length) {
        throw new Error(
          `Una richiesta a Supabase e' arrivata a destinazione nonostante il blocco: ${passate.join(", ")}`
        );
      }
    },
  };
}

/** Avvia l'app con una libreria finta gia' in cache e Supabase bloccato.
 *
 * La cache viene scritta con addInitScript, cioe' PRIMA degli script della
 * pagina, invece del giro goto -> clear -> seed -> reload usato da
 * gotoFresh(): cosi' l'app parte una volta sola e vede subito la libreria
 * giusta. Due caricamenti completi al posto di uno raddoppiavano il tempo e
 * l'esposizione alla rete, e su una suite intera bastava a far scadere ogni
 * tanto l'attesa di `app--ready` — con un fallimento che somigliava a un
 * bug dell'app invece che a un caricamento lento.
 *
 * E' sicuro qui al contrario che per clearBrowserStorage(): questo script
 * scrive sempre lo stesso valore noto, quindi rigirare a ogni navigazione
 * non puo' cancellare stato che un test voleva conservare. */
export async function gotoFreshWithLibrary(
  page: Page,
  db: { seen: unknown[]; watchlist: unknown[] }
): Promise<SupabaseGuard> {
  const guard = await blockSupabase(page);
  // I font esterni non servono a nessuna asserzione e rallentano il load.
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  const cache = JSON.stringify({ version: 1, data: db });
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.clear();
        window.localStorage.setItem(key, value);
      } catch {
        /* storage non disponibile: il test fallira' piu' avanti, con un
           messaggio piu' utile di un'eccezione qui */
      }
    },
    [FAKE_DB_CACHE_KEY, cache] as const
  );

  await page.goto(".");
  await page.locator(S.appReady).waitFor({ state: "attached", timeout: 20_000 });
  return guard;
}

// ─── Card "Il tuo voto" ──────────────────────────────────────────────────
// Da PR #15/#16 su Cos90 la card ha tre stati (app.js::applyVoteState): un
// titolo visto e votato mostra il RIEPILOGO e tiene l'editor nascosto, per
// cui scrivere nel campo voto richiede prima un passaggio da "Modifica".
// Senza questi due helper ogni test dovrebbe ricordarsene da solo.

/** Porta la card in modifica se e' in riepilogo; se l'editor e' gia' aperto
 * (titolo non votato o non ancora visto) non fa nulla. */
export async function openVoteEditor(page: Page): Promise<void> {
  const editBtn = page.locator(S.detailVoteEditBtn);
  if (await editBtn.isVisible()) await editBtn.click();
  await page.locator(S.detailVoteInput).waitFor({ state: "visible", timeout: 5_000 });
}

/** Scrive un commento aprendo prima il campo, che resta nascosto finche'
 * non c'e' un commento salvato (app.js::setDetailComment). */
export async function fillComment(page: Page, text: string): Promise<void> {
  await openVoteEditor(page);
  const toggle = page.locator(S.detailCommentToggle);
  if (await toggle.isVisible()) await toggle.click();
  await page.locator(S.detailCommentInput).fill(text);
}
