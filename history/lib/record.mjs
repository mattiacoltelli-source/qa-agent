// Meccanismo condiviso per lo storico dei run: leggere l'ultima voce
// registrata, confrontarla con quella di oggi (differenza percentuale sopra
// soglia), e accodare la voce di oggi. Agnostico rispetto a QUALE agente lo
// usa — ogni agente ha un proprio script sottile (es. scale/history.mjs)
// che sa quali campi estrarre dal proprio report ed è l'unico a conoscere
// la forma di quel report.
//
// Un file per agente, JSONL (una riga JSON per run) invece di un unico
// array: accodare una riga produce un diff Git minimo — una riga
// aggiunta, nient'altro toccato — invece di riscrivere la parentesi di
// chiusura e aggiungere una virgola ad ogni run.

import fs from "node:fs";

const HISTORY_DIR = "history/data";

function historyPath(agent) {
  return `${HISTORY_DIR}/${agent}.jsonl`;
}

// Percorre le righe dalla più recente alla meno recente e ritorna la prima
// che soddisfa `filter` — di norma "true" (l'ultima riga in assoluto), ma
// per un agente con più app (Performance, Data Health) serve l'ultima riga
// DI QUELLA APP, non l'ultima riga del file. Una riga corrotta (troncata da
// un crash a metà scrittura, mai osservato ma non impossibile) viene
// saltata invece di far fallire la lettura di tutte le altre.
export function readLastEntry(agent, filter = () => true) {
  const path = historyPath(agent);
  if (!fs.existsSync(path)) return null;
  const lines = fs.readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (filter(entry)) return entry;
    } catch {
      /* riga corrotta: salta, non blocca la lettura delle altre */
    }
  }
  return null;
}

export function appendEntry(agent, entry) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.appendFileSync(historyPath(agent), JSON.stringify(entry) + "\n");
}

// Confronto generico a percentuale — adatto a metriche continue (tempi,
// conteggi che crescono gradualmente). NON adatto a metriche vicine allo
// zero (una vulnerabilità che passa da 0 a 1 è "+Infinity%", inutile) —
// per quei casi ogni agente scrive la propria piccola regola invece di
// forzarla dentro questa funzione (vedi security/history.mjs).
//
// sameConditionCheck: opzionale — se fornita e ritorna false, il confronto
// viene saltato invece di produrre un numero fuorviante (es. Scale Agent
// lanciato con un extra di titoli diverso dall'ultima volta: i tempi non
// sono confrontabili, non è un peggioramento vero).
export function computeDeltas(previous, current, metricKeys, { thresholdPct = 20, sameConditionCheck } = {}) {
  if (!previous) return { skipped: "no-previous-run", deltas: [] };
  if (sameConditionCheck && !sameConditionCheck(previous, current)) {
    return { skipped: "different-conditions", deltas: [] };
  }
  const deltas = [];
  for (const key of metricKeys) {
    const prevVal = previous[key];
    const curVal = current[key];
    if (typeof prevVal !== "number" || typeof curVal !== "number" || prevVal === 0) continue;
    const deltaPct = Math.round(((curVal - prevVal) / prevVal) * 100);
    if (Math.abs(deltaPct) >= thresholdPct) {
      deltas.push({ metric: key, previous: prevVal, current: curVal, deltaPct });
    }
  }
  return { skipped: null, deltas };
}
