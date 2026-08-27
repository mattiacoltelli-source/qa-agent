#!/usr/bin/env node
// Analizza con Claude (Sonnet 5) SOLO gli endpoint in FAIL VERO — stesso
// pattern di health/analyze.mjs e perf/analyze.mjs. Zero chiamate se tutto è
// PASS (il caso più comune) o se gli unici problemi sono INFRA_ERROR (la
// richiesta non è nemmeno arrivata a destinazione — non c'è nulla da
// diagnosticare sull'API, vedi api-doctor/engine.mjs). Riceve endpoint,
// richiesta, status, errore e un pezzo della risposta grezza (mai la
// api_key, redatta a monte in api-doctor/lib/http.mjs), interpreta — non
// ricalcola nulla di deterministico. Non blocca mai il run.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const RESULTS_PATH = "reports/api-doctor-results.json";
const OUTPUT_PATH = "reports/api-doctor-ai-analysis.json";
const MODEL = "claude-sonnet-5";

const AnalysisSchema = z.object({
  analyses: z.array(
    z.object({
      key: z.string().describe("Identificatore univoco 'app::nome_check', per far combaciare l'analisi al controllo giusto"),
      probable_cause: z.string().describe("Causa probabile del fallimento, in 1-2 frasi, in italiano"),
      suggested_fix: z.string().describe("Un fix concreto e pratico da provare, in italiano"),
    })
  ),
});

const SYSTEM_PROMPT = `Sei un assistente di triage per un controllo automatico delle API esterne
usate da tre app web reali: CineFighi e CineTracker (entrambe TMDB, con
chiavi API diverse tra loro) e Spot (Open-Meteo, Open-Meteo Marine,
sunrise-sunset.org — nessuna chiave).

Ricevi, per ogni endpoint in FAIL, endpoint (con eventuale api_key già
oscurata), metodo, status HTTP, il motivo del fallimento già determinato
da codice deterministico, ed eventualmente un pezzo del corpo grezzo della
risposta. NON devi rivalutare se è davvero un fallimento: lo è già,
per certo. Il tuo compito, in italiano:
- causa probabile in 1-2 frasi (es. chiave scaduta/revocata, rate limit,
  l'API ha cambiato formato risposta, servizio esterno down, timeout di
  rete);
- un fix concreto: dove guardare o cosa provare per primo.`;

async function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da analizzare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const failedByKey = [];
  for (const [appName, app] of Object.entries(data.apps || {})) {
    for (const check of app.checks) {
      if (check.kind === "FAIL") failedByKey.push({ appName, label: app.label, check });
    }
  }

  if (failedByKey.length === 0) {
    console.log("Nessun FAIL vero (solo PASS e/o INFRA_ERROR): nessuna chiamata a Claude (costo zero).");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY non impostata: salto l'analisi AI (il riepilogo resta comunque completo con i dati deterministici)."
    );
    return;
  }

  try {
    await analyze(failedByKey);
  } catch (e) {
    console.warn("Analisi Claude fallita, proseguo senza:", e.message);
  }
}

async function analyze(failedByKey) {
  const client = new Anthropic();

  const payload = failedByKey.map(({ appName, label, check }) => ({
    key: `${appName}::${check.name}`,
    app: label,
    endpoint: check.endpoint,
    method: check.method,
    status: check.status,
    reason: check.reason,
    bodySnippet: check.bodySnippet,
  }));

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Ecco i ${payload.length} endpoint in FAIL in questo run:\n\n${JSON.stringify(payload, null, 2)}`,
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
    `Analisi Claude completata per ${response.parsed_output.analyses.length}/${failedByKey.length} endpoint ` +
      `(modello ${MODEL}, ${response.usage.input_tokens} token input, ${response.usage.output_tokens} token output).`
  );
}

main().catch((e) => {
  console.warn("api-doctor/analyze.mjs: errore inatteso, proseguo senza analisi:", e.message);
});
