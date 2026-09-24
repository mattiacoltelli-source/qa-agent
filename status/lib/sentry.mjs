// Logica pura per tradurre le issue di Sentry nella forma comune di
// `status/<agente>.json`. Nessuna I/O: testata in sentry.test.mjs.
//
// Il criterio di severità è volutamente mite. Queste sono app personali:
// un errore JavaScript va guardato, non è un incendio. Se ogni errore
// facesse diventare rossa una card, in una settimana la dashboard sarebbe
// permanentemente rossa e smetteresti di guardarla — che è il modo più
// comune in cui un sistema di allerta muore.

// Slug del progetto Sentry -> chiave app del contratto `status/`.
// Sono diversi perché i progetti Sentry seguono il nome del repo
// (`cos90`) mentre il contratto segue il nome dell'app (`cinetracker`).
export const PROGETTI = {
  cos90: "cinetracker",
  spot: "spot",
  predict: "prova",
  "control-center": "control-center",
};

const MAX_PROBLEMI = 3;

function plurale(n, singolare, plurale_) {
  return `${n} ${n === 1 ? singolare : plurale_}`;
}

/**
 * Riassume le issue non risolte di un progetto nelle ultime 24 ore.
 *
 * - nessuna issue        -> PASS
 * - almeno una           -> WARN ("da guardare")
 * - almeno una `fatal`   -> FAIL
 *
 * `count` arriva da Sentry come stringa: va convertito, altrimenti i
 * confronti numerici diventano confronti fra stringhe e "9" > "10".
 */
export function riassumiProgetto(issues) {
  if (!Array.isArray(issues)) return null;

  const eventi = issues.reduce((n, i) => n + (Number(i.count) || 0), 0);
  const utenti = issues.reduce((n, i) => Math.max(n, Number(i.userCount) || 0), 0);
  const fatali = issues.filter((i) => i.level === "fatal");

  if (issues.length === 0) {
    return { result: "PASS", summary: "Nessun errore in 24h", metrics: { issues: 0, eventi: 0 }, problems: [] };
  }

  // Le più rumorose per prime: è da lì che si comincia a guardare.
  const ordinate = [...issues].sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));

  return {
    result: fatali.length > 0 ? "FAIL" : "WARN",
    summary: `${plurale(issues.length, "errore", "errori")} · ${plurale(eventi, "evento", "eventi")} in 24h`,
    metrics: { issues: issues.length, eventi, utenti },
    problems: ordinate.slice(0, MAX_PROBLEMI).map((i) => ({
      severity: i.level === "fatal" ? "HIGH" : "MEDIUM",
      message: `${i.title ?? "errore senza titolo"}${i.culprit ? ` — ${i.culprit}` : ""} (${plurale(Number(i.count) || 0, "volta", "volte")}${utenti ? `, ${plurale(Number(i.userCount) || 0, "utente", "utenti")}` : ""})`,
      url: i.permalink ?? null,
    })),
  };
}
