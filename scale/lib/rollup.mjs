// Logica pura (nessun I/O) per il rollup PASS/WARN/FAIL e il parsing
// dell'extra di titoli, estratta da engine.mjs per poterla testare senza
// far scattare le vere letture Supabase/il vero browser che main()
// farebbe se il modulo engine.mjs venisse importato direttamente (vedi
// rollup.test.mjs).

import { THRESHOLDS } from "../thresholds.mjs";

const DEFAULT_EXTRA_TITLES = 1000;

// Fallback a 1000 se l'argomento è assente o non un intero positivo valido
// (es. workflow_dispatch lanciato senza input, o con un valore scritto
// male) — mai un errore, mai NaN/0/negativo che romperebbe la generazione
// della libreria finta a valle.
export function parseExtraTitles(arg) {
  const n = Number.parseInt(arg, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EXTRA_TITLES;
}

export function rollup(metrics) {
  const checks = Object.entries(THRESHOLDS).map(([key, { warn, fail }]) => {
    const value = metrics[key];
    const status = value >= fail ? "FAIL" : value >= warn ? "WARN" : "PASS";
    return { metric: key, value, warn, fail, status };
  });

  const result = checks.some((c) => c.status === "FAIL")
    ? "FAIL"
    : checks.some((c) => c.status === "WARN")
      ? "WARN"
      : "PASS";

  return { checks, result };
}
