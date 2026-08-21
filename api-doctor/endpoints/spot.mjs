// Controlli sulle 3 API esterne reali usate da Spot: meteo, mare e
// alba/tramonto (verificato sul sorgente reale, app.js) — nessuna richiede
// una chiave, quindi qui non c'è rischio di "chiave scaduta", solo di
// endpoint irraggiungibile o formato risposta cambiato.

import { fetchJson } from "../lib/http.mjs";

export const label = "Spot";

// Corfù (Città Vecchia), un punto reale già presente in spots.js — non
// inventato, coerente con cosa chiede davvero l'app.
const LAT = 39.6243;
const LON = 19.9217;

export async function checks() {
  const results = [];

  const forecast = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,windspeed_10m&forecast_days=1&timezone=auto`
  );
  results.push({
    name: "Meteo (Open-Meteo forecast)",
    ...forecast,
    ok: !forecast.networkError && forecast.ok && typeof forecast.body?.current?.temperature_2m === "number",
    reason: forecast.networkError
      ? `Errore di rete: ${forecast.networkError}`
      : !forecast.ok
        ? `HTTP ${forecast.status}`
        : typeof forecast.body?.current?.temperature_2m !== "number"
          ? 'Risposta 200 ma manca il campo atteso "current.temperature_2m"'
          : null,
  });

  const marine = await fetchJson(
    `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=wave_height&timezone=auto`
  );
  results.push({
    name: "Mare (Open-Meteo marine)",
    ...marine,
    ok: !marine.networkError && marine.ok && marine.body?.current !== undefined,
    reason: marine.networkError
      ? `Errore di rete: ${marine.networkError}`
      : !marine.ok
        ? `HTTP ${marine.status}`
        : marine.body?.current === undefined
          ? 'Risposta 200 ma manca il campo atteso "current"'
          : null,
  });

  const sun = await fetchJson(`https://api.sunrise-sunset.org/json?lat=${LAT}&lng=${LON}&formatted=0`);
  results.push({
    name: "Alba/tramonto (sunrise-sunset.org)",
    ...sun,
    ok: !sun.networkError && sun.ok && sun.body?.status === "OK" && !!sun.body?.results?.sunrise,
    reason: sun.networkError
      ? `Errore di rete: ${sun.networkError}`
      : !sun.ok
        ? `HTTP ${sun.status}`
        : sun.body?.status !== "OK"
          ? `Risposta 200 ma status interno "${sun.body?.status}"`
          : null,
  });

  return results;
}
