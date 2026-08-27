// Soglie (ms) usate da scale/engine.mjs per decidere PASS/WARN/FAIL.
// Tarate il 27/08/2026 sui run manuali dello stesso identico test a scale
// vicine a quella tipica di "titoli reali + 1000" (vedi
// scripts/stress-cinefighi.mjs): a N=1500, homeReadyMs 1276, library
// FirstPageMs 70, statsReadyMs 297; a N=5000 statsReadyMs sale a 1025
// (cresce linearmente col numero di titoli — vedi commento in
// scale/lib/cinefighi-scale.mjs). Ogni soglia resta ben sopra i valori
// osservati, non al filo: un run normale resta PASS, solo un peggioramento
// vero fa scattare WARN/FAIL. Da rivedere se la libreria reale di CineFighi
// dovesse crescere ulteriormente di ordini di grandezza (oggi nell'ordine
// delle centinaia di titoli, quindi "reali + 1000" resta a lungo
// nell'ordine di 1000-2000).

export const THRESHOLDS = {
  homeReadyMs: { warn: 3000, fail: 6000 },
  libraryFirstPageMs: { warn: 800, fail: 2000 },
  statsReadyMs: { warn: 1200, fail: 3000 },
};
