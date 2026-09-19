// Selettori della UI di Prova (AI Predictor), in un posto solo.
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
  assetCard: ".asset-card",
  assetFilterHorizonBtn: "#asset-filter .horizon-filter-btn",
  assetPrice: ".asset-price",
  assetsGridAssetCard: "#assets-grid .asset-card",
  badge: ".badge",
  badgeAccuracy: ".badge-accuracy",
  cagrGridCell: ".cagr-grid .cagr-cell",
  canvasChartEmpty: "canvas, .chart-empty",
  chartEmpty: ".chart-empty",
  collapsibleContentCollapsed: ".collapsible-content.collapsed",
  collapsibleHeader: ".collapsible-header",
  cycleBadge: ".cycle-badge",
  detailsChart: "details.chart-details",
  detailsInfoPanel: "details.info-panel",
  iconSvg: ".icon svg",
  infoPanelBody: ".info-panel-body",
  pageReportDetailsInfoPanel: "#page-report > details.info-panel",
  pageRoboticsDetailsInfoPanel: "#page-robotics > details.info-panel",
  pageTechDetailsInfoPanel: "#page-tech > details.info-panel",
  reportTypeFilterHorizonBtn: "#report-type-filter .horizon-filter-btn",
  roboticsAssetFilterHorizonBtn: "#robotics-asset-filter .horizon-filter-btn",
  snapshotStatus: ".snapshot-status",
  status: ".data-status",
  summary: "summary",
  tbodyTr: "tbody tr",
  tbodyTrOutcomeRow: "tbody tr.outcome-row",
  tbodyTrPredRow: "tbody tr.pred-row",
} as const;
