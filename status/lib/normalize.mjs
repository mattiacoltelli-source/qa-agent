// Logica pura dietro `status/build-status.mjs`: tradurre il report di un
// agente nella forma comune pubblicata in `status/<agente>.json`, e fondere
// quella forma con lo stato già presente nel repo.
//
// Nessuna I/O qui dentro (la fa lo script sottile che importa questo
// modulo): sono funzioni da dato a dato, quindi testabili senza filesystem
// né rete — stessa divisione già in uso in api-doctor/lib, scale/lib,
// security/lib.
//
// IMPORTANTE: nessuna di queste funzioni decide PASS/FAIL. Il giudizio è
// già stato dato dall'agente nel proprio report; qui si riduce soltanto
// all'essenziale e si traduce in un vocabolario unico.

import { cleanError } from "../../scripts/lib/results.mjs";

// Chiavi canoniche esposte all'esterno. Dentro il repo l'app che l'utente
// chiama "Spot" è storicamente `vacanza` (nome della cartella
// apps/vacanza): la traduzione avviene qui, una volta sola, così il
// contratto pubblico non eredita un nome che non significa più nulla.
const CANONICAL_APP = { vacanza: "spot" };

export function canonical(name) {
  return CANONICAL_APP[name] ?? name;
}

export function truncate(text, max = 200) {
  if (text == null || text === "") return "";
  const plain = String(text).replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

// ─── Lettori per agente ──────────────────────────────────────────────────
// Ognuno conosce SOLO la forma del report del proprio agente e ritorna
// { generatedAt, apps: { <chiave app>: { result, summary, metrics, problems[] } } },
// oppure null se il report non contiene niente di pubblicabile.

function readQa(data) {
  // Playwright raggruppa per progetto (cinetracker-mobile, cinetracker-desktop,
  // …): qui si torna alla app, che è come l'utente pensa al risultato.
  const byApp = new Map();

  for (const suite of flattenSuites(data.suites ?? [])) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const app = canonical(String(test.projectName ?? "").split("-")[0]);
        if (!app) continue;
        if (!byApp.has(app)) byApp.set(app, { passed: 0, failed: 0, flaky: 0, skipped: 0, problems: [] });
        const bucket = byApp.get(app);

        if (test.status === "expected") bucket.passed++;
        else if (test.status === "skipped") bucket.skipped++;
        else if (test.status === "flaky") {
          bucket.flaky++;
          bucket.passed++; // un flaky è comunque passato al retry
        } else if (test.status === "unexpected") {
          bucket.failed++;
          const last = test.results?.[test.results.length - 1];
          bucket.problems.push({
            severity: "HIGH",
            // cleanError toglie i codici colore ANSI che Playwright lascia
            // nel messaggio; truncate appiattisce il resto su una riga sola.
            message: `Test fallito: ${spec.title} — ${truncate(cleanError(last?.errors?.[0]?.message), 160)}`,
          });
        }
      }
    }
  }

  if (byApp.size === 0) return null;

  const apps = {};
  for (const [app, b] of byApp) {
    apps[app] = {
      result: b.failed > 0 ? "FAIL" : "PASS",
      summary: `${b.passed} passati · ${b.failed} falliti${b.flaky ? ` · ${b.flaky} flaky` : ""}`,
      metrics: { passed: b.passed, failed: b.failed, flaky: b.flaky, skipped: b.skipped },
      problems: b.problems.slice(0, 5),
    };
  }

  // Playwright registra l'inizio del run, non la scrittura del report: è
  // comunque il momento in cui i test hanno guardato le app, che è ciò che
  // interessa a chi legge "quanto è vecchio questo esito".
  return { generatedAt: data.stats?.startTime ?? null, apps };
}

// I risultati Playwright sono annidati in un albero di suite: appiattirlo
// qui evita di ripetere la ricorsione dentro readQa.
function flattenSuites(suites, out = []) {
  for (const suite of suites) {
    out.push(suite);
    if (suite.suites) flattenSuites(suite.suites, out);
  }
  return out;
}

function readDataHealth(data) {
  const apps = {};
  for (const [name, app] of Object.entries(data.apps ?? {})) {
    const issues = app.data?.issues ?? [];
    const problems = issues.map((i) => ({
      severity: i.severity ?? "MEDIUM",
      message: `${i.type}${i.count ? ` (${i.count})` : ""}: ${truncate(i.examples?.[0], 140)}`,
    }));
    // L'irraggiungibilità viene prima di qualunque anomalia sui dati: se il
    // sito non risponde, è quello il problema da leggere per primo.
    if (!app.uptime?.ok) {
      problems.unshift({
        severity: "HIGH",
        message: `Sito irraggiungibile: ${truncate(app.uptime?.reason ?? app.uptime?.status ?? "nessuna risposta", 120)}`,
      });
    }

    apps[canonical(name)] = {
      result: app.result,
      summary: app.uptime?.ok ? `Online · ${issues.length} anomalie` : "Irraggiungibile",
      metrics: app.data?.counts ?? {},
      problems: problems.slice(0, 5),
    };
  }
  return Object.keys(apps).length ? { generatedAt: data.generatedAt, apps } : null;
}

