#!/usr/bin/env node
// AI Incident Analyzer: a differenza degli analyze.mjs dei singoli agenti
// (health/analyze.mjs, perf/analyze.mjs, api-doctor/analyze.mjs,
// scale/analyze.mjs, scripts/analyze-failures.mjs — ognuno interpreta SOLO i
// propri dati), questo legge i cinque report insieme e cerca una
// correlazione tra loro: es. QA e API Doctor falliscono ma Data Health è
// pulito → il problema è probabilmente nell'API esterna, non nel database.
// Nessuno dei cinque agenti, da solo, può vedere questo tipo di segnale
// incrociato.
//
// Chiamato solo dal job `notify` di full-check.yml, solo quando almeno un
// agente è fallito (vedi la condizione `if` del job). Zero chiamate se,
// nonostante questo, tutti e cinque i report risultano PASS (difesa in
// più, stesso principio "costo zero quando non serve" degli altri
// analyze.mjs). Nessun errore qui blocca il run: se manca la chiave o la
// chiamata fallisce, si registra un avviso e si esce senza rompere la
// pipeline — l'analisi AI è un arricchimento, mai un requisito.
//
// Scrive due file:
// - reports/incident-analysis.json: l'analisi strutturata completa
// - reports/incident-summary.txt: 4-5 righe di testo semplice (già escapato
//   per HTML), pronte da accodare al messaggio Telegram esistente

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { collectFailures, cleanError } from "../scripts/lib/results.mjs";

const PATHS = {
  qa: "reports/results.json",
  health: "reports/health-results.json",
  performance: "reports/perf-results.json",
  apiDoctor: "reports/api-doctor-results.json",
  scale: "reports/scale-results.json",
};
const ANALYSIS_OUTPUT_PATH = "reports/incident-analysis.json";
const SUMMARY_OUTPUT_PATH = "reports/incident-summary.txt";
const MODEL = "claude-sonnet-5";
const MAX_ERROR_CHARS = 300;

const SEVERITY_LABEL = { LOW: "BASSA", MEDIUM: "MEDIA", HIGH: "ALTA" };

const IncidentSchema = z.object({
  summary: z.string().describe("Cosa è successo, in una frase breve, in italiano, senza markup"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  probable_cause: z
    .string()
    .describe(
      "Causa probabile più verosimile, ottenuta CORRELANDO i segnali dei cinque agenti " +
        "(es. se QA e API Doctor falliscono ma Data Health è pulito, il problema è probabilmente " +
        "nell'API esterna, non nel database) — 1-3 frasi, in italiano, senza markup"
    ),
  what_to_check: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("2-4 azioni concrete e brevi su cosa controllare per primo, in italiano, senza markup"),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "Quanto sei sicuro della diagnosi, 0-100 — usa un valore basso se i segnali sono insufficienti " +
        "o contraddittori, non forzare mai una diagnosi sicura quando i dati non bastano"
    ),
});

const SYSTEM_PROMPT = `Sei un assistente di incident response per un sistema di monitoraggio
composto da cinque agenti indipendenti, eseguiti in sequenza:
- qa: Playwright, simula utenti reali (flussi, offline, errori JS) su
  CineFighi, CineTracker e Spot
- health: integrità dati e raggiungibilità di Supabase, sulle stesse tre app
- performance: Lighthouse (performance, accessibilità, SEO, best practices),
  sulle stesse tre app
- apiDoctor: raggiungibilità e correttezza delle API esterne (TMDB, meteo),
  sulle stesse tre app
- scale: SOLO CineFighi — testa se il rendering client-side regge quando la
  libreria condivisa cresce (simula "titoli reali oggi + 1000", mockati,
  mai scritti sul database vero); un FAIL qui è un problema di scalabilità
  del client, non di rete o di dati — non correlarlo automaticamente con
  api-doctor o health a meno che i dati non lo suggeriscano davvero

Ricevi lo stato di tutte e tre le app per ognuno degli agenti in questo
run (scale solo per CineFighi) — non solo quelli falliti: un agente "PASS"
è un segnale importante quanto uno "FAIL", perché aiuta a escludere delle
cause. Il tuo compito è correlare i cinque segnali per capire cosa è
successo davvero, non ripetere quello che ogni agente ha già detto per
conto suo.

Esempio del tipo di ragionamento richiesto: se "qa" fallisce con un errore
HTTP 500 su un'azione, "apiDoctor" segnala un tasso di errore alto sulla
stessa API esterna, ma "health" è PASS su quell'app — la causa probabile è
l'API esterna, non il database, anche se il sintomo iniziale (il test QA)
sembrava un problema dell'app stessa.

Rispondi in italiano, breve (il risultato finisce in un messaggio Telegram):
una frase di riepilogo, una severity, una causa probabile basata SOLO sui
dati forniti (non inventare dettagli), 2-4 cose concrete da controllare per
prime. Se i cinque segnali non bastano per una diagnosi chiara, dillo
onestamente con una confidence bassa invece di inventare una causa
plausibile ma non supportata dai dati.`;

