#!/usr/bin/env node
// Analizza con Claude (Sonnet 5) SOLO le app in WARN/FAIL di un run — stesso
// pattern di scripts/analyze-failures.mjs (QA Agent). Zero chiamate se tutte
// le app sono PASS (il caso più comune). Deterministico nella FORMA (output
// validato con Zod), non nel CONTENUTO: i conteggi e le anomalie restano
// sempre quelli calcolati da health/engine.mjs, mai ricalcolati o messi in
// dubbio da Claude. Nessun errore qui blocca il run: se la chiave manca o la
// chiamata fallisce, si registra un avviso e si esce senza rompere la
// pipeline — l'analisi AI è un arricchimento, non un requisito.

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const RESULTS_PATH = "reports/health-results.json";
const OUTPUT_PATH = "reports/health-ai-analysis.json";
const MODEL = "claude-sonnet-5";

const AnalysisSchema = z.object({
  analyses: z.array(
    z.object({
      app: z.string().describe("Chiave dell'app (es. 'cinefighi'), la stessa presente in apps nel report"),
      probable_cause: z.string().describe("Causa probabile in 1-2 frasi, in italiano"),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      where_to_investigate: z.string().describe("Un suggerimento pratico e breve su dove guardare, in italiano"),
    })
  ),
});

const SYSTEM_PROMPT = `Sei un assistente di triage per un controllo automatico di salute dati
(Data Health Agent) su due app web reali con backend Supabase: CineFighi
(multiutente, tabelle users/titles/votes) e CineTracker (single-user,
tabella Coltel).

Ricevi, per ogni app in WARN o FAIL, i conteggi delle righe e un elenco di
anomalie già rilevate deterministicamente da codice (non da te): voti o
righe orfane, duplicati, dati incoerenti tra colonne. NON devi ricalcolare o
mettere in dubbio questi numeri: sono già certi, il tuo compito è solo
interpretarli, in italiano:
- causa probabile in 1-2 frasi, basandoti SOLO sui dati forniti;
- una severity: HIGH se l'anomalia rischia di significare dati reali persi
  o corrotti, MEDIUM se è un'inconsistenza da tenere d'occhio ma non
  urgente, LOW se sembra un effetto collaterale innocuo o un residuo atteso
  (es. un voto di un utente rimosso dal gruppo, comportamento noto);
- un suggerimento pratico e breve su dove guardare per primo.

Rispondi con un elemento per ogni app ricevuta, usando la stessa "app" per
farli combaciare.`;

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
    uptime: a.uptime,
    counts: a.data?.counts ?? null,
    issues: a.data?.issues ?? [],
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
  // Non fatale per design: l'analisi AI è un arricchimento, mai un requisito
  // per completare il run.
  console.warn("health/analyze.mjs: errore inatteso, proseguo senza analisi:", e.message);
});