function readPerformance(data) {
  const apps = {};
  for (const [name, app] of Object.entries(data.apps ?? {})) {
    apps[canonical(name)] = app.error
      ? {
          result: app.result,
          summary: "Lighthouse non eseguito",
          metrics: {},
          problems: [{ severity: "MEDIUM", message: truncate(app.error, 160) }],
        }
      : {
          result: app.result,
          summary: `Perf ${app.scores?.performance} · A11y ${app.scores?.accessibility}`,
          metrics: app.scores ?? {},
          problems:
            app.result === "PASS"
              ? []
              : [{ severity: app.result === "FAIL" ? "HIGH" : "MEDIUM", message: `Punteggi Lighthouse sotto soglia (${app.result})` }],
        };
  }
  return Object.keys(apps).length ? { generatedAt: data.generatedAt, apps } : null;
}

function readApiDoctor(data) {
  const apps = {};
  for (const [name, app] of Object.entries(data.apps ?? {})) {
    const checks = app.checks ?? [];
    const broken = checks.filter((c) => !c.ok);
    apps[canonical(name)] = {
      result: app.result,
      summary: `${checks.length - broken.length}/${checks.length} endpoint ok`,
      metrics: { total: checks.length, failed: broken.length },
      // Un INFRA_ERROR è la richiesta che non è mai arrivata a destinazione:
      // non dice nulla sull'API, quindi non merita la stessa severità di un
      // endpoint che risponde male davvero.
      problems: broken.slice(0, 5).map((c) => ({
        severity: c.kind === "INFRA_ERROR" ? "LOW" : "HIGH",
        message: `${c.name}: ${c.kind}${c.status ? ` (HTTP ${c.status})` : ""} — ${truncate(c.reason, 120)}`,
      })),
    };
  }
  return Object.keys(apps).length ? { generatedAt: data.generatedAt, apps } : null;
}

function readSecurity(data) {
  const app = data.apps?.["qa-agent"];
  if (!app) return null;

  const c = app.counts ?? {};
  const severe = (c.critical ?? 0) + (c.high ?? 0);
  return {
    generatedAt: data.generatedAt,
    apps: {
      // Non è una delle tre app: riguarda la toolchain di qa-agent
      // stesso. Chiave a parte, così chi legge non la confonde con un
      // problema di CineTracker o di Spot.
      "qa-agent": app.error
        ? {
            result: app.result,
            summary: "npm audit non eseguito",
            metrics: {},
            problems: [{ severity: "MEDIUM", message: truncate(app.error, 160) }],
          }
        : {
            result: app.result,
            summary: `${c.total ?? 0} vulnerabilità (${c.critical ?? 0} critical, ${c.high ?? 0} high)`,
            metrics: { critical: c.critical ?? 0, high: c.high ?? 0, moderate: c.moderate ?? 0, low: c.low ?? 0, total: c.total ?? 0 },
            problems: severe > 0 ? [{ severity: "HIGH", message: `${c.critical ?? 0} critical, ${c.high ?? 0} high nelle dipendenze npm` }] : [],
          },
    },
  };
}

export const AGENTS = {
  qa: { label: "QA Agent", read: readQa },
  "data-health": { label: "Data Health Agent", read: readDataHealth },
  performance: { label: "Performance Agent", read: readPerformance },
  "api-doctor": { label: "API Doctor Agent", read: readApiDoctor },
  security: { label: "Security Agent", read: readSecurity },
};

/**
 * Fonde il report di questo run con lo stato già pubblicato.
 *
 * Merge e non sovrascrittura: un run parziale (es. "solo cinetracker")
 * aggiorna la voce di quell'app e lascia intatte le altre, ciascuna con il
 * proprio `runAt`. Sovrascrivere il file intero farebbe sparire le app non
 * incluse nel run, e chi legge le vedrebbe come "mai controllate" — cioè
 * esattamente il contrario di quello che è successo.
 */
export function mergeStatus({ agent, label, previous, report, runUrl = null, now }) {
  const apps = { ...(previous?.apps ?? {}) };
  // `generatedAt` manca solo se il report dell'agente non lo contiene (non
  // dovrebbe): meglio l'ora corrente che un `null` che a valle verrebbe
  // letto come "data sconosciuta" e mostrato come problema.
  const runAt = report.generatedAt ?? now ?? new Date().toISOString();

  for (const [name, entry] of Object.entries(report.apps)) {
    apps[name] = { ...entry, runAt, runUrl };
  }

  return { agent, label, updatedAt: runAt, apps };
}
