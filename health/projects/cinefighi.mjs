// Controlli di integrità dati per CineFighi (Supabase condiviso dal gruppo:
// tabelle users/titles/votes — schema verificato sul sorgente reale
// dell'app, storage.js, non dedotto). Sola lettura: nessuna riga viene mai
// scritta o cancellata da questo modulo.

import { fetchAllRows } from "../lib/supabase-rest.mjs";

export const label = "CineFighi";
export const url = process.env.CINEFIGHI_BASE_URL ?? "https://mattiacoltelli-source.github.io/CineFighi/";

const SUPABASE_URL = "https://dxzukpujouayxlomwryc.supabase.co";
const SUPABASE_KEY = "sb_publishable_6kaInTs-_PDPHUszpj8N5w_Sb1zCXI9";

// Stesso utente di test dedicato usato dalla suite Playwright (QA_USER in
// apps/cinefighi/fixtures/cinefighi-page.ts) e dagli script di
// setup/cleanup (scripts/ensure-cinefighi-qa-user.mjs,
// scripts/cleanup-write-residue.mjs) — duplicato qui come stringa
// letterale, stessa convenzione già in uso in quei due script.
const QA_USER = "_QA_Agent_";
// Ben oltre la durata di un run reale (minuti): un residuo più vecchio di
// così non può essere un test in corso, solo un cleanup che non è arrivato
// in fondo (vedi il controllo più sotto).
const STALE_RESIDUE_THRESHOLD_MS = 3 * 60 * 60 * 1000;

export async function checkData() {
  const [users, titles, votes] = await Promise.all([
    fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "users", { select: "name,created_at" }),
    fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "titles", { select: "id,added_by,created_at" }),
    fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "votes", { select: "title_id,user_name" }),
  ]);

  const userNames = new Set(users.map((u) => String(u.name).toLowerCase()));
  const titleIds = new Set(titles.map((t) => t.id));

  const issues = [];

  // Voto che punta a un titolo che non esiste (più) in "titles": non
  // dovrebbe mai succedere, l'app non offre un modo per farlo accadere.
  const orphanVoteTitles = votes.filter((v) => !titleIds.has(v.title_id));
  if (orphanVoteTitles.length > 0) {
    issues.push({
      type: "orphan_vote_title",
      severity: "HIGH",
      count: orphanVoteTitles.length,
      examples: orphanVoteTitles.slice(0, 5).map((v) => `title_id=${v.title_id} user=${v.user_name}`),
    });
  }

  // Voto di un utente che non è (più) in "users": severity MEDIUM perché
  // secondo il backlog del QA Agent l'app potrebbe in futuro permettere di
  // eliminare un utente mantenendo il suo storico voti — non è quindi detto
  // che sia sempre un bug.
  const orphanVoteUsers = votes.filter((v) => !userNames.has(String(v.user_name).toLowerCase()));
  if (orphanVoteUsers.length > 0) {
    issues.push({
      type: "orphan_vote_user",
      severity: "MEDIUM",
      count: orphanVoteUsers.length,
      examples: orphanVoteUsers.slice(0, 5).map((v) => `title_id=${v.title_id} user=${v.user_name}`),
    });
  }

  // Titolo aggiunto da un utente che non è (più) in "users": stessa
  // situazione e stessa severity dei voti orfani sopra, per lo stesso
  // motivo (un utente può essere cancellato dall'app, vedi FAQ.md "icona
  // del cestino accanto al nome").
  const orphanTitles = titles.filter((t) => !userNames.has(String(t.added_by).toLowerCase()));
  if (orphanTitles.length > 0) {
    issues.push({
      type: "orphan_title_added_by",
      severity: "MEDIUM",
      count: orphanTitles.length,
      examples: orphanTitles.slice(0, 5).map((t) => `title_id=${t.id} added_by=${t.added_by}`),
    });
  }

  // Più voti dello stesso utente sullo stesso titolo: il vincolo unique
  // (title_id, user_name) lato Supabase dovrebbe impedirlo (l'app usa
  // upsert con onConflict) — se compare comunque, il vincolo è saltato.
  const voteCounts = new Map();
  for (const v of votes) {
    const key = `${v.title_id}::${v.user_name}`;
    voteCounts.set(key, (voteCounts.get(key) || 0) + 1);
  }
  const dupVotes = [...voteCounts.entries()].filter(([, n]) => n > 1);
  if (dupVotes.length > 0) {
    issues.push({
      type: "duplicate_vote",
      severity: "HIGH",
      count: dupVotes.length,
      examples: dupVotes.slice(0, 5).map(([k, n]) => `${k} x${n}`),
    });
  }

  // Utenti con lo stesso nome case-insensitive: addUser() lato app è
  // idempotente proprio per evitarlo — se compare, qualcosa lo ha bypassato.
  const nameCounts = new Map();
  for (const u of users) {
    const key = String(u.name).toLowerCase();
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }
  const dupUsers = [...nameCounts.entries()].filter(([, n]) => n > 1);
  if (dupUsers.length > 0) {
    issues.push({
      type: "duplicate_user",
      severity: "MEDIUM",
      count: dupUsers.length,
      examples: dupUsers.slice(0, 5).map(([k, n]) => `${k} x${n}`),
    });
  }

  // Rete di sicurezza per i test @write: il cleanup immediato
  // (scripts/cleanup-write-residue.mjs) gira SEMPRE a fine run, anche su
  // test falliti — l'unico modo per cui un residuo di "_QA_Agent_" può
  // restare qui è che l'intero job/runner sia morto prima che quello step
  // partisse (crash, OOM: raro ma possibile). Un residuo così vecchio non
  // può essere un test in corso, quindi è sempre sicuro segnalarlo (e
  // rimuoverlo — vedi il nuovo step in .github/workflows/data-health.yml,
  // che gira SUBITO DOPO questo controllo). Severity LOW: non è mai un
  // bug dell'app, solo dell'infrastruttura di test, e si autorisolve al
  // prossimo giro di pulizia.
  const now = Date.now();
  const staleUser = users.find(
    (u) => String(u.name).toLowerCase() === QA_USER.toLowerCase() && now - Date.parse(u.created_at) > STALE_RESIDUE_THRESHOLD_MS
  );
  const staleTitles = titles.filter(
    (t) => String(t.added_by).toLowerCase() === QA_USER.toLowerCase() && now - Date.parse(t.created_at) > STALE_RESIDUE_THRESHOLD_MS
  );
  if (staleUser || staleTitles.length > 0) {
    issues.push({
      type: "stale_qa_agent_residue",
      severity: "LOW",
      count: (staleUser ? 1 : 0) + staleTitles.length,
      examples: [
        ...(staleUser ? [`utente "${QA_USER}" creato ${staleUser.created_at}`] : []),
        ...staleTitles.slice(0, 5).map((t) => `title_id=${t.id} creato ${t.created_at}`),
      ],
    });
  }

  return {
    counts: { users: users.length, titles: titles.length, votes: votes.length },
    issues,
  };
}
