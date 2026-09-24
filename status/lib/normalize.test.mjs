// Test della logica pura dietro status/build-status.mjs: la traduzione dei
// cinque report nella forma comune e il merge con lo stato già pubblicato.
// Nessun filesystem, nessuna rete — solo dato in, dato out.

import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS, mergeStatus, canonical, truncate } from "./normalize.mjs";

test("canonical traduce il nome storico vacanza in spot", () => {
  assert.equal(canonical("vacanza"), "spot");
  assert.equal(canonical("cinetracker"), "cinetracker");
});

test("truncate appiattisce su una riga e taglia alla lunghezza chiesta", () => {
  assert.equal(truncate("  a\n\n  b  "), "a b");
  assert.equal(truncate("abcdef", 3), "abc…");
  assert.equal(truncate(null), "");
});

test("QA: raggruppa i progetti mobile/desktop nella stessa app", () => {
  const report = AGENTS.qa.read({
    stats: { startTime: "2026-09-18T19:26:02.827Z" },
    suites: [
      {
        specs: [
          {
            title: "home",
            tests: [
              { projectName: "cinetracker-mobile", status: "expected", results: [{}] },
              { projectName: "cinetracker-desktop", status: "expected", results: [{}] },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(Object.keys(report.apps), ["cinetracker"]);
  assert.equal(report.apps.cinetracker.metrics.passed, 2);
  assert.equal(report.apps.cinetracker.result, "PASS");
  assert.equal(report.generatedAt, "2026-09-18T19:26:02.827Z");
});

test("QA: un test fallito rende l'app FAIL e ripulisce i codici colore ANSI", () => {
  const report = AGENTS.qa.read({
    stats: { startTime: "2026-09-18T19:26:02.827Z" },
    suites: [
      {
        specs: [
          {
            title: "voto salvato",
            tests: [
              {
                projectName: "cinetracker-desktop",
                status: "unexpected",
                results: [{ errors: [{ message: "expected 200 got \u001b[31m500\u001b[39m\n  at vote.spec.ts:12" }] }],
              },
            ],
          },
        ],
      },
    ],
  });

  const app = report.apps.cinetracker;
  assert.equal(app.result, "FAIL");
  assert.equal(app.problems.length, 1);
  assert.equal(app.problems[0].severity, "HIGH");
  assert.match(app.problems[0].message, /expected 200 got 500/);
  assert.doesNotMatch(app.problems[0].message, /\u001b/);
});

test("QA: un flaky conta come passato, non come problema", () => {
  const report = AGENTS.qa.read({
    stats: { startTime: "x" },
    suites: [{ specs: [{ title: "meteo", tests: [{ projectName: "vacanza-mobile", status: "flaky", results: [{}] }] }] }],
  });

  assert.equal(report.apps.spot.result, "PASS");
  assert.equal(report.apps.spot.metrics.flaky, 1);
  assert.equal(report.apps.spot.problems.length, 0);
});

test("QA: suite annidate vengono attraversate", () => {
  const report = AGENTS.qa.read({
    stats: { startTime: "x" },
    suites: [{ suites: [{ specs: [{ title: "t", tests: [{ projectName: "prova-mobile", status: "expected", results: [{}] }] }] }] }],
  });

  assert.equal(report.apps.prova.metrics.passed, 1);
});

test("QA: un report senza test non produce stato (meglio nulla che un falso verde)", () => {
  assert.equal(AGENTS.qa.read({ stats: {}, suites: [] }), null);
});

test("Data Health: sito irraggiungibile è il primo problema elencato", () => {
  const report = AGENTS["data-health"].read({
    generatedAt: "2026-09-18T19:00:00.000Z",
    apps: {
      vacanza: { label: "Spot", uptime: { ok: false, status: 503, reason: "HTTP 503" }, data: null, result: "FAIL" },
    },
  });

  assert.equal(report.apps.spot.result, "FAIL");
  assert.equal(report.apps.spot.summary, "Irraggiungibile");
  assert.match(report.apps.spot.problems[0].message, /HTTP 503/);
});

test("Data Health: i conteggi diventano metriche di prodotto", () => {
  const report = AGENTS["data-health"].read({
    generatedAt: "x",
    apps: {
      cinetracker: {
        label: "CineTracker",
        uptime: { ok: true },
        data: { counts: { titles: 565, votes: 961 }, issues: [] },
        result: "PASS",
      },
    },
  });

  assert.deepEqual(report.apps.cinetracker.metrics, { titles: 565, votes: 961 });
  assert.equal(report.apps.cinetracker.problems.length, 0);
});

test("API Doctor: un INFRA_ERROR pesa meno di un endpoint che risponde male", () => {
  const report = AGENTS["api-doctor"].read({
    generatedAt: "x",
    apps: {
      prova: {
        label: "Prova",
        result: "FAIL",
        checks: [
          { name: "Yahoo", ok: true, kind: "PASS" },
          { name: "SEC", ok: false, kind: "FAIL", status: 403, reason: "Forbidden" },
          { name: "GDELT", ok: false, kind: "INFRA_ERROR", status: null, reason: "ETIMEDOUT" },
        ],
      },
    },
  });

  const byName = Object.fromEntries(report.apps.prova.problems.map((p) => [p.message.split(":")[0], p.severity]));
  assert.equal(byName.SEC, "HIGH");
  assert.equal(byName.GDELT, "LOW");
  assert.equal(report.apps.prova.summary, "1/3 endpoint ok");
});

test("Security: usa una chiave a parte, non è una delle quattro app", () => {
  const report = AGENTS.security.read({
    generatedAt: "x",
    apps: { "qa-agent": { label: "qa-agent", counts: { critical: 0, high: 0, moderate: 1, low: 0, total: 1 }, result: "PASS" } },
  });

  assert.deepEqual(Object.keys(report.apps), ["qa-agent"]);
  assert.equal(report.apps["qa-agent"].problems.length, 0);
});

test("merge: un run parziale non cancella le app che non ha controllato", () => {
  const previous = {
    agent: "data-health",
    apps: {
      cinetracker: { result: "PASS", runAt: "2026-09-01T00:00:00.000Z" },
      spot: { result: "FAIL", runAt: "2026-09-01T00:00:00.000Z" },
    },
  };

  const merged = mergeStatus({
    agent: "data-health",
    label: "Data Health Agent",
    previous,
    report: { generatedAt: "2026-09-20T08:00:00.000Z", apps: { cinetracker: { result: "WARN", problems: [] } } },
    runUrl: "https://example.test/run/1",
  });

  assert.equal(merged.apps.cinetracker.result, "WARN");
  assert.equal(merged.apps.cinetracker.runAt, "2026-09-20T08:00:00.000Z");
  assert.equal(merged.apps.cinetracker.runUrl, "https://example.test/run/1");
  // Spot non era in questo run: resta com'era, con la SUA data — è proprio
  // quel "vecchio" che a valle diventa la segnalazione di controllo scaduto.
  assert.equal(merged.apps.spot.result, "FAIL");
  assert.equal(merged.apps.spot.runAt, "2026-09-01T00:00:00.000Z");
});

test("merge: senza stato precedente parte dal run corrente", () => {
  const merged = mergeStatus({
    agent: "qa",
    label: "QA Agent",
    previous: null,
    report: { generatedAt: "2026-09-20T08:00:00.000Z", apps: { spot: { result: "PASS" } } },
  });

  assert.deepEqual(Object.keys(merged.apps), ["spot"]);
  assert.equal(merged.updatedAt, "2026-09-20T08:00:00.000Z");
  assert.equal(merged.apps.spot.runUrl, null);
});

test("merge: un report senza generatedAt ripiega sull'ora passata, non su null", () => {
  const merged = mergeStatus({
    agent: "qa",
    label: "QA Agent",
    previous: null,
    report: { generatedAt: null, apps: { spot: { result: "PASS" } } },
    now: "2026-09-20T09:00:00.000Z",
  });

  assert.equal(merged.apps.spot.runAt, "2026-09-20T09:00:00.000Z");
});
