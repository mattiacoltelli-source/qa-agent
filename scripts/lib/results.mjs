// Utility condivise per leggere reports/results.json (reporter "json" di
// Playwright, vedi playwright.config.ts). Usate sia da write-summary.mjs
// (riepilogo deterministico) sia da analyze-failures.mjs (analisi Claude) —
// così le due letture restano sempre coerenti tra loro.

const APP_LABELS = {
  cinefighi: "CineFighi",
  cinetracker: "CineTracker",
  vacanza: "Spot",
};

export function appNameFromProject(projectName) {
  const prefix = projectName.split("-")[0];
  return APP_LABELS[prefix] || projectName;
}

// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

export function cleanError(text, max) {
  if (!text) return "(nessun messaggio d'errore)";
  const plain = text.replace(ANSI_ESCAPE_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return max && plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

// Playwright non separa "l'infrastruttura ha ceduto" (browser/runner) da
// "l'app ha risposto male" in un campo strutturato: bisogna interpretare il
// testo dell'errore. Deliberatamente conservativo: solo pattern
// INEQUIVOCABILI di infrastruttura (mai riconducibili a un bug dell'app)
// classificano INFRA_ERROR — tutto il resto, incluso un timeout generico
// (può benissimo essere l'app lenta, non lo sappiamo), resta FAIL. Un falso
// FAIL viene comunque rivisto da un umano; un falso INFRA_ERROR rischia di
// far ignorare un bug vero.
const INFRA_ERROR_PATTERNS = [
  /Target (page|context|browser)(,.*)? (has been closed|closed|crashed)/i,
  /browserType\.launch/i,
  /net::ERR_(CONNECTION_REFUSED|CONNECTION_RESET|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|EMPTY_RESPONSE|TIMED_OUT)/,
  /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT)\b/,
];

export function classifyFailure(errorMessage) {
  if (!errorMessage) return "FAIL";
  return INFRA_ERROR_PATTERNS.some((re) => re.test(errorMessage)) ? "INFRA_ERROR" : "FAIL";
}

// I risultati sono annidati in un albero di suite (una per file, a volte per
// progetto). Attraversiamo tutto ricorsivamente per arrivare a spec/test.
export function collectTests(suites, out = []) {
  for (const suite of suites) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        out.push({ spec, test });
      }
    }
    if (suite.suites) collectTests(suite.suites, out);
  }
  return out;
}

/** Chiave stabile per una spec/test: usata per far combaciare l'analisi
 * Claude (scritta in un file separato) con la riga giusta nel riepilogo,
 * senza dipendere dall'ordine di lettura. */
export function failureKey(spec, test) {
  return `${test.projectName}::${spec.file}::${spec.title}`;
}

export function collectFailures(suites) {
  const failures = [];
  for (const { spec, test } of collectTests(suites)) {
    if (test.status !== "unexpected") continue;
    const lastResult = test.results[test.results.length - 1];
    const errorMessage = lastResult?.errors?.[0]?.message;
    failures.push({
      key: failureKey(spec, test),
      title: spec.title,
      file: spec.file,
      project: test.projectName,
      app: appNameFromProject(test.projectName),
      duration: lastResult?.duration ?? 0,
      error: cleanError(errorMessage, undefined),
      kind: classifyFailure(errorMessage),
    });
  }
  return failures;
}
