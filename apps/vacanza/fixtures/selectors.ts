// Selettori della UI di Spot, in un posto solo.
//
// Qui stanno i selettori **fragili o condivisi**: quelli basati su classi
// CSS — cambiano quando si rifà lo stile, senza che l'app si lamenti — e
// quelli usati da più di un file di test. Gli `id` usati una volta sola
// restano inline nel test che li usa: sono già leggibili così, e il
// JavaScript dell'app dipende da loro, quindi non derivano di nascosto.
//
// Il punto di questo file: quando la UI cambia, si aggiorna **una riga
// qui** invece di cercare lo stesso selettore in una dozzina di file.
//
// I valori sono presi dal DOM reale dell'app, non dedotti.

export const S = {
  cosaOraOptionMin120: ".cosa-ora-option[data-min=\"120\"]",
  favBtn: ".fav-btn",
  pageDetail: "#page-detail",
  pageHome: "#page-home",
  plannerBoxPlannerSlot: "#plannerBox .planner-slot",
  plannerBoxPlannerSlotName: "#plannerBox .planner-slot-name",
  spotCard: ".spot-card",
  spotDetailDetailTitle: "#spotDetail .detail-title",
  spotListDetailEmpty: "#spotList .detail-empty",
  spotName: ".spot-name",
  spotVisitedBadge: ".spot-visited-badge",
  statsGrid: "#statsGrid",
  statsGridStat: "#statsGrid .stat",
  weatherAlert: "#weatherAlert",
} as const;
