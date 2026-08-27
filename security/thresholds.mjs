// Soglie di severità usate da security/engine.mjs per decidere PASS/WARN/FAIL
// dall'output di `npm audit`. Nessun numero da tarare sui dati reali (a
// differenza di perf/thresholds.mjs o scale/thresholds.mjs): qui la scala è
// fissa (npm audit classifica ogni vulnerabilità in una di 5 severità), la
// scelta è solo su quale severità far scattare cosa.

// Qualunque vulnerabilità high o critical: FAIL, il run blocca il job (vedi
// security/engine.mjs). moderate: WARN, resta solo nel report. low/info:
// PASS — troppo comuni e spesso non sfruttabili nel contesto di uno script
// CLI locale (non un server esposto) per giustificare un avviso ogni volta.
export const FAIL_SEVERITIES = ["high", "critical"];
export const WARN_SEVERITIES = ["moderate"];
