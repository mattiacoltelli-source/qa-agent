// Selettori della UI di VoiceBrief, in un posto solo. Presi dal DOM reale
// (index.html + app.js del repo voicebrief): gli id sono usati dal
// JavaScript dell'app, quindi non cambiano per un semplice restyling.

export const S = {
  idle: "#idle",
  pick: "#pick",
  working: "#working",
  result: "#result",
  status: "#status",
  go: "#go",
  clear: "#clear",
  out: "#out",
  resultTitle: "#result-title",
  back: "#back",
  env: "#env",
  tasks: "#tasks",
  events: "#events",
  evNote: "#ev-note",
  copy: "#copy",
  recStart: "#rec-start",
  modeRadio: (mode: string) => `input[name=mode][value=${mode}]`,
} as const;
