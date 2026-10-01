import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  fakeItem,
  fakeKey,
  gotoFreshWithLibrary,
  openVoteEditor,
} from "../../fixtures/cinetracker-page.ts";
import { S } from "../../fixtures/selectors.ts";

// La card "Il tuo voto" (#detailVoteCard), introdotta dalle PR #15/#16 su
// Cos90 al posto della vecchia "La tua scheda personale". Tre stati, decisi
// da app.js::applyVoteState(hasVote, seen, editing):
//
//   riepilogo  visto E votato E non in modifica -> solo il voto grande, il
//              commento fra virgolette e "Modifica". L'editor e' NASCOSTO:
//              per cambiare voto si passa per forza da "Modifica".
//   modifica   dopo "Modifica" -> campo voto precompilato, "Salva voto",
//              "Annulla" e "Rimuovi" (quest'ultimo azzera il voto).
//   aperta     non votato, oppure non ancora visto -> editor sempre aperto.
//
// Sono tutti test di SOLA LETTURA: la libreria e' finta (cache locale
// seedata) e Supabase e' bloccato, quindi nessuna di queste verifiche tocca
// l'archivio reale — vedi il commento su blockSupabase() nella fixture. Le
// due asserzioni su "nessuna scrittura" in fondo a ogni test non sono
// decorative: se il route di blocco smettesse di agganciare, un salvataggio
// partito per sbaglio cancellerebbe la libreria vera (mirror sync), e questo
// e' il punto in cui si vedrebbe.

const VOTATO = { id: 950001, media_type: "movie" as const, title: "QA Visto Votato" };
const VOTATO_SENZA_COMMENTO = { id: 950002, media_type: "movie" as const, title: "QA Senza Commento" };
const SENZA_VOTO = { id: 950003, media_type: "movie" as const, title: "QA Senza Voto" };
const IN_WATCHLIST = { id: 950004, media_type: "movie" as const, title: "QA Da Vedere" };

const DB = {
  seen: [
    fakeItem({ ...VOTATO, vote: "7+", comment: "Mi e' piaciuto parecchio" }),
    fakeItem({ ...VOTATO_SENZA_COMMENTO, vote: "8-" }),
    fakeItem({ ...SENZA_VOTO }),
  ],
  watchlist: [fakeItem({ ...IN_WATCHLIST })],
};

/** Apre un titolo della libreria finta passando dalla schermata "Vedi tutto",
 * che garantisce che la riga sia stata disegnata (le vetrine della home ne
 * mostrano solo una parte). */
async function openStored(
  page: Page,
  item: { id: number; media_type: "movie"; title: string },
  lista: "seen" | "watchlist"
): Promise<void> {
  await page.locator(lista === "seen" ? "#openSeenMovies" : S.openWatchAll).click();
  await page.locator(S.screenLibrary).waitFor({ state: "visible", timeout: 10_000 });
  // Dentro #libraryList e non in tutta la pagina: lo stesso data-key compare
  // anche nelle vetrine della home e nel podio delle statistiche, che restano
  // nel DOM (nascosti) quando si cambia schermata.
  await page.locator(`#libraryList .open-stored-detail[data-key="${fakeKey(item)}"]`).click();
  await expect(page.locator(S.screenDetail)).toBeVisible();
}

