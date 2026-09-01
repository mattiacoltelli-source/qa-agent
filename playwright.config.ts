import { defineConfig } from "@playwright/test";
import { MOBILE_CONTEXT, DESKTOP_CONTEXT } from "./core/viewports.ts";

// URL live (GitHub Pages) delle tre app. Override via env var per puntare a
// un ambiente diverso (es. un fork di test) senza toccare questo file.
const CINEFIGHI_URL =
  process.env.CINEFIGHI_BASE_URL ?? "https://mattiacoltelli-source.github.io/CineFighi/";
const CINETRACKER_URL =
  process.env.CINETRACKER_BASE_URL ?? "https://mattiacoltelli-source.github.io/Cos90/";
const VACANZA_URL =
  process.env.VACANZA_BASE_URL ?? "https://mattiacoltelli-source.github.io/Spot/";
const PROVA_URL =
  process.env.PROVA_BASE_URL ?? "https://mattiacoltelli-source.github.io/Prova/";

// Per aggiungere una quarta app: creare apps/<nome>/tests, poi aggiungere
// qui due project (mobile + desktop) che puntano al suo baseURL. Non serve
// toccare /core né gli altri progetti.
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,

  reporter: [
    ["list"],
    ["json", { outputFile: "reports/results.json" }],
    ["html", { outputFolder: "reports/html", open: "never" }],
  ],

  use: {
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "cinefighi-mobile",
      testDir: "./apps/cinefighi/tests",
      use: { ...MOBILE_CONTEXT, baseURL: CINEFIGHI_URL },
    },
    {
      name: "cinefighi-desktop",
      testDir: "./apps/cinefighi/tests",
      use: { ...DESKTOP_CONTEXT, baseURL: CINEFIGHI_URL },
    },
    {
      name: "cinetracker-mobile",
      testDir: "./apps/cinetracker/tests",
      use: { ...MOBILE_CONTEXT, baseURL: CINETRACKER_URL },
    },
    {
      name: "cinetracker-desktop",
      testDir: "./apps/cinetracker/tests",
      use: { ...DESKTOP_CONTEXT, baseURL: CINETRACKER_URL },
    },
    {
      name: "vacanza-mobile",
      testDir: "./apps/vacanza/tests",
      use: { ...MOBILE_CONTEXT, baseURL: VACANZA_URL },
    },
    {
      name: "vacanza-desktop",
      testDir: "./apps/vacanza/tests",
      use: { ...DESKTOP_CONTEXT, baseURL: VACANZA_URL },
    },
    {
      name: "prova-mobile",
      testDir: "./apps/prova/tests",
      use: { ...MOBILE_CONTEXT, baseURL: PROVA_URL },
    },
    {
      name: "prova-desktop",
      testDir: "./apps/prova/tests",
      use: { ...DESKTOP_CONTEXT, baseURL: PROVA_URL },
    },
  ],
});
