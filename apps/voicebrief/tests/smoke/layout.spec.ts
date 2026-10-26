import { test, expect } from "@playwright/test";
import { gotoFresh, seedSharedAudio, mockApi } from "../../fixtures/voicebrief-page.ts";
import { S } from "../../fixtures/selectors.ts";

// L'app si usa da telefono: la schermata iniziale deve stare in una pagina
// fissa, senza scorrere, con la scelta della lingua sempre raggiungibile.
// Si provano anche telefoni piccoli e con la barra del browser aperta.
const PHONES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "360x740", width: 360, height: 740 },
  { name: "360x640", width: 360, height: 640 },
  { name: "320x568", width: 320, height: 568 },
];

for (const vp of PHONES) {
  test.describe(`VoiceBrief — layout ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("schermata iniziale: nessuno scorrimento, lingua visibile", async ({ page }) => {
      await gotoFresh(page);
      const m = await page.evaluate(() => ({
        scroll: document.scrollingElement!.scrollHeight,
        inner: window.innerHeight,
        langBottom: document.querySelector("#lang")!.getBoundingClientRect().bottom,
        stepsBottom: document.querySelector("#idle .steps")!.getBoundingClientRect().bottom,
        langTop: document.querySelector("#lang")!.getBoundingClientRect().top,
      }));
      expect(m.scroll).toBeLessThanOrEqual(m.inner + 1);
      expect(m.langBottom).toBeLessThanOrEqual(m.inner + 1);
      expect(m.stepsBottom).toBeLessThanOrEqual(m.langTop + 1); // niente sovrapposizioni
      await expect(page.locator('#lang button[data-lang="auto"]')).toBeInViewport();
    });

    test("scelta del vocale: la lingua resta raggiungibile senza scorrere", async ({ page }) => {
      await mockApi(page);
      await gotoFresh(page);
      await seedSharedAudio(page);
      await expect(page.locator(S.pick)).toBeVisible();
      await expect(page.locator('#lang button[data-lang="it"]')).toBeInViewport();
      await expect(page.locator('#lang button[data-lang="auto"]')).toBeInViewport();
    });
  });
}
