#!/usr/bin/env node
// Analizza con Claude (Sonnet 5) SOLO se il run è in WARN/FAIL — stesso
// pattern di perf/analyze.mjs, health/analyze.mjs, api-doctor/analyze.mjs.
// Zero chiamate se il run è PASS. Riceve i tempi misurati e le soglie già
// confrontate (mai ricalcolati da Claude), li traduce in una spiegazione
// breve più una priorità. Non blocca mai il run se la chiave manca o la
// chiamata fallisce.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const RESULTS_PATH = "reports/scale-results.json";
const OUTPUT_PATH = "reports/scale-ai-analysis.json";
const MODEL = "claude-sonnet-5";

const AnalysisSchema = z.object({
  summary: z.string().describe("Spiegazione in 1-2 frasi, in italiano, di cosa sta rallentando l'app a questa scala"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Quanto vale la pena intervenire subito"),
  first_fix: z.string().describe("Il primo intervento suggerito, breve e concreto, in italiano"),
});

const SYSTEM_PROMPT = `Sei un assistente di triage per uno Scale Agent automatico: testa
CineFighi (PWA di cinema multiutente, gruppo condiviso, backend Supabase)
simulando la libreria condivisa con "numero di titoli reali oggi + 1000"
titoli finti mockati lato client (mai scritti sul database vero), per
vedere se il rendering regge quando la libreria cresce.

Ricevi i tempi misurati (Home pronta, apertura Libreria, apertura
Statistiche, in millisecondi) e le soglie usate (warn/fail), più il numero
di titoli reale e quello testato. Il tuo compito è, in italiano:
- riassumere in 1-2 frasi quale schermata sta rallentando e perché,
  ragionando sull'architettura nota (Home e Libreria sono paginate/slice,
  quindi dovrebbero restare piatte al crescere di N; Statistiche invece
  ricalcola le medie su TUTTA la libreria ad ogni apertura, quindi cresce
  linearmente con N — se il problema è lì, dillo esplicitamente);
- una priorità: HIGH se un tempo supera la soglia FAIL o l'app rischia di
  apparire bloccata all'utente, MEDIUM se è in WARN ma resta usabile, LOW se
  è marginale;
- il primo intervento concreto da provare (es. cache dei calcoli, debounce,
  memoizzazione), breve.`;

async function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da analizzare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const app = data.apps?.cinefighi;

  if (!app || app.result === "PASS") {
    console.log("Run PASS (o assente): nessuna chiamata a Claude (costo zero).");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY non impostata: salto l'analisi AI (il riepilogo resta comunque completo con i dati deterministici)."
    );
    return;
  }

  try {
    await analyze(app);
  } catch (e) {
    console.warn("Analisi Claude fallita, proseguo senza:", e.message);
  }
}

async function analyze(app) {
  const client = new Anthropic();

  const payload = {
    result: app.result,
    realCount: app.realCount,
    targetCount: app.targetCount,
    metrics: app.metrics ?? null,
    checks: app.checks ?? [],
    error: app.error ?? null,
  };

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Ecco il run in ${app.result}:\n\n${JSON.stringify(payload, null, 2)}` }],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  });

  if (!response.parsed_output) {
    console.warn("Claude non ha restituito un'analisi valida (parsing fallito), proseguo senza.");
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(response.parsed_output, null, 2));
  console.log(
    `Analisi Claude completata (modello ${MODEL}, ${response.usage.input_tokens} token input, ` +
      `${response.usage.output_tokens} token output).`
  );
}

main().catch((e) => {
  console.warn("scale/analyze.mjs: errore inatteso, proseguo senza analisi:", e.message);
});
