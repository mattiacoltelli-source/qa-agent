import { test } from "node:test";
import assert from "node:assert/strict";
import { findStaleQaAgentResidue } from "./staleness.mjs";

const QA_USER = "_QA_Agent_";
const THRESHOLD_MS = 3 * 60 * 60 * 1000;
const now = Date.now();
const opts = { qaUser: QA_USER, now, thresholdMs: THRESHOLD_MS };

function isoAgo(ms) {
  return new Date(now - ms).toISOString();
}

test("nessun residuo: null", () => {
  assert.equal(findStaleQaAgentResidue([], [], opts), null);
});

// Il caso più importante da proteggere: un test @write in corso (residuo di
// pochi minuti) NON deve mai far scattare un falso allarme — altrimenti
// ogni run @write manuale genererebbe un WARN spurio in Data Health.
test("run @write in corso (residuo di 5 minuti): NON deve segnalare", () => {
  const users = [{ name: QA_USER, created_at: isoAgo(5 * 60 * 1000) }];
  const titles = [{ id: 1, added_by: QA_USER, created_at: isoAgo(5 * 60 * 1000) }];
  assert.equal(findStaleQaAgentResidue(users, titles, opts), null);
});

test("residuo vecchio 4 ore (utente + titolo): deve segnalare entrambi", () => {
  const users = [{ name: QA_USER, created_at: isoAgo(4 * 60 * 60 * 1000) }];
  const titles = [{ id: 1, added_by: QA_USER, created_at: isoAgo(4 * 60 * 60 * 1000) }];
  const issue = findStaleQaAgentResidue(users, titles, opts);
  assert.ok(issue);
  assert.equal(issue.type, "stale_qa_agent_residue");
  assert.equal(issue.severity, "LOW");
  assert.equal(issue.count, 2);
});

test("solo titolo vecchio, utente già rimosso: deve segnalare comunque", () => {
  const issue = findStaleQaAgentResidue([], [{ id: 1, added_by: QA_USER, created_at: isoAgo(4 * 60 * 60 * 1000) }], opts);
  assert.ok(issue);
  assert.equal(issue.count, 1);
});

test("utente reale del gruppo (non QA), anche se vecchio: NON deve segnalare", () => {
  const users = [{ name: "Mattia", created_at: isoAgo(365 * 24 * 60 * 60 * 1000) }];
  assert.equal(findStaleQaAgentResidue(users, [], opts), null);
});

test("il confronto del nome utente è case-insensitive", () => {
  const users = [{ name: "_qa_agent_", created_at: isoAgo(4 * 60 * 60 * 1000) }];
  assert.ok(findStaleQaAgentResidue(users, [], opts));
});
