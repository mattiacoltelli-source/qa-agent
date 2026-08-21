#!/usr/bin/env node
// Analizza con Claude (Sonnet 5) SOLO le app in WARN/FAIL di un run —
// stesso pattern di health/analyze.mjs e scripts/analyze-failures.mjs.
// Zero chiamate se tutte le app sono PASS. Riceve i punteggi Lighthouse già
// calcolati e i "top audit" già estratti da Lighthouse stesso (mai
// ricalcolati o inventati da Claude), li traduce in una spiegazione breve
// più una priorità. Non blocca mai il run se la chiave manca o la chiamata
// fallisce.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const RESULTS_PATH = "reports/perf-results.json";
const OUTPUT_PATH = "reports/perf-ai-analysis.json";
const MODEL = "claude-sonnet-5";

const AnalysisSchema = z.object({
  analyses: z.array(
    z.object({
      app: z.string().describe("Chiave dell'app, la stessa presente in apps nel report"),
      summary: z.string().describe("Spiegazione in 1-2 frasi, in italiano, di cosa sta abbassando il punteggio"),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Quanto vale la pena intervenire subito"),
      first_fix: z.string().describe("Il primo intervento suggerito, breve e concreto, in italiano"),
    })
  ),
});

const SYSTEM_PROMPT = `Sei un assistente di triage per un controllo automatico di performance
(Performance Agent, basato su Google Lighthouse) su tre PWA reali:
CineFighi, CineTracker, Spot — usate principalmente da telefono.

Ricevi, per ogni app in WARN o FAIL, i punteggi Lighthouse (0-100) per
performance/accessibility/best-practices/seo, le soglie usate (permissive
per design, in fase di taratura), e i principali audit già individuati da
Lighthouse stesso come punti deboli (NON li devi inventare, sono già lì).
Il tuo compito è, in italiano:
- riassumere in 1-2 frasi cosa sta abbassando il punteggio, basandoti sugli
  audit forniti;
- una priorità: HIGH se il punteggio è molto sotto soglia o riguarda
  l'esperienza reale su mobile, MEDIUM se è borderline, LOW se è marginale
  o probabilmente dovuto a soglie ancora larghe;
- il primo intervento concreto da provare, breve.`;

async function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da analizzare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const toAnalyze = Object.entries(data.apps || {}).filter(([, a]) => a.result !== "PASS");

  if (toAnalyze.length === 0) {
    console.log("Tutte le app controllate sono PASS: nessuna chiamata a Claude (costo zero).");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY non impostata: salto l'analisi AI (il riepilogo resta comunque completo con i dati deterministici)."
    );
    return;
  }

  try {
    await analyze(toAnalyze);
  } catch (e) {
    console.warn("Analisi Claude fallita, proseguo senza:", e.message);
  }
}

async function analyze(toAnalyze) {
  const client = new Anthropic();

  const payload = toAnalyze.map(([name, a]) => ({
    app: name,
    label: a.label,
    result: a.result,
    scores: a.scores ?? null,
    thresholds: a.thresholds ?? null,
    topAudits: a.topAudits ?? [],
    error: a.error ?? null,
  }));

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Ecco le ${payload.length} app in WARN/FAIL in questo run:\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  });

  if (!response.parsed_output) {
    console.warn("Claude non ha restituito un'analisi valida (parsing fallito), proseguo senza.");
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(response.parsed_output.analyses, null, 2));
  console.log(
    `Analisi Claude completata per ${response.parsed_output.analyses.length}/${toAnalyze.length} app ` +
      `(modello ${MODEL}, ${response.usage.input_tokens} token input, ${response.usage.output_tokens} token output).`
  );
}

main().catch((e) => {
  console.warn("perf/analyze.mjs: errore inatteso, proseguo senza analisi:", e.message);
});
