import { test, expect } from "@playwright/test";
import { gotoFresh, openScreen } from "../../fixtures/cinetracker-page.ts";

// "Stasera cosa guardo" legge lo storico voti REALE dell'utente su Supabase
// (CineTracker è single-user, nessun account di test separato dietro cui
// nascondersi come QA_USER in CineFighi). Da c6590d3: niente più auto-load
// all'apertura del tab (rimosso maybeAutoRecommend, come in CineFighi), il
// consiglio parte solo al click su #recommendBtn. Il test verifica che
// l'app gestisca bene ENTRAMBI gli stati possibili (libreria sotto i 3
// titoli visti → invito ad aggiungerne di più; sopra soglia → 6 consigli),
// invece di assumerne uno specifico — comunque a sola lettura.
test.describe("CineTracker — Stasera cosa guardo (TMDB discover live)", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
    await openScreen(page, "tonight");
  });

  test("il pulsante consigli produce sempre un esito valido, mai un errore silenzioso o un caricamento infinito", async ({ page }) => {
    await page.locator("#recommendBtn").click();
    const result = page.locator("#tonightSuggestion");
    // Il testo di caricamento reale (app.js) è "🔍 Sto cercando 6 titoli
    // adatti…", non quello genericamente immaginato qui prima — con la
    // stringa sbagliata questo expect non aspettava mai davvero la fine del
    // caricamento: risolveva quasi subito, lasciando una finestra in cui
    // hintVisible/cardCount potevano essere letti a metà del re-render
    // (hint ancora visto "vero" da un check, card già arrivate per
    // l'altro) — causa di un fallimento reale in CI (hintVisible true e
    // cardCount 6 insieme).
    await expect(result).not.toContainText("Sto cercando", { timeout: 15_000 });

    const hint = result.locator(".tonight__hint");
    const cards = result.locator(".poster-card");
    const hintVisible = await hint.isVisible().catch(() => false);
    const cardCount = await cards.count();

    if (hintVisible) {
      // Libreria sotto i 3 titoli visti: deve invitare ad aggiungerne
      // altri, non mostrare card vuote.
      expect(cardCount).toBe(0);
    } else {
      // Libreria abbastanza popolata: fino a 6 consigli (in CineFighi sono
      // 5 — soglie diverse, verificate sul sorgente reale di ciascuna app),
      // ciascuno con una % di affinità.
      expect(cardCount).toBeGreaterThan(0);
      expect(cardCount).toBeLessThanOrEqual(6);
      await expect(cards.first().locator(".tonight-card__affinity")).toBeVisible();
    }
  });

  // "Scopri qualcosa di nuovo" (#discoverBtn) e "Rivedi un classico"
  // (#classicBtn) erano nel backlog del README come "non ancora
  // implementati" — in realtà sono presenti da tempo (index.html, app.js
  // discoverByTaste()/suggestClassic()) e non avevano alcuna copertura.
  // Stessa scelta di non mockare la libreria degli altri test di questo
  // file: entrambe le funzioni leggono db.seen (storico voti REALE, single-
  // user) e gestiscono già in modo esplicito il caso "sotto soglia", quindi
  // verifichiamo che l'app si comporti bene in ENTRAMBI gli stati possibili
  // invece di assumerne uno.
  test("Scopri qualcosa di nuovo produce sempre un esito valido, mai un errore silenzioso o un caricamento infinito", async ({
    page
  }) => {
    // Il genere selezionato è solo un filtro sulla ricerca TMDB (getSelectedGenre
    // in app.js): la sola interazione con #genreSelect, senza dover verificare
    // un genere specifico nel risultato (non deterministico su dati live).
    await page.locator("#genreSelect").selectOption("Commedia");
    await page.locator("#discoverBtn").click();

    const result = page.locator("#tonightSuggestion");
    // discoverByTaste() imposta subito questo hint di caricamento prima di
    // qualunque fetch — stesso rischio di falso-verde già documentato per
    // #recommendBtn se si aspettasse la stringa sbagliata.
    await expect(result).not.toContainText("Sto cercando qualcosa di nuovo", { timeout: 15_000 });

    const hint = result.locator(".tonight__hint");
    const card = result.locator(".tonight-solo .poster-card");
    const hintVisible = await hint.isVisible().catch(() => false);
    const cardVisible = await card.isVisible().catch(() => false);

    // Deve sempre risolversi in uno dei due stati: mai entrambi vuoti (bug
    // silenzioso) né entrambi presenti (re-render a metà).
    expect(hintVisible !== cardVisible).toBe(true);

    if (cardVisible) {
      // "Aggiungi almeno 3 titoli visti..." è l'unico hint atteso se invece
      // la libreria reale è sotto soglia — qui la card è comparsa, quindi
      // verifichiamone la struttura reale (renderDiscoverResult in ui.js).
      await expect(card.locator(".poster-card__title")).toContainText("✨");
      await expect(card.locator(".tonight-card__reason")).toBeVisible();
      await expect(card.locator(".action-watch")).toBeVisible();
      await expect(card.locator(".action-seen")).toBeVisible();
      await expect(card.locator(".action-details")).toHaveText("Scheda →");
    }
  });

  test('Rivedi un classico propone un titolo già votato ≥7, o l\'invito a votarne uno se non ce n\'è ancora', async ({
    page
  }) => {
    await page.locator("#classicBtn").click();

    const result = page.locator("#tonightSuggestion");
    const hint = result.locator(".tonight__hint");
    const card = result.locator(".tonight-solo .poster-card");
    // suggestClassic() è puramente locale (nessun fetch): l'esito è immediato,
    // niente stato di caricamento intermedio da aspettare.
    const hintVisible = await hint.isVisible().catch(() => false);
    const cardVisible = await card.isVisible().catch(() => false);
    expect(hintVisible !== cardVisible).toBe(true);

    if (hintVisible) {
      await expect(hint).toContainText("Nessun titolo con voto");
    } else {
      // renderClassicResult in ui.js: titolo col prefisso 🏛️, voto e un
      // commento che dipende dal voto — qui verifichiamo solo la struttura,
      // non il commento esatto (dipende dal voto del titolo reale scelto).
      await expect(card.locator(".poster-card__title")).toContainText("🏛️");
      await expect(card.locator(".poster-card__meta")).toContainText("tuo voto:");
      await expect(card.locator(".tonight-card__reason")).toBeVisible();
      // Apre il dettaglio del titolo, non un fetch esterno — coerente con
      // "classico" pescato dalla libreria già posseduta.
      await expect(card).toHaveClass(/open-stored-detail/);
    }
  });
});
