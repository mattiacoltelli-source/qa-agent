// Logica pura (nessun I/O) per classificare un check e il rollup di un'app,
// estratta da engine.mjs per poterla testare senza far scattare le vere
// chiamate di rete che main() farebbe se il modulo engine.mjs venisse
// importato direttamente (vedi classify.test.mjs).

// PASS: l'API ha risposto nella forma attesa. FAIL: l'API ha risposto, ma
// male (status sbagliato, corpo malformato) — un problema vero dell'API.
// INFRA_ERROR: la richiesta non è nemmeno arrivata a destinazione (DNS,
// timeout, connessione rifiutata — vedi networkError in lib/http.mjs) — un
// blip di rete del runner, non un problema dell'API.
//
// Anche il 429 è INFRA_ERROR, non FAIL: l'API non ha risposto "male", si è
// rifiutata di servirci in quel momento. Sulle fonti keyless (GDELT) il
// limite è per IP, e gli IP dei runner GitHub sono condivisi con chiunque
// altro: non è una nostra quota, non è un contratto rotto, e soprattutto
// non c'è niente da correggere nel codice. Resta ben visibile nel report
// come INFRA_ERROR — se diventasse permanente lo si vedrebbe run dopo run —
// ma non fa fallire il job né parte una notifica per qualcosa su cui non
// possiamo intervenire. I check che passano per lib/http.mjs con
// `retryWhenRefused` arrivano qui solo se il rifiuto è sopravvissuto ai
// tentativi, quindi questa non è una scorciatoia per saltare il retry.
const RATE_LIMITED = 429;

export function classify(c) {
  if (c.ok) return "PASS";
  if (c.networkError) return "INFRA_ERROR";
  return c.status === RATE_LIMITED ? "INFRA_ERROR" : "FAIL";
}

// Un FAIL vero in qualunque check vince sempre (fa fallire il job); un
// INFRA_ERROR puro (nessun FAIL vero) non fa fallire nulla — vedi il
// commento in cima a engine.mjs per il perché.
export function rollupApp(classifiedChecks) {
  const hasFail = classifiedChecks.some((c) => c.kind === "FAIL");
  const hasInfra = classifiedChecks.some((c) => c.kind === "INFRA_ERROR");
  return hasFail ? "FAIL" : hasInfra ? "INFRA_ERROR" : "PASS";
}
