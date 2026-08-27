// Logica pura (nessun I/O) per rilevare un residuo di "_QA_Agent_" rimasto
// indietro oltre la soglia di sicurezza, estratta da
// health/projects/cinefighi.mjs per poterla testare senza le vere letture
// Supabase (vedi staleness.test.mjs). Vedi il commento gemello in
// cinefighi.mjs per il perché di questo controllo.
export function findStaleQaAgentResidue(users, titles, { qaUser, now, thresholdMs }) {
  const qaUserLower = qaUser.toLowerCase();

  const staleUser = users.find(
    (u) => String(u.name).toLowerCase() === qaUserLower && now - Date.parse(u.created_at) > thresholdMs
  );
  const staleTitles = titles.filter(
    (t) => String(t.added_by).toLowerCase() === qaUserLower && now - Date.parse(t.created_at) > thresholdMs
  );

  if (!staleUser && staleTitles.length === 0) return null;

  return {
    type: "stale_qa_agent_residue",
    severity: "LOW",
    count: (staleUser ? 1 : 0) + staleTitles.length,
    examples: [
      ...(staleUser ? [`utente "${qaUser}" creato ${staleUser.created_at}`] : []),
      ...staleTitles.slice(0, 5).map((t) => `title_id=${t.id} creato ${t.created_at}`),
    ],
  };
}
