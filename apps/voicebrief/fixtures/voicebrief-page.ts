// Helper specifici per VoiceBrief. L'app non ha un database e non mostra dati
// di nessuno: l'audio vive solo in IndexedDB del browser e le due chiamate
// al backend (trascrizione, riassunto) sono SEMPRE mockate qui. Nessun test
// tocca OpenAI né il tetto di spesa mensile del backend reale.

import type { Page, Route } from "@playwright/test";
import { clearBrowserStorage } from "../../../core/storage.ts";
import { S } from "./selectors.ts";

export const API_PATTERN = "**/functions/v1/voicebrief";

/** WAV di 1 secondo di silenzio (8 kHz, 8 bit mono): abbastanza valido perché
 * il player non segnali errori, abbastanza piccolo da stare nel test. */
function silentWav(): number[] {
  const rate = 8000;
  const data = rate;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write("data", 36);
  h.writeUInt32LE(data, 40);
  return [...h, ...new Array(data).fill(128)];
}

/** Apre l'app da zero: storage, IndexedDB e (se serve) cache pulite. */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto(".");
  await clearBrowserStorage(page);
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        const r = indexedDB.deleteDatabase("voicebrief");
        r.onsuccess = r.onerror = r.onblocked = () => res();
      })
  );
  await page.reload();
  await page.locator(S.idle).waitFor({ state: "visible", timeout: 10_000 });
}

/** Salva un vocale in IndexedDB come farebbe il service worker dopo la
 * condivisione da WhatsApp, poi ricarica: l'app parte dalla schermata di scelta. */
export async function seedSharedAudio(page: Page, name = "PTT-20261003-WA0007.opus"): Promise<void> {
  const bytes = silentWav();
  await page.evaluate(
    async ({ bytes, name }) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const req = indexedDB.open("voicebrief", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("files");
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const blob = new Blob([new Uint8Array(bytes)], { type: "audio/wav" });
      await new Promise<void>((res, rej) => {
        const tx = db.transaction("files", "readwrite");
        tx.objectStore("files").put(
          { items: [{ id: "t1", blob, name, type: "audio/wav", size: blob.size, receivedAt: Date.now() }], open: false, updated: Date.now(), append: 0 },
          "group"
        );
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    },
    { bytes, name }
  );
  await page.reload();
  await page.locator(S.pick).waitFor({ state: "visible", timeout: 10_000 });
}

export type ApiCall = { kind: "transcribe" | "event" | "summarize"; body: string | null };

export interface ApiScript {
  /** Risposta per ogni chiamata; di default successo. Riceve l'indice (da 0) delle chiamate dello stesso tipo. */
  transcribe?: (n: number) => { status: number; body: unknown } | "abort";
  summarize?: (n: number) => { status: number; body: unknown } | "abort";
  /** Corpo della risposta all'estrazione impegni/da fare (di default nessun impegno e nessun "da fare"). */
  event?: unknown;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

/** Intercetta il backend: nessuna richiesta esce verso Supabase/OpenAI. */
export async function mockApi(page: Page, script: ApiScript = {}): Promise<ApiCall[]> {
  const calls: ApiCall[] = [];
  const count = { transcribe: 0, event: 0, summarize: 0 };
  const reply = async (route: Route, r: { status: number; body: unknown } | "abort") => {
    if (r === "abort") return route.abort("failed");
    return route.fulfill({ status: r.status, headers: CORS, contentType: "application/json", body: JSON.stringify(r.body) });
  };
  await page.route(API_PATTERN, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const ct = req.headers()["content-type"] ?? "";
    if (ct.includes("multipart/form-data")) {
      calls.push({ kind: "transcribe", body: null });
      const n = count.transcribe++;
      return reply(route, script.transcribe?.(n) ?? { status: 200, body: { text: "Ciao, ci vediamo domani alle otto da Luca per cena.", seconds: 1 } });
    }
    const body = req.postData() ?? "";
    if (body.includes('"step":"event"')) {
      calls.push({ kind: "event", body });
      count.event++;
      return reply(route, { status: 200, body: script.event ?? { events: [] } });
    }
    calls.push({ kind: "summarize", body });
    const n = count.summarize++;
    return reply(
      route,
      script.summarize?.(n) ?? { status: 200, body: { result: "In breve: cena con Luca\n- Cena da Luca\n  Domani alle otto da Luca." } }
    );
  });
  return calls;
}
