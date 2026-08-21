// Soglie Lighthouse (0-100 per categoria) usate da perf/engine.mjs per
// decidere PASS/WARN/FAIL. Tarate il 21/08/2026 sui punteggi reali delle
// tre app in produzione (run #3, vedi reports/perf-results.json):
//   CineFighi 96/91/96/90, CineTracker 84/88/96/90, Spot 79/89/92/90
// Ogni soglia resta sotto il minimo osservato per quella categoria, non al
// filo: un run normale resta PASS, solo un peggioramento vero fa scattare
// WARN/FAIL. Da rivedere se le app cambiano sensibilmente.

export const THRESHOLDS = {
  performance: 70,
  accessibility: 80,
  "best-practices": 85,
  seo: 80,
};
