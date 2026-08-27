#!/usr/bin/env node
// Analizza con Claude (Sonnet 5) SOLO se il run è in WARN/FAIL — stesso
// pattern di perf/analyze.mjs, health/analyze.mjs, api-doctor/analyze.mjs,
// scale/analyze.mjs. Zero chiamate se il run è PASS. Riceve le
// vulnerabilità già estratte da `npm audit` (mai inventate o ricalcolate
// da Claude) e le traduce in una spiegazione breve più una priorità. Non
// blocca mai il run se la chiave manca o la chiamata fallisce.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const RESULTS_PATH = "reports/security-results.json";
const OUTPUT_PATH = "reports/security-ai-analysis.json";
const MODEL = "claude-sonnet-5";

const AnalysisSchema = z.object({
  summary: z.string().describe("Spiegazione in 1-2 frasi, in italiano, di quali pacchetti sono vulnerabili e perché"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Quanto vale la pena intervenire subito"),
  first_fix: z.string().describe("Il primo intervento suggerito, breve e concreto, in italiano"),
});

const SYSTEM_PROMPT = `Sei un assistente di triage per uno Security Agent automatico: controlla le
dipendenze npm di qa-agent stesso (una suite Playwright che gira in CI con
accesso a secret reali — chiave Anthropic, token Telegram, push su
GitHub) tramite \`npm audit\`.

Ricevi l'elenco delle vulnerabilità trovate (nome pacchetto, severity,
se è una dipendenza diretta o transitiva, se un fix è già disponibile via
npm, e gli advisory con titolo/URL quando presenti — NON li devi inventare,
sono già lì). Il tuo compito è, in italiano:
- riassumere in 1-2 frasi quali pacchetti sono coinvolti e il tipo di
  rischio (usa gli advisory forniti, non generalizzare se il dettaglio
  c'è);
- una priorità: HIGH se la vulnerabilità è high/critical o riguarda una
  dipendenza diretta (usata attivamente dal codice, non solo transitiva),
  MEDIUM se è moderate o transitiva ma senza fix disponibile, LOW se un
  fix automatico è già disponibile e la severity non è alta;
- il primo intervento concreto: se \`fixAvailable\` è valorizzato, di norma
  è \`npm audit fix\` (menzionalo esplicitamente); altrimenti indica cosa
  controllare (es. se serve un aggiornamento manuale o non esiste ancora
  un fix a monte).`;

async function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da analizzare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  const app = data.apps?.["qa-agent"];

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
    counts: app.counts ?? null,
    vulnerabilities: app.vulnerabilities ?? [],
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
  console.warn("security/analyze.mjs: errore inatteso, proseguo senza analisi:", e.message);
});
