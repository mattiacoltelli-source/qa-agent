// Controlli sulle API esterne di Prova (AI Predictor) che NON richiedono
// una chiave: Yahoo Finance (prezzo, fonte primaria), SEC EDGAR — sia
// l'elenco ticker (fondamentali, fonte primaria) sia le submissions
// (transazioni insider via Form 4, aggiunte il 2026-09-02) — e GDELT
// (news, fonte di riserva). URL verificati sul sorgente reale,
// src/data_sources/{prices,fundamentals,news,insider}.py nel repo Prova.
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

// CIK SEC di NVDA (numerico, zero-padded a 10 cifre): stesso valore che
// src/data_sources/fundamentals.py:sec_cik_for_ticker() risolverebbe per
// NVDA — qui hardcoded per non dipendere da un secondo fetch a
// company_tickers.json solo per ottenerlo.
const NVDA_CIK = "0001045810";

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

  // data.sec.gov è un sottodominio/gateway diverso da www.sec.gov (sopra):
  // può avere disponibilità indipendente, da qui il controllo separato
  // invece di fidarsi del solo check "Fondamentali" per coprire anche
  // questo endpoint.
  const secSubmissions = await fetchJson(
    `https://data.sec.gov/submissions/CIK${NVDA_CIK}.json`,
    { headers: SEC_HEADERS }
  );
  results.push({
    name: `Transazioni insider (SEC EDGAR submissions, ${TICKER})`,
    ...secSubmissions,
    ok:
      !secSubmissions.networkError &&
      secSubmissions.ok &&
      Array.isArray(secSubmissions.body?.filings?.recent?.form),
    reason: secSubmissions.networkError
      ? `Errore di rete: ${secSubmissions.networkError}`
      : !secSubmissions.ok
        ? `HTTP ${secSubmissions.status}`
        : !Array.isArray(secSubmissions.body?.filings?.recent?.form)
          ? 'Risposta 200 ma manca il campo atteso "filings.recent.form" (array)'
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
