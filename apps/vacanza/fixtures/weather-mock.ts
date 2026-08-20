// Payload finti per le 3 API meteo/mare/sole live che Spot chiama in
// app.js::loadWeather(). Vanno SEMPRE mockate nei test che dipendono da
// meteo/luce/punteggio vela — altrimenti lo stesso test dà esiti diversi a
// seconda del giorno/stagione in cui gira la CI (vedi README di questa app).

import type { Page } from "@playwright/test";
import { mockJson, mockFailure } from "../../../core/network.ts";

export interface ForecastOverrides {
  temp?: number;
  wind?: number;
  windDir?: number;
  gust?: number;
  cloud?: number;
  rain?: number;
}

export function buildForecastResponse(overrides: ForecastOverrides = {}) {
  const {
    temp = 24,
    wind = 10,
    windDir = 180,
    gust = 14,
    cloud = 15,
    rain = 5,
  } = overrides;

  const now = new Date();
  const hourly = { time: [] as string[], temperature_2m: [] as number[], windspeed_10m: [] as number[], precipitation_probability: [] as number[], cloudcover: [] as number[] };
  for (let i = 0; i < 24; i++) {
    const t = new Date(now.getTime() + i * 3_600_000);
    t.setMinutes(0, 0, 0);
    hourly.time.push(t.toISOString());
    hourly.temperature_2m.push(temp);
    hourly.windspeed_10m.push(wind);
    hourly.precipitation_probability.push(rain);
    hourly.cloudcover.push(cloud);
  }

  return {
    current: {
      temperature_2m: temp,
      windspeed_10m: wind,
      winddirection_10m: windDir,
      windgusts_10m: gust,
      cloudcover: cloud,
      precipitation_probability: rain,
    },
    hourly,
  };
}

export function buildMarineResponse(waveHeight = 0.3, waveDirection = 200, wavePeriod = 4) {
  return {
    current: {
      wave_height: waveHeight,
      wave_direction: waveDirection,
      wave_period: wavePeriod,
    },
  };
}

export function buildSunResponse(sunriseIso: string, sunsetIso: string) {
  return { results: { sunrise: sunriseIso, sunset: sunsetIso } };
}

/** Tre profili meteo che coprono le soglie usate nel codice reale
 * (app.js::loadWeather headline/advice, scoreWeatherContext, sail.js) —
 * usali invece di inventare numeri a caso, così i test restano leggibili e
 * legati esplicitamente alle soglie che stanno verificando. */
export const WEATHER_PROFILES = {
  // cloud < 30 && rain < 20 → "Cielo sereno — ottima giornata"
  clear: { temp: 27, wind: 10, windDir: 300, gust: 14, cloud: 10, rain: 5 },
  // rain >= 60 → "Pioggia probabile — scegli spot coperti"
  rainy: { temp: 19, wind: 18, windDir: 90, gust: 24, cloud: 85, rain: 70 },
  // wind >= 35 → advice "vento forte, valuta ancoraggi riparati"; anche score sail penalizzato
  windy: { temp: 22, wind: 38, windDir: 315, gust: 50, cloud: 40, rain: 10 },
} as const;

/** Installa i mock per le 3 chiamate di loadWeather() con un profilo dato.
 * Sole fissato a orari fissi (07:00 alba, 19:30 tramonto UTC) per rendere
 * deterministica anche la logica legata a "periodo del giorno". */
export async function mockWeatherApis(
  page: Page,
  profile: ForecastOverrides = WEATHER_PROFILES.clear
): Promise<void> {
  await mockJson(page, /api\.open-meteo\.com\/v1\/forecast/, buildForecastResponse(profile));
  await mockJson(page, /marine-api\.open-meteo\.com\/v1\/marine/, buildMarineResponse());

  const today = new Date().toISOString().slice(0, 10);
  await mockJson(
    page,
    /api\.sunrise-sunset\.org\/json/,
    buildSunResponse(`${today}T07:00:00+00:00`, `${today}T19:30:00+00:00`)
  );
}

/** Simula l'indisponibilità del meteo (rete giù / API in errore): l'app deve
 * degradare senza crash, mostrando la cache se presente o uno stato "n/d". */
export async function mockWeatherOutage(page: Page): Promise<void> {
  await mockFailure(page, /api\.open-meteo\.com\/v1\/forecast/, 500);
  await mockFailure(page, /marine-api\.open-meteo\.com\/v1\/marine/, 500);
  await mockFailure(page, /api\.sunrise-sunset\.org\/json/, 500);
}