function readJson(path) {
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch (e) {
    console.warn(`incident/analyze.mjs: ${path} non è JSON valido, lo tratto come assente:`, e.message);
    return null;
  }
}

// health/perf/api-doctor condividono la stessa forma { apps: { nome: { result, ... } } }.
// Per le app PASS teniamo solo "PASS" (il dettaglio non serve, il segnale è
// già completo): tiene il prompt compatto e il costo basso.
function summarizeAgentApps(data, extractDetail) {
  if (!data) return null;
  const out = {};
  for (const [name, a] of Object.entries(data.apps || {})) {
    out[name] = a.result === "PASS" ? "PASS" : { result: a.result, ...extractDetail(a) };
  }
  return out;
}

function summarizeQA(data) {
  if (!data) return null;
  const failures = collectFailures(data.suites || []);
  if (failures.length === 0) return "PASS";
  const byApp = {};
  for (const f of failures) {
    byApp[f.app] = byApp[f.app] || [];
    byApp[f.app].push({ title: f.title, error: cleanError(f.error, MAX_ERROR_CHARS) });
  }
  return byApp;
}

// I cinque summarizer sopra non condividono una forma unica: qa ritorna la
// stringa "PASS" o un oggetto per-app SOLO quando ci sono fallimenti;
// health/performance/apiDoctor/scale ritornano SEMPRE un oggetto per-app
// (scale con la sola chiave "cinefighi"), dove ogni valore è "PASS" o un
// dettaglio. null significa report assente.
function isAgentAllPass(summary) {
  if (summary === null || summary === "PASS") return true;
  if (typeof summary === "object") return Object.values(summary).every((v) => v === "PASS");
  return true;
}

function anyFailure(...summaries) {
  return summaries.some((s) => !isAgentAllPass(s));
}

function buildPayload() {
  const qaData = readJson(PATHS.qa);
  const healthData = readJson(PATHS.health);
  const perfData = readJson(PATHS.performance);
  const apiDoctorData = readJson(PATHS.apiDoctor);
  const scaleData = readJson(PATHS.scale);

  const qa = summarizeQA(qaData);
  const health = summarizeAgentApps(healthData, (a) => ({ issues: a.data?.issues ?? [] }));
  const performance = summarizeAgentApps(perfData, (a) =>
    a.error ? { error: a.error } : { scores: a.scores, thresholds: a.thresholds }
  );
  const apiDoctor = summarizeAgentApps(apiDoctorData, (a) => ({
    failedChecks: (a.checks || [])
      .filter((c) => !c.ok)
      .map((c) => ({ name: c.name, endpoint: c.endpoint, status: c.status, reason: c.reason })),
  }));
  const scale = summarizeAgentApps(scaleData, (a) =>
    a.error
      ? { error: a.error }
      : {
          realCount: a.realCount,
          targetCount: a.targetCount,
          failedChecks: (a.checks || []).filter((c) => c.status !== "PASS"),
        }
  );

  return { qa, health, performance, apiDoctor, scale };
}

function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function writeSummaryText(result) {
  const lines = [
    `Diagnosi: ${escapeHtml(result.summary)}`,
    `Gravità: ${SEVERITY_LABEL[result.severity]} (confidenza ${result.confidence}%)`,
    `Causa probabile: ${escapeHtml(result.probable_cause)}`,
    "Da controllare:",
    ...result.what_to_check.map((c) => `- ${escapeHtml(c)}`),
  ];
  fs.writeFileSync(SUMMARY_OUTPUT_PATH, lines.join("\n"));
}

async function main() {
  const payload = buildPayload();

  if (!anyFailure(payload.qa, payload.health, payload.performance, payload.apiDoctor, payload.scale)) {
    console.log("Nessun FAIL in nessuno dei cinque report: nessuna chiamata a Claude (costo zero).");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY non impostata: salto l'incident analyzer.");
    return;
  }

  try {
    await analyze(payload);
  } catch (e) {
    console.warn("Incident analyzer fallito, proseguo senza:", e.message);
  }
}

async function analyze(payload) {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Stato dei cinque agenti in questo run:\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    output_config: { format: zodOutputFormat(IncidentSchema) },
  });

  if (!response.parsed_output) {
    console.warn("Claude non ha restituito una diagnosi valida (parsing fallito), proseguo senza.");
    return;
  }

  const result = response.parsed_output;
  fs.writeFileSync(ANALYSIS_OUTPUT_PATH, JSON.stringify(result, null, 2));
  writeSummaryText(result);
  console.log(
    `Incident analyzer completato, severity ${result.severity} ` +
      `(modello ${MODEL}, ${response.usage.input_tokens} token input, ${response.usage.output_tokens} token output).`
  );
}

main().catch((e) => {
  // Non fatale per design: l'analisi AI è un arricchimento, mai un requisito
  // per completare il run.
  console.warn("incident/analyze.mjs: errore inatteso, proseguo senza analisi:", e.message);
});
