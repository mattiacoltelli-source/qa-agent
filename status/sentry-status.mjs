#!/usr/bin/env node
// Legge le issue aperte su Sentry nelle ultime 24 ore e le pubblica in
// `status/sentry.json`, nello stesso formato degli altri sei agenti.
//
// Perché sta qui e non nella dashboard: leggere le issue richiede un token
// Sentry in LETTURA, e la dashboard è una pagina statica pubblica. Un
// token lì sarebbe leggibile da chiunque. Questo script gira invece dentro
// GitHub Actions, dove il token è un secret, e lascia sul repo solo il
// risultato — nessuna credenziale attraversa il confine.
//
// È lo stesso schema già in uso per gli altri agenti: chi ha le
// credenziali produce un file, chi non le ha lo legge.
//
// Non fa mai fallire il run. Se il secret manca (come all'inizio), lo dice
// e esce: a valle la dashboard mostrerà "sconosciuto" per gli errori,
// che è la verità.
//
// Richiede SENTRY_AUTH_TOKEN (scope: project:read, event:read).

import fs from "node:fs";
import { PROGETTI, riassumiProgetto } from "./lib/sentry.mjs";

const ORG = "mattia-e5";
// L'organizzazione ha residenza dati in Europa: l'API sta su de.sentry.io,
// non su sentry.io. Chiamare il dominio sbagliato risponde 404 senza
// spiegare perché.
const API = "https://de.sentry.io/api/0";
const OUTPUT = "status/sentry.json";

async function issueDelProgetto(slug, token) {
  const url = `${API}/projects/${ORG}/${slug}/issues/?statsPeriod=24h&query=${encodeURIComponent("is:unresolved")}&limit=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 404) {
    console.warn(`Progetto Sentry "${slug}" inesistente o non accessibile col token: saltato.`);
    return null;
  }
  if (!res.ok) throw new Error(`Sentry ${slug}: HTTP ${res.status}`);
  return res.json();
}

function runUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  const id = process.env.GITHUB_RUN_ID;
  return repo && id ? `https://github.com/${repo}/actions/runs/${id}` : null;
}

async function main() {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) {
    console.log("SENTRY_AUTH_TOKEN non configurato nei secret del repo: nessuno stato errori pubblicato.");
    return;
  }

  const runAt = new Date().toISOString();
  const url = runUrl();
  const apps = {};

  for (const [slug, app] of Object.entries(PROGETTI)) {
    try {
      const issues = await issueDelProgetto(slug, token);
      const riassunto = riassumiProgetto(issues);
      if (riassunto) apps[app] = { ...riassunto, runAt, runUrl: url };
    } catch (e) {
      // Un progetto irraggiungibile non deve far sparire gli altri: si
      // salta quello e si prosegue. Meglio cinque app su sei che nessuna.
      console.warn(`Sentry "${slug}": ${e.message} — saltato.`);
    }
  }

  if (Object.keys(apps).length === 0) {
    console.warn("Nessun progetto Sentry leggibile: niente da pubblicare.");
    return;
  }

  fs.mkdirSync("status", { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify({ agent: "sentry", label: "Errori (Sentry)", updatedAt: runAt, apps }, null, 2)}\n`);
  console.log(`${OUTPUT} aggiornato: ${Object.keys(apps).join(", ")}.`);
}

try {
  await main();
} catch (e) {
  console.warn("status/sentry-status.mjs: errore inatteso, proseguo senza pubblicare gli errori:", e.message);
}
