#!/usr/bin/env node
// API Doctor — engine: per ogni app, interroga le API esterne reali che usa
// davvero (TMDB per CineFighi/CineTracker, meteo/mare/alba-tramonto per
// Spot — verificate sul sorgente reale, non dedotte) e verifica che
// rispondano nella forma attesa. In più, propaga gli header di rate-limit
// quando l'API li invia (vedi lib/http.mjs) — nessuna chiamata aggiuntiva,
// nessuna nuova credenziale: se un'API non li invia, resta null, non è un
// FAIL. Deterministico: nessuna chiamata AI qui (vedi api-doctor/analyze.mjs).
// Scrive SEMPRE reports/api-doctor-results.json.
//
// Ogni check distingue un FAIL vero (l'API ha risposto, ma male: status
// sbagliato, corpo malformato) da un INFRA_ERROR (la richiesta non è
// nemmeno arrivata a destinazione — DNS, timeout, connessione rifiutata:
// vedi networkError in lib/http.mjs, che già fa un retry silenzioso prima
// di arrendersi). Un FAIL vero fa fallire il job (e quindi, a valle,
// notifica su Telegram); un INFRA_ERROR puro no — non è un problema
// dell'app, è un blip di rete del runner, e trattarlo come un vero
// allarme è la ricetta per finire per ignorare le notifiche.

import fs from "node:fs";
import * as cinefighi from "./endpoints/cinefighi.mjs";
import * as cinetracker from "./endpoints/cinetracker.mjs";
import * as spot from "./endpoints/spot.mjs";
import { classify, rollupApp } from "./lib/classify.mjs";

const PROJECTS = { cinefighi, cinetracker, spot };

const OUTPUT_PATH = "reports/api-doctor-results.json";

async function checkProject(name, project) {
  const checks = await project.checks();
  const classified = checks.map((c) => ({
    name: c.name,
    endpoint: c.url,
    method: c.method,
    status: c.status,
    ok: c.ok,
    infra: !!c.networkError,
    kind: classify(c),
    durationMs: c.durationMs,
    reason: c.reason,
    bodySnippet: c.ok ? null : c.bodySnippet, // il corpo grezzo serve solo per diagnosticare un fallimento
    rateLimit: c.rateLimit, // header di quota/rate-limit se l'API li invia, altrimenti null
  }));

  return { label: project.label, checks: classified, result: rollupApp(classified) };
}

async function main() {
  const requested = process.argv[2] || "tutte";
  const resolved = requested === "tutte" ? "tutte" : requested;
  const names = resolved === "tutte" ? Object.keys(PROJECTS) : [resolved];

  const apps = {};
  for (const name of names) {
    const project = PROJECTS[name];
    if (!project) {
      console.warn(`Progetto sconosciuto: "${name}", salto.`);
      continue;
    }
    apps[name] = await checkProject(name, project);
  }

  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), apps }, null, 2));

  const totalChecks = Object.values(apps).reduce((n, a) => n + a.checks.length, 0);
  const failedChecks = Object.values(apps).reduce((n, a) => n + a.checks.filter((c) => c.kind === "FAIL").length, 0);
  const infraChecks = Object.values(apps).reduce((n, a) => n + a.checks.filter((c) => c.kind === "INFRA_ERROR").length, 0);
  console.log(`API Doctor: ${totalChecks} endpoint controllati — ${failedChecks} FAIL, ${infraChecks} INFRA_ERROR.`);

  // Solo un FAIL vero fa fallire il job (e quindi notifica su Telegram, vedi
  // full-check.yml). Un INFRA_ERROR puro NON lo fa fallire: resta visibile
  // nel riepilogo di questo run per chi vuole controllarlo, ma non genera un
  // falso allarme — vedi il commento in testa al file.
  if (failedChecks > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("api-doctor/engine.mjs: errore inatteso:", e.message);
  process.exit(1);
});
