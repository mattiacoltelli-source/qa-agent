// Soglie Lighthouse (0-100 per categoria) usate da perf/engine.mjs per
// decidere PASS/WARN/FAIL. Deliberatamente PERMISSIVE al primo giro: prima
// vediamo i punteggi reali delle tre app in produzione, poi le stringiamo —
// partire già rigorosi avrebbe rischiato un FAIL immediato su cose che
// magari sono così da sempre, senza che sia un problema nuovo da inseguire.

export const THRESHOLDS = {
  performance: 50,
  accessibility: 70,
  "best-practices": 70,
  seo: 60,
};
