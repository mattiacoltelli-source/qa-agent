// Controlli di integrità dati per CineFighi (Supabase condiviso dal gruppo:
// tabelle users/titles/votes — schema verificato sul sorgente reale
// dell'app, storage.js, non dedotto). Sola lettura: nessuna riga viene mai
// scritta o cancellata da questo modulo.

import { fetchAllRows } from "../lib/supabase-rest.mjs";

export const label = "CineFighi";
export const url = process.env.CINEFIGHI_BASE_URL ?? "https://mattiacoltelli-source.github.io/CineFighi/";

const SUPABASE_URL = "https://dxzukpujouayxlomwryc.supabase.co";
const SUPABASE_KEY = "sb_publishable_6kaInTs-_PDPHUszpj8N5w_Sb1zCXI9";

export async function checkData() {
  const [users, titles, votes] = await Promise.all([
    fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "users", { select: "name" }),
    fetchAllRows(SUPABASE_URL, SUPABASE_KEY, "titles", { select: "id,added_by" }),
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

  return {
    counts: { users: users.length, titles: titles.length, votes: votes.length },
    issues,
  };
}
