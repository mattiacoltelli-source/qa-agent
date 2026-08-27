// Logica pura (nessun I/O) per classificare un check e il rollup di un'app,
// estratta da engine.mjs per poterla testare senza far scattare le vere
// chiamate di rete che main() farebbe se il modulo engine.mjs venisse
// importato direttamente (vedi classify.test.mjs).

// PASS: l'API ha risposto nella forma attesa. FAIL: l'API ha risposto, ma
// male (status sbagliato, corpo malformato) — un problema vero dell'API.
// INFRA_ERROR: la richiesta non è nemmeno arrivata a destinazione (DNS,
// timeout, connessione rifiutata — vedi networkError in lib/http.mjs) — un
// blip di rete del runner, non un problema dell'API.
export function classify(c) {
  if (c.ok) return "PASS";
  return c.networkError ? "INFRA_ERROR" : "FAIL";
}

// Un FAIL vero in qualunque check vince sempre (fa fallire il job); un
// INFRA_ERROR puro (nessun FAIL vero) non fa fallire nulla — vedi il
// commento in cima a engine.mjs per il perché.
export function rollupApp(classifiedChecks) {
  const hasFail = classifiedChecks.some((c) => c.kind === "FAIL");
  const hasInfra = classifiedChecks.some((c) => c.kind === "INFRA_ERROR");
  return hasFail ? "FAIL" : hasInfra ? "INFRA_ERROR" : "PASS";
}
