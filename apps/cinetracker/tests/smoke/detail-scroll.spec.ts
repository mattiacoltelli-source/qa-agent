import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  fakeItem,
  fakeKey,
  gotoFreshWithLibrary,
} from "../../fixtures/cinetracker-page.ts";
import { S } from "../../fixtures/selectors.ts";

// Lo scorrimento della scheda titolo, introdotto dalla PR #15 su Cos90
// (app.js::jumpScroll/detailReturnScrollY). Tre regole:
//
//   1. aprire un titolo porta la scheda all'inizio, anche se l'elenco di
//      partenza era scorso a meta';
//   2. tornare indietro — col pulsante o col tasto del browser — rimette
//      l'elenco dov'era;
//   3. un salvataggio NON e' un'apertura: la scheda resta dov'e'.
//
// Il salto deve essere ISTANTANEO: `html` ha `scroll-behavior: smooth`, per
// cui un `scrollTo(x, y)` normale scivolerebbe in animazione sotto la
// schermata che sta comparendo. Per questo i controlli qui sotto leggono
// `scrollY` SUBITO dopo il click, senza expect.poll: con un'animazione in
// corso il valore letto in quel momento non sarebbe ancora 0, ed e'
// esattamente la differenza che questi test devono cogliere. Il click di
// Playwright si risolve dopo che l'evento e' stato gestito, e il gestore di
// app.js e' sincrono fino a jumpScroll(), quindi la lettura non e' in corsa
// con niente.
//
// Sola lettura: libreria finta in cache e Supabase bloccato (vedi
// blockSupabase() nella fixture). L'unico test che salva scrive in
// localStorage e basta — il push verso Supabase viene intercettato, e la
// guardia lo verifica.

// Abbastanza titoli da rendere l'elenco piu' alto dello schermo in entrambi
// i viewport (mobile e desktop), altrimenti non ci sarebbe niente da
// scorrere e i test passerebbero senza verificare nulla.
const SEEN = Array.from({ length: 60 }, (_, i) =>
  fakeItem({ id: 960000 + i, media_type: "movie", title: `QA Scroll ${i}` })
);
// Il bersaglio e' a meta' elenco: abbastanza in basso da richiedere uno
// scorrimento, ma dentro il primo blocco che la lista disegna
// (LIBRARY_PAGE_SIZE = 40, vedi library-pagination.spec.ts) — oltre quello
// non sarebbe ancora nel DOM e il click aspetterebbe per sempre.
const TARGET = { id: 960000 + 25, media_type: "movie" as const, title: "QA Scroll 25" };

// Un titolo con trama lunga, cosi' la sua scheda e' piu' alta dello schermo:
// serve al test sul salvataggio, che deve poter scorrere DENTRO la scheda.
// Sta in testa all'elenco perche' doRenderLibrary() non riordina niente,
// quindi il primo dell'array e' il primo disegnato.
const TARGET_ALTO = { id: 960500, media_type: "movie" as const, title: "QA Scroll Alto" };
const TRAMA_LUNGA = "Trama finta lunga per rendere la scheda piu' alta dello schermo. ".repeat(6);

const DB = {
  seen: [
    { ...fakeItem({ ...TARGET_ALTO }), overview: TRAMA_LUNGA },
    ...SEEN,
  ],
  watchlist: [],
};

async function openLibrary(page: Page): Promise<void> {
  await page.locator("#openSeenMovies").click();
  await page.locator(S.screenLibrary).waitFor({ state: "visible", timeout: 10_000 });
  await page.locator(S.libraryListListItem).first().waitFor({ state: "visible", timeout: 10_000 });
}

/** Scorre senza animazione (html ha scroll-behavior: smooth) e restituisce
 * la posizione raggiunta davvero, che su schermi alti puo' essere minore di
 * quella chiesta. */
async function scrollTo(page: Page, y: number): Promise<number> {
  return page.evaluate((top) => {
    window.scrollTo({ top, left: 0, behavior: "instant" as ScrollBehavior });
    return window.scrollY;
  }, y);
}

/** Porta una riga dell'elenco a 100px dal bordo alto e restituisce la
 * posizione raggiunta. Serve che la riga sia GIA' in vista prima del click:
 * Playwright, se non lo e', la porta in vista da solo — spostando lo
 * scorrimento e falsando proprio la misura che questi test confrontano. */
async function scrollToRow(page: Page, key: string): Promise<number> {
  const y = await page.evaluate((k) => {
    const el = document.querySelector(`#libraryList .open-stored-detail[data-key="${k}"]`);
    if (!el) return -1;
    const top = el.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: Math.max(0, top), left: 0, behavior: "instant" as ScrollBehavior });
    return window.scrollY;
  }, key);
  expect(y, `la riga ${key} non e' nell'elenco disegnato`).toBeGreaterThanOrEqual(0);
  return y;
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

/** La scheda e' gia' all'inizio, SUBITO: nessuna attesa, nessun poll.
 *
 * E' il controllo che distingue il salto istantaneo da uno scorrimento
 * animato, quindi aspettare lo renderebbe inutile — con `scroll-behavior:
 * smooth` l'animazione finirebbe comunque a 0, solo piu' tardi. La soglia
 * e' larga perche' l'unico margine che serve e' quello del sub-pixel
 * (Playwright, portando la riga in vista prima del click, puo' lasciare
 * qualche px): partendo da ~4900px, un'animazione in corso leggerebbe
 * centinaia di pixel, non quattro. */