test.describe("CineTracker — card \"Il tuo voto\"", () => {
  test("titolo visto e votato: riepilogo con voto e commento, editor chiuso", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openStored(page, VOTATO, "seen");

    await expect(page.locator(S.detailVoteCard)).toBeVisible();
    await expect(page.locator(S.detailVoteBadge)).toHaveText("✓ Votato");

    // Il voto e' la LABEL testuale salvata, non un numero riconvertito: "7+"
    // deve restare "7+" (stesso principio verificato da vote-formats).
    await expect(page.locator(S.detailVoteSummary)).toBeVisible();
    await expect(page.locator(S.detailVoteSummaryNum)).toHaveText("7+");
    await expect(page.locator(S.detailVoteSummaryComment)).toHaveText("“Mi e' piaciuto parecchio”");
    await expect(page.locator(S.detailVoteEditBtn)).toBeVisible();

    // Il cuore della modifica: senza passare da "Modifica" non si scrive.
    await expect(page.locator(S.detailVoteEditor)).toBeHidden();
    await expect(page.locator(S.detailVoteInput)).toBeHidden();
    await expect(page.locator(S.detailSaveNoteBtn)).toBeHidden();

    // Nel riepilogo non c'e' piu' la scritta piccola "il tuo voto" accanto al
    // numero: era un doppione del titolo della card, tolta dalla PR #16.
    await expect(page.locator(S.detailVoteSummary)).not.toContainText("il tuo voto");

    guard.assertNessunaScrittura();
  });

  test("titolo votato senza commento: nel riepilogo compare solo il voto", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openStored(page, VOTATO_SENZA_COMMENTO, "seen");

    await expect(page.locator(S.detailVoteSummaryNum)).toHaveText("8-");
    // Il div esiste sempre nel markup: "assente" qui significa senza testo,
    // quindi senza virgolette vuote a schermo.
    await expect(page.locator(S.detailVoteSummaryComment)).toHaveText("");

    guard.assertNessunaScrittura();
  });

  test("\"Modifica\" apre l'editor col voto precompilato, \"Annulla\" torna al riepilogo senza salvare", async ({
    page,
  }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openStored(page, VOTATO, "seen");

    await page.locator(S.detailVoteEditBtn).click();

    await expect(page.locator(S.detailVoteEditor)).toBeVisible();
    await expect(page.locator(S.detailVoteInput)).toHaveValue("7+");
    await expect(page.locator(S.detailSaveNoteBtn)).toBeVisible();
    await expect(page.locator(S.detailSaveNoteBtn)).toHaveText("Salva voto");
    await expect(page.locator(S.detailCancelEditBtn)).toBeVisible();
    await expect(page.locator(S.detailClearVoteBtn)).toBeVisible();
    await expect(page.locator(S.detailVoteSummary)).toBeHidden();

    // Modifica scartata: "Annulla" deve rimettere il valore salvato, non
    // quello appena digitato — e non deve salvare niente.
    await page.locator(S.detailVoteInput).fill("3");
    await page.locator(S.detailCancelEditBtn).click();

    await expect(page.locator(S.detailVoteSummary)).toBeVisible();
    await expect(page.locator(S.detailVoteSummaryNum)).toHaveText("7+");
    await expect(page.locator(S.detailVoteEditor)).toBeHidden();

    await openVoteEditor(page);
    await expect(page.locator(S.detailVoteInput)).toHaveValue("7+");

    guard.assertNessunaScrittura();
  });

  test("titolo visto ma non votato: badge \"Da votare\" ed editor gia' aperto", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openStored(page, SENZA_VOTO, "seen");

    await expect(page.locator(S.detailVoteBadge)).toHaveText("Da votare");
    await expect(page.locator(S.detailVoteSummary)).toBeHidden();
    await expect(page.locator(S.detailVoteEditor)).toBeVisible();
    await expect(page.locator(S.detailVoteInput)).toBeVisible();
    await expect(page.locator(S.detailVoteInput)).toHaveValue("");
    // Gia' visto: "Salva voto" e' l'unico modo di aggiornare il voto, e
    // "Segna come visto" non ha piu' senso.
    await expect(page.locator(S.detailSaveNoteBtn)).toBeVisible();
    await expect(page.locator(S.detailSeenBtn)).toBeHidden();
    // Annulla/Rimuovi appartengono alla modifica di un voto che esiste.
    await expect(page.locator(S.detailCancelEditBtn)).toBeHidden();
    await expect(page.locator(S.detailClearVoteBtn)).toBeHidden();

    guard.assertNessunaScrittura();
  });

  test("titolo in watchlist: \"Segna come visto\" sta nella card e \"Salva voto\" resta nascosto", async ({
    page,
  }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openStored(page, IN_WATCHLIST, "watchlist");

    await expect(page.locator(S.detailVoteBadge)).toHaveText("Da votare");
    await expect(page.locator(S.detailVoteEditor)).toBeVisible();

    // Finora questo era verificato solo leggendo il codice: dalla PR #15
    // "Segna come visto" sta DENTRO la card del voto, non piu' in fondo alla
    // scheda, e deve essere davvero visibile li'.
    const seenBtn = page.locator(S.detailSeenBtn);
    await expect(seenBtn).toBeVisible();
    await expect(seenBtn).toHaveText("Segna come visto");
    const card = page.locator(S.detailVoteCard);
    await expect(card.locator(S.detailSeenBtn)).toHaveCount(1);

    // Non ancora visto: "Segna come visto" copre anche il salvataggio del
    // voto, quindi il secondo pulsante pieno resta fuori.
    await expect(page.locator(S.detailSaveNoteBtn)).toBeHidden();

    guard.assertNessunaScrittura();
  });

  test("il commento resta nascosto finche' non lo si chiede col link", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openStored(page, SENZA_VOTO, "seen");

    const commento = page.locator(S.detailCommentInput);
    const toggle = page.locator(S.detailCommentToggle);

    await expect(commento).toBeHidden();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText("+ Aggiungi un commento");

    await toggle.click();
    await expect(commento).toBeVisible();
    await expect(toggle).toBeHidden();

    guard.assertNessunaScrittura();
  });

  test("su un titolo che ha gia' un commento il campo e' aperto, senza link", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openStored(page, VOTATO, "seen");
    await openVoteEditor(page);

    await expect(page.locator(S.detailCommentInput)).toBeVisible();
    await expect(page.locator(S.detailCommentInput)).toHaveValue("Mi e' piaciuto parecchio");
    await expect(page.locator(S.detailCommentToggle)).toBeHidden();

    guard.assertNessunaScrittura();
  });

  test("il campo voto non ha piu' una label visibile, solo un aria-label", async ({ page }) => {
    const guard = await gotoFreshWithLibrary(page, DB);
    await openStored(page, SENZA_VOTO, "seen");

    const input = page.locator(S.detailVoteInput);
    await expect(input).toHaveAttribute("aria-label", "Il tuo voto");
    await expect(input).toHaveAttribute("placeholder", "Es. 7, 7+, 7,5, 8-");
    // La label visibile c'era e sarebbe un doppione del titolo della card.
    await expect(page.locator(S.detailVoteCard).locator("label")).toHaveCount(0);
    await expect(page.locator(S.detailVoteCard)).toContainText("Il tuo voto");

    guard.assertNessunaScrittura();
  });
});
