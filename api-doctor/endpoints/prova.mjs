// Controlli sulle API esterne di Prova (AI Predictor) che NON richiedono
// una chiave: Yahoo Finance (prezzo, fonte primaria), SEC EDGAR
// (fondamentali, fonte primaria) e GDELT (news, fonte di riserva) — URL
// verificati sul sorgente reale, src/data_sources/{prices,fundamentals,
// news}.py nel repo Prova.
//
// Le fonti di riserva a chiave (Twelve Data, Finnhub, Alpha Vantage, FRED)
// restano fuori: sono secret server-side del repo Prova, non chiavi
// pubbliche riusabili come per TMDB — per controllarle da qui servirebbe
// copiarle anche nei secret di questo repo. Volutamente rimandato.

import { fetchJson } from "../lib/http.mjs";

export const label = "Prova (AI Predictor)";

// NVDA, uno dei tre asset attivi del paniere reale (config.py) — non
// inventato.
const TICKER = "NVDA";

// SEC richiede un contatto reale nello User-Agent (fair access policy),
// stesso contatto già usato lato Prova (src/config.py,
// SEC_EDGAR_CONTACT_EMAIL) — nessun nuovo dato, solo riuso.
const SEC_HEADERS = { "User-Agent": "prova-api-doctor (mattia.coltelli@gmail.com)" };
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (prova-api-doctor)" };

export async function checks() {
  const results = [];

  const yahoo = await fetchJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${TICKER}?range=1d&interval=1m`,
    { headers: YAHOO_HEADERS }
  );
  results.push({
    name: `Prezzo (Yahoo Finance, ${TICKER})`,
    ...yahoo,
    ok: !yahoo.networkError && yahoo.ok && typeof yahoo.body?.chart?.result?.[0]?.meta?.regularMarketPrice === "number",
    reason: yahoo.networkError
      ? `Errore di rete: ${yahoo.networkError}`
      : !yahoo.ok
        ? `HTTP ${yahoo.status}`
        : typeof yahoo.body?.chart?.result?.[0]?.meta?.regularMarketPrice !== "number"
          ? 'Risposta 200 ma manca il campo atteso "chart.result[0].meta.regularMarketPrice"'
          : null,
  });

  const secEdgar = await fetchJson("https://www.sec.gov/files/company_tickers.json", {
    headers: SEC_HEADERS,
  });
  results.push({
    name: "Fondamentali (SEC EDGAR, elenco ticker)",
    ...secEdgar,
    ok: !secEdgar.networkError && secEdgar.ok && Object.keys(secEdgar.body || {}).length > 0,
    reason: secEdgar.networkError
      ? `Errore di rete: ${secEdgar.networkError}`
      : !secEdgar.ok
        ? `HTTP ${secEdgar.status}`
        : Object.keys(secEdgar.body || {}).length === 0
          ? "Risposta 200 ma corpo vuoto (atteso un elenco di ticker)"
          : null,
  });

  const gdelt = await fetchJson(
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${TICKER}&mode=artlist&format=json&maxrecords=5&timespan=7d`
  );
  results.push({
    name: `News (GDELT, ${TICKER})`,
    ...gdelt,
    ok: !gdelt.networkError && gdelt.ok && Array.isArray(gdelt.body?.articles),
    reason: gdelt.networkError
      ? `Errore di rete: ${gdelt.networkError}`
      : !gdelt.ok
        ? `HTTP ${gdelt.status}`
        : !Array.isArray(gdelt.body?.articles)
          ? 'Risposta 200 ma manca il campo atteso "articles" (array, anche vuoto)'
          : null,
  });

  return results;
}
