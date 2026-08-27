import { test, expect } from "@playwright/test";
import { clearBrowserStorage } from "../../../../core/storage.ts";
import { mockJson } from "../../../../core/network.ts";
import { QA_USER, selectExistingUser, setStatsMode } from "../../fixtures/cinefighi-page.ts";

function fakeTitle(id: number, title: string, genre: string) {
  return {
    id, tmdb_id: id, media_type: "movie", title, year: "2024",
    poster_path: "", backdrop_path: "", overview: "",
    genre_names: [genre], director: "", status: "seen",
    added_by: "Un Amico", created_at: new Date().toISOString()
  };
}
const TITLES = [
  fakeTitle(930001, "Film A QA", "Thriller"),
  fakeTitle(930002, "Film B QA", "Thriller"),
  fakeTitle(930003, "Film C QA", "Commedia")
];
const VOTES = [
  { title_id: 930001, user_name: "Un Amico", vote: 6 },
  { title_id: 930001, user_name: QA_USER, vote: 8 },
  { title_id: 930002, user_name: QA_USER, vote: 6 },
  { title_id: 930003, user_name: "Un Amico", vote: 9 }
];

test("DIAG stats me mode", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(`[console] ${msg.text()}`));
  page.on("request", (req) => {
    if (req.url().includes("/rest/v1/")) logs.push(`[req] ${req.method()} ${req.url()}`);
  });

  await mockJson(page, /rest\/v1\/users/, [{ name: QA_USER }, { name: "Un Amico" }]);
  await mockJson(page, /rest\/v1\/titles/, TITLES);
  await mockJson(page, /rest\/v1\/votes/, VOTES);
  await page.route(/fonts\.googleapis\.com/, (route) => route.abort());

  await page.goto(".");
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#userPickerOverlay").waitFor({ state: "visible", timeout: 10_000 });
  await selectExistingUser(page, QA_USER);
  await page.locator('.nav__btn[data-screen="stats"]').click();
  await page.locator("#genreBars .bar-row").first().waitFor({ state: "visible", timeout: 10_000 });

  logs.push(`[state] before click: statSeen=${await page.locator("#statSeen").textContent()} animId=${await page.locator("#statSeen").evaluate(el => (el as any)._animId)} currentValue=${await page.locator("#statSeen").evaluate(el => (el as any).dataset.currentValue)}`);

  await setStatsMode(page, "me");

  for (let i = 0; i < 15; i++) {
    const text = await page.locator("#statSeen").textContent();
    const animId = await page.locator("#statSeen").evaluate(el => (el as any)._animId);
    const cv = await page.locator("#statSeen").evaluate(el => (el as any).dataset.currentValue);
    logs.push(`[poll ${i} @${Date.now()}] statSeen=${text} animId=${animId} currentValue=${cv}`);
    await page.waitForTimeout(100);
  }

  console.log(logs.join("\n"));
  expect(true).toBe(true);
});
