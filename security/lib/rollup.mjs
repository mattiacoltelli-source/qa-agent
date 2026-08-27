// Logica pura (nessun I/O) per interpretare l'output di `npm audit` e
// decidere PASS/WARN/FAIL, estratta da engine.mjs per poterla testare senza
// far scattare il vero `npm audit` (lento, dipende dallo stato reale delle
// dipendenze) che main() lancerebbe se il modulo engine.mjs venisse
// importato direttamente (vedi rollup.test.mjs).

import { FAIL_SEVERITIES, WARN_SEVERITIES } from "../thresholds.mjs";

// Ogni voce di `via` è o una stringa (nome di un altro pacchetto vulnerabile
// a monte, catena transitiva) o un oggetto con i dettagli veri (titolo,
// URL, severity, range). Teniamo solo gli oggetti: sono l'informazione
// utile per il riepilogo e per Claude.
export function extractAdvisories(via) {
  return (via || [])
    .filter((v) => typeof v === "object")
    .map((v) => ({ title: v.title, url: v.url, severity: v.severity, range: v.range }));
}

export function summarizeVulnerabilities(audit) {
  const entries = Object.values(audit.vulnerabilities || {});
  return entries.map((v) => ({
    name: v.name,
    severity: v.severity,
    isDirect: v.isDirect,
    range: v.range,
    fixAvailable: v.fixAvailable === true ? true : (v.fixAvailable?.name ?? false),
    advisories: extractAdvisories(v.via),
  }));
}

export function rollup(counts) {
  const failing = FAIL_SEVERITIES.filter((s) => counts[s] > 0);
  if (failing.length > 0) return "FAIL";
  const warning = WARN_SEVERITIES.filter((s) => counts[s] > 0);
  if (warning.length > 0) return "WARN";
  return "PASS";
}
