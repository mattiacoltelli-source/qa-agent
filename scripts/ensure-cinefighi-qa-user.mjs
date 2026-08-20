#!/usr/bin/env node
// Crea "_QA_Agent_" nel gruppo CineFighi PRIMA che i test partano, se non
// esiste già — così ogni test che lo seleziona (letture incluse, vedi
// user-picker.spec.ts "selezionare un profilo ESISTENTE") lo trova davvero
// già lì, invece di doverlo creare al volo tramite l'interfaccia (percorso
// meno rodato, mai irrobustito perché finora capitava una volta sola).
//
// Fa da pendant a scripts/cleanup-write-residue.mjs, che a fine run lo
// cancella di nuovo: così l'account bot non resta visibile per sempre nella
// lista condivisa che vedono gli amici veri del gruppo.

const CINEFIGHI_URL = "https://dxzukpujouayxlomwryc.supabase.co";
const CINEFIGHI_KEY = "sb_publishable_6kaInTs-_PDPHUszpj8N5w_Sb1zCXI9";
const QA_USER = "_QA_Agent_";
const MAX_USERS = 15;

async function main() {
  const res = await fetch(`${CINEFIGHI_URL}/rest/v1/users?select=name`, {
    headers: { apikey: CINEFIGHI_KEY, Authorization: `Bearer ${CINEFIGHI_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Lettura users fallita (HTTP ${res.status}): ${await res.text()}`);
  }
  const users = await res.json();

  if (users.some((u) => u.name.toLowerCase() === QA_USER.toLowerCase())) {
    console.log(`CineFighi: "${QA_USER}" esiste già, nessuna azione.`);
    return;
  }

  if (users.length >= MAX_USERS) {
    throw new Error(
      `Gruppo CineFighi al completo (${users.length}/${MAX_USERS}) e "${QA_USER}" non ne fa parte: ` +
        `va aggiunto manualmente una volta dall'app prima di far girare i test.`
    );
  }

  const insertRes = await fetch(`${CINEFIGHI_URL}/rest/v1/users`, {
    method: "POST",
    headers: {
      apikey: CINEFIGHI_KEY,
      Authorization: `Bearer ${CINEFIGHI_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ name: QA_USER }),
  });
  if (!insertRes.ok) {
    throw new Error(`Creazione "${QA_USER}" fallita (HTTP ${insertRes.status}): ${await insertRes.text()}`);
  }
  console.log(`CineFighi: creato "${QA_USER}".`);
}

main().catch((e) => {
  console.error("Setup utente QA CineFighi fallito:", e.message);
  process.exit(1);
});
