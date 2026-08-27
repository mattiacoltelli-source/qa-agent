import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFailure, cleanError, appNameFromProject, failureKey } from "./results.mjs";

// classifyFailure: la parte più delicata, perché deliberatamente conservativa
// (solo pattern inequivocabili di infrastruttura -> INFRA_ERROR, tutto il
// resto FAIL). Un test scritto una volta protegge da regressioni future (es.
// Playwright che cambia il testo di un messaggio) senza dover riverificare a
// mano ogni volta — vedi il bug reale trovato durante la verifica manuale di
// questa stessa funzione: il pattern "Target ... closed" non matchava il
// messaggio VERO di Playwright ("Target page, context or browser has been
// closed") finché non è stato corretto qui sotto.
test("classifyFailure: riconosce i pattern reali/verificati di Playwright come INFRA_ERROR", () => {
  assert.equal(classifyFailure("Target page, context or browser has been closed"), "INFRA_ERROR");
  assert.equal(classifyFailure("browserType.launch: Failed to launch chromium"), "INFRA_ERROR");
  assert.equal(classifyFailure("page.goto: net::ERR_CONNECTION_REFUSED at https://example.com/"), "INFRA_ERROR");
  assert.equal(classifyFailure("page.goto: net::ERR_NAME_NOT_RESOLVED at https://example.com/"), "INFRA_ERROR");
  assert.equal(classifyFailure("page.goto: net::ERR_CONNECTION_RESET at https://example.com/"), "INFRA_ERROR");
  assert.equal(classifyFailure("fetch failed: ECONNREFUSED"), "INFRA_ERROR");
  assert.equal(classifyFailure("connect ETIMEDOUT 1.2.3.4:443"), "INFRA_ERROR");
});

test("classifyFailure: resta FAIL su tutto ciò che non è inequivocabilmente infrastruttura", () => {
  assert.equal(
    classifyFailure('Error: expect(locator).toHaveText(expected) failed\nExpected: "2"\nReceived: "3"'),
    "FAIL"
  );
  // Un timeout generico è deliberatamente ambiguo (può essere l'app lenta):
  // non deve MAI diventare INFRA_ERROR solo perché contiene la parola "Timeout".
  assert.equal(classifyFailure("Timeout 30000ms exceeded.\nwaiting for locator(#statSeen)"), "FAIL");
  assert.equal(classifyFailure(""), "FAIL");
  assert.equal(classifyFailure(undefined), "FAIL");
  assert.equal(classifyFailure(null), "FAIL");
});

test("cleanError: rimuove i codici ANSI e tronca oltre il limite", () => {
  assert.equal(cleanError("\x1b[31mrosso\x1b[0m", undefined), "rosso");
  assert.equal(cleanError(null, undefined), "(nessun messaggio d'errore)");
  const long = "x".repeat(50);
  assert.equal(cleanError(long, 10), `${"x".repeat(10)}…`);
});

test("appNameFromProject: mappa il prefisso del progetto Playwright al nome app", () => {
  assert.equal(appNameFromProject("cinefighi-mobile"), "CineFighi");
  assert.equal(appNameFromProject("cinetracker-desktop"), "CineTracker");
  assert.equal(appNameFromProject("vacanza-mobile"), "Spot");
  assert.equal(appNameFromProject("progetto-sconosciuto"), "progetto-sconosciuto");
});

test("failureKey: stabile e distingue spec/test diversi", () => {
  const spec = { file: "a.spec.ts", title: "titolo" };
  const test1 = { projectName: "cinefighi-mobile" };
  const test2 = { projectName: "cinefighi-desktop" };
  assert.notEqual(failureKey(spec, test1), failureKey(spec, test2));
});