async function expectSubitoInCima(page: Page): Promise<void> {
  const y = await scrollY(page);
  expect(y, "la scheda non e' partita dall'inizio (o il salto non e' istantaneo)").toBeLessThan(50);
}

/** Verifica dove si e' fermato lo scorrimento, a meno di qualche pixel e
 * dando il tempo di assestarsi.
 *
 * Due ragioni, entrambe viste davvero girando i test. I pixel: sul tasto
 * indietro il ripristino atterra a volte un paio di px piu' su
 * (arrotondamento sub-pixel) — e qualche pixel non e' "l'elenco e' tornato
 * in cima", che e' l'unica cosa che questi test devono distinguere. Il
 * tempo: su una navigazione di storia il browser fa il suo ripristino
 * automatico oltre a quello dell'app, e sotto carico i due possono
 * arrivare a qualche decina di ms di distanza.
 *
 * Qui aspettare va bene, al contrario del controllo sul salto a inizio
 * scheda: li' il punto e' proprio che sia istantaneo, quindi quello resta
 * una lettura secca. */
async function expectScrollVicino(page: Page, atteso: number): Promise<void> {
  await expect
    .poll(async () => Math.abs((await scrollY(page)) - atteso), {
      timeout: 3_000,
      message: `lo scorrimento non si e' fermato vicino a ${atteso}`,
    })
    .toBeLessThanOrEqual(5);
}

test.describe("CineTracker — scorrimento della scheda titolo", () => {
  test("aprire un titolo da un elenco scorso parte dall'inizio della scheda", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openLibrary(page);

    const partenza = await scrollToRow(page, fakeKey(TARGET));
    // Se l'elenco non fosse scorribile il test non proverebbe niente.
    expect(partenza).toBeGreaterThan(0);

    await page.locator(`#libraryList .open-stored-detail[data-key="${fakeKey(TARGET)}"]`).click();

    // Letto subito: vedi la nota sul salto istantaneo in cima al file.
    await expectSubitoInCima(page);
    await expect(page.locator(S.screenDetail)).toBeVisible();
    await expect(page.locator(S.detailVoteCard)).toBeInViewport();

    guard.assertNessunaScrittura();
  });

  test("\"Torna indietro\" rimette l'elenco dove era", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openLibrary(page);

    const partenza = await scrollToRow(page, fakeKey(TARGET));
    expect(partenza).toBeGreaterThan(0);

    await page.locator(`#libraryList .open-stored-detail[data-key="${fakeKey(TARGET)}"]`).click();
    await expectSubitoInCima(page);

    await page.locator(S.detailBackBtn).click();
    await expect(page.locator(S.screenLibrary)).toBeVisible();
    await expectScrollVicino(page, partenza);

    guard.assertNessunaScrittura();
  });

  test("il tasto indietro del browser rimette l'elenco dove era", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openLibrary(page);

    const partenza = await scrollToRow(page, fakeKey(TARGET));
    expect(partenza).toBeGreaterThan(0);

    await page.locator(`#libraryList .open-stored-detail[data-key="${fakeKey(TARGET)}"]`).click();
    await expectSubitoInCima(page);

    await page.goBack();
    await expect(page.locator(S.screenDetail)).toBeHidden();
    await expectScrollVicino(page, partenza);

    guard.assertNessunaScrittura();
  });

  test("dopo un salvataggio la scheda resta dov'e', non torna in cima", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openLibrary(page);
    await page.locator(`#libraryList .open-stored-detail[data-key="${fakeKey(TARGET_ALTO)}"]`).click();
    await expect(page.locator(S.screenDetail)).toBeVisible();
    // Qui l'elenco non era scorso (questo titolo e' il primo), quindi il
    // salto a 0 e' gia' coperto dal primo test: basta sapere da dove si
    // parte. Playwright, portando in vista la riga prima del click, puo'
    // lasciare un paio di px.
    await expectScrollVicino(page, 0);

    // Si scorre quel tanto che basta a lasciare la cima, tenendo "Salva
    // voto" a schermo: un click di Playwright porta da solo l'elemento in
    // vista, e lo farebbe scorrere falsando la misura.
    await page.locator(S.detailVoteInput).fill("9");
    const prima = await scrollTo(page, 200);
    expect(prima).toBeGreaterThan(0);
    await expect(page.locator(S.detailSaveNoteBtn)).toBeInViewport();

    await page.locator(S.detailSaveNoteBtn).click();
    // Il salvataggio e' andato a buon fine (solo in locale: Supabase e'
    // bloccato) e la card e' passata in riepilogo.
    await expect(page.locator(S.detailVoteSummaryNum)).toHaveText("9");

    // Il punto del test: openDetail({ refresh: true }) non chiama jumpScroll.
    expect(await scrollY(page)).toBeGreaterThan(0);

    guard.assertNessunaScrittura();
  });
});
