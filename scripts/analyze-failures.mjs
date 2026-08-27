#!/usr/bin/env node
// Analizza i test falliti di un run con Claude (Sonnet 5): causa probabile,
// severità, e correlazione tra fallimenti con lo stesso pattern. NON
// controlla il browser, NON sostituisce Playwright — legge solo dati già
// raccolti da reports/results.json e produce reports/ai-analysis.json, che
// write-summary.mjs incorpora nel riepilogo se presente.
//
// Deterministico nella FORMA (output validato contro uno schema Zod), non
// nel CONTENUTO (resta un'interpretazione del modello — il messaggio
// d'errore originale di Playwright compare sempre accanto, mai sostituito).
//
// Zero chiamate se non ci sono fallimenti (il caso più comune). Nessun
// errore qui blocca il run: se manca la chiave o la chiamata fallisce, si
// registra un avviso e si esce senza rompere la pipeline — l'analisi AI è
// un arricchimento, non un requisito.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { collectFailures } from "./lib/results.mjs";

const RESULTS_PATH = "reports/results.json";
const OUTPUT_PATH = "reports/ai-analysis.json";
const MODEL = "claude-sonnet-5";
const MAX_ERROR_CHARS_FOR_PROMPT = 1200;

const AnalysisSchema = z.object({
  analyses: z.array(
    z.object({
      key: z.string().describe("La stessa chiave 'key' del fallimento a cui questa analisi si riferisce"),
      probable_cause: z.string().describe("Causa probabile in 1-2 frasi, in italiano"),
      confidence: z.number().min(0).max(100).describe("Quanto sei sicuro della diagnosi, 0-100"),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      pattern_group: z
        .string()
        .nullable()
        .describe(
          "Se questo fallimento condivide probabilmente la stessa causa radice di altri nel batch, un'etichetta breve comune (es. 'race-condition-supabase'); altrimenti null"
        ),
    })
  ),
});

const SYSTEM_PROMPT = `Sei un assistente di triage per una suite di test Playwright (QA Agent) che
verifica tre app web reali: CineFighi (multiutente, backend Supabase
condiviso), CineTracker (single-user, Supabase personale), Spot (guida di
viaggio, nessun backend, dati sempre mockati).

Ricevi un batch di test FALLITI dallo stesso run, ciascuno con titolo, file,
progetto (nome-app-mobile/desktop) e messaggio d'errore originale di
Playwright. Per ognuno, in italiano:
- indica la causa probabile in 1-2 frasi, basandoti SOLO sul messaggio
  d'errore fornito (non inventare dettagli che non puoi dedurre da lì);
- una confidence 0-100 su quanto sei sicuro;
- una severity: HIGH se sembra un comportamento reale dell'app diverso da
  quanto atteso, MEDIUM se è ambiguo, LOW se sembra quasi certamente un
  problema nel test stesso (selettore ambiguo, timing, assunzione errata)
  piuttosto che nell'app;
- se più fallimenti nel batch sembrano condividere la stessa causa radice
  (stesso errore, stessa app, stesso tipo di problema), assegna loro lo
  STESSO pattern_group (una breve etichetta a tua scelta); altrimenti null.

Rispondi SOLO con l'analisi strutturata richiesta, un elemento per ogni
fallimento ricevuto, usando la stessa "key" per farli combaciare.`;

async function main() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.warn(`Nessun ${RESULTS_PATH} trovato: nulla da analizzare.`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  // Esclude i fallimenti classificati INFRA_ERROR (browser/rete del runner,
  // vedi classifyFailure in lib/results.mjs): non c'è nulla da diagnosticare
  // sull'app se il problema è che il browser è crashato, e chiederlo a
  // Claude sarebbe solo una chiamata sprecata.
  const failures = collectFailures(data.suites || []).filter((f) => f.kind === "FAIL");

  if (failures.length === 0) {
    console.log("Nessun test fallito per un motivo diverso da INFRA_ERROR: nessuna chiamata a Claude (costo zero).");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY non impostata: salto l'analisi AI (il riepilogo resta comunque completo con i dati Playwright)."
    );
    return;
  }

  try {
    await analyze(failures);
  } catch (e) {
    console.warn("Analisi Claude fallita, proseguo senza:", e.message);
  }
}

async function analyze(failures) {
  const client = new Anthropic();

  const payload = failures.map((f) => ({
    key: f.key,
    title: f.title,
    app: f.app,
    project: f.project,
    error: f.error.length > MAX_ERROR_CHARS_FOR_PROMPT ? `${f.error.slice(0, MAX_ERROR_CHARS_FOR_PROMPT)}…` : f.error,
  }));

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Ecco i ${payload.length} test falliti in questo run:\n\n${JSON.stringify(payload, null, 2)}`,
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
    `Analisi Claude completata per ${response.parsed_output.analyses.length}/${failures.length} fallimenti ` +
      `(modello ${MODEL}, ${response.usage.input_tokens} token input, ${response.usage.output_tokens} token output).`
  );
}

main().catch((e) => {
  // Non fatale per design: l'analisi AI è un arricchimento, mai un requisito
  // per completare il run.
  console.warn("scripts/analyze-failures.mjs: errore inatteso, proseguo senza analisi:", e.message);
});

