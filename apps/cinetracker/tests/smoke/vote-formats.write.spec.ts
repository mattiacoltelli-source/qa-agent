import { test, expect } from "@playwright/test";
import {
  gotoFresh,
  search,
  firstAddableSearchCard,
  addSearchResultAs,
  fillComment,
  openVoteEditor,
  removeCurrentDetail,
} from "../../fixtures/cinetracker-page.ts";
import { CINETRACKER_MARKER } from "../../../../scripts/cleanup-write-residue.mjs";
import { S } from "../../fixtures/selectors.ts";

// Questi test scrivono nella libreria REALE dell'utente (Supabase "Coltel",
// user_id fisso "default" — è la TUA collezione personale, non un dataset
// di prova: CineTracker è single-user, non esiste un "utente di test"
// separabile come in CineFighi). Girano solo con RUN_WRITE_TESTS=true, e
// ogni test rimuove il titolo aggiunto nel proprio blocco finally.
//
// Coprono la logica di parsing voto più a rischio bug dell'app: il testo
// digitato ("7+", "8-", "7,5"...) è normalizzato da sanitizeVoteInput() e
// salvato come LABEL testuale — non come numero — quindi il valore visto
// dopo il salvataggio deve corrispondere esattamente, non essere convertito.
//
// Dalle PR #15/#16 su Cos90 la card del voto ha tre stati (vedi
// smoke/vote-card.spec.ts): il campo commento parte nascosto e si apre col
// link "+ Aggiungi un commento", e dopo un salvataggio la card passa in
// RIEPILOGO, chiudendo l'editor. Per questo qui si passa da fillComment() e
// openVoteEditor() invece di scrivere dritti nei campi, e il voto salvato si
// legge in #detailVoteSummaryNum: e' quello che vede davvero chi usa l'app,
// il campo di testo a quel punto non e' nemmeno a schermo.
//
// Ogni salvataggio scrive anche CINETRACKER_MARKER nel commento: è la rete
// di sicurezza indipendente dal browser (scripts/cleanup-write-residue.mjs,
// eseguita in CI con `if: always()` dopo la suite @write) che ripulisce un
// eventuale residuo se il cleanup try/finally qui sotto non arriva in fondo
// (crash, pagina bloccata). Un voto senza quel marcatore non viene mai
// toccato dallo script: evita di rischiare un tuo voto vero che avesse per
// coincidenza lo stesso valore.
test.describe("CineTracker — formati voto @write", () => {
  test.skip(
    process.env.RUN_WRITE_TESTS !== "true",
    "Test di scrittura disattivati di default: scrivono nella tua libreria reale. " +
      "Esegui con RUN_WRITE_TESTS=true (npm run test:write) per abilitarli."
  );

  test.beforeEach(async ({ page }) => {
    await gotoFresh(page);
  });

  const cases: Array<{ input: string; expectedLabel: string }> = [
    { input: "7", expectedLabel: "7" },
    { input: "7,5", expectedLabel: "7,5" },
    { input: "7.5", expectedLabel: "7,5" }, // il punto viene normalizzato in virgola
    { input: "8-", expectedLabel: "8-" }, // sintassi speciale: NON un numero decimale
    { input: "8+", expectedLabel: "8+" },
  ];

  for (const { input, expectedLabel } of cases) {
    test(`voto "${input}" salvato con la label "${expectedLabel}" (non convertito in numero)`, async ({
      page,
    }) => {
      await search(page, "Inception");
      const card = firstAddableSearchCard(page);
      await expect(card).toBeVisible({ timeout: 10_000 });
      await addSearchResultAs(card, "seen");
      await expect(page.locator(S.screenDetail)).toBeVisible();

      try {
        await page.locator(S.detailVoteInput).fill(input);
        await fillComment(page, CINETRACKER_MARKER);
        await page.locator(S.detailSaveNoteBtn).click();
        await expect(page.locator(S.detailVoteSummaryNum)).toHaveText(expectedLabel);
      } finally {
        await removeCurrentDetail(page);
        await expect(page.locator(S.screenHome)).toBeVisible();
      }
    });
  }

  test("un voto fuori scala (es. 15) viene clampato silenziosamente a 10, non salvato com'è digitato", async ({
    page,
  }) => {
    await search(page, "Inception");
    const card = firstAddableSearchCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await addSearchResultAs(card, "seen");
    await expect(page.locator(S.screenDetail)).toBeVisible();

    try {
      await page.locator(S.detailVoteInput).fill("15");
      await fillComment(page, CINETRACKER_MARKER);
      await page.locator(S.detailSaveNoteBtn).click();
      await expect(page.locator(S.detailVoteSummaryNum)).toHaveText("10");
    } finally {
      await removeCurrentDetail(page);
      await expect(page.locator(S.screenHome)).toBeVisible();
    }
  });

  test("un voto non valido (es. testo) viene rifiutato con un toast, senza sovrascrivere quello precedente", async ({
    page,
  }) => {
    await search(page, "Inception");
    const card = firstAddableSearchCard(page);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await addSearchResultAs(card, "seen");
    await expect(page.locator(S.screenDetail)).toBeVisible();

    try {
      await page.locator(S.detailVoteInput).fill("7,5");
      await fillComment(page, CINETRACKER_MARKER);
      await page.locator(S.detailSaveNoteBtn).click();
      await expect(page.locator(S.detailVoteSummaryNum)).toHaveText("7,5");

      // Il voto e' salvato, quindi la card e' in riepilogo: per riscrivere
      // nel campo serve prima "Modifica".
      await openVoteEditor(page);
      await page.locator(S.detailVoteInput).fill("abc");
      await page.locator(S.detailSaveNoteBtn).click();
      // validateVote() respinge l'input e la funzione ritorna prima di
      // salvare: il voto precedente ("7,5") resta quello effettivamente
      // persistito, l'utente viene avvisato con un toast di errore.
      await expect(page.locator(S.toastError)).toBeVisible();
    } finally {
      await removeCurrentDetail(page);
      await expect(page.locator(S.screenHome)).toBeVisible();
    }
  });
});
