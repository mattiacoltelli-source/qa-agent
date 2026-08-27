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
// delle centinaia di titoli, quindi con l'extra di default 1000 il totale
// resta a lungo nell'ordine di 1000-2000).
//
// L'extra è configurabile al lancio (workflow_dispatch.inputs.extra_titles
// in .github/workflows/scale.yml, default 1000): un run manuale con un
// extra molto più grande (es. 15000) può legittimamente finire in
// WARN/FAIL su "statsReadyMs" (cresce linearmente col numero di titoli)
// senza che sia una regressione reale dell'app — solo un test a una scala
// diversa da quella su cui queste soglie sono tarate.

export const THRESHOLDS = {
  homeReadyMs: { warn: 3000, fail: 6000 },
  libraryFirstPageMs: { warn: 800, fail: 2000 },
  statsReadyMs: { warn: 1200, fail: 3000 },
};
