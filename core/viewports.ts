// Preset di viewport condivisi da tutte le app. Usati in playwright.config.ts
// per generare, per ogni app, un progetto "mobile" e uno "desktop" — le tre
// app sono PWA usate principalmente da telefono, quindi il mobile è il
// viewport primario, il desktop è di supporto.

export const MOBILE_VIEWPORT = { width: 390, height: 844 }; // iPhone 13/14-ish
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

export const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export const MOBILE_CONTEXT = {
  viewport: MOBILE_VIEWPORT,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: MOBILE_USER_AGENT,
};

export const DESKTOP_CONTEXT = {
  viewport: DESKTOP_VIEWPORT,
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
};
