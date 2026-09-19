// Selettori della UI di CineTracker, in un posto solo.
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
  actionDetails: ".action-details",
  actionSeen: ".action-seen",
  actionWatch: ".action-watch",
  appReady: ".app.app--ready",
  barRowAvg: ".bar-row__avg",
  barRowCount: ".bar-row__count",
  barRowName: ".bar-row__name",
  confirmYesBtn: "#confirmYesBtn",
  detailCommentInput: "#detailCommentInput",
  detailRemoveBtn: "#detailRemoveBtn",
  detailSaveNoteBtn: "#detailSaveNoteBtn",
  detailVoteInput: "#detailVoteInput",
  filterPillSeries: ".filter-pill[data-filter=\"series\"]",
  genreBarsBarRow: "#genreBars .bar-row",
  genreBarsGenreBubble: "#genreBars .genre-bubble",
  genreBubbleTextCount: ".genre-bubble-text .count",
  genreBubbleTextLabel: ".genre-bubble-text .label",
  genreBubbleTextName: ".genre-bubble-text .name",
  genreBubbleTextVote: ".genre-bubble-text .vote",
  genreViewToggleGenreViewBtnBars: "#genreViewToggle .genre-view-btn[data-genre-view=\"bars\"]",
  genreViewToggleGenreViewBtnBubbles: "#genreViewToggle .genre-view-btn[data-genre-view=\"bubbles\"]",
  libraryListListItem: "#libraryList .list-item",
  navBtnScreen: ".nav__btn[data-screen]",
  navBtnScreenHome: ".nav__btn[data-screen=\"home\"]",
  navBtnScreenStats: ".nav__btn[data-screen=\"stats\"]",
  openStoredDetail: ".open-stored-detail",
  openWatchAll: "#openWatchAll",
  podiumCardTitle: ".podium-card__title",
  podiumCardVote: ".podium-card__vote",
  posterCard: ".poster-card",
  posterCardMeta: ".poster-card__meta",
  posterCardTag: ".poster-card__tag",
  posterCardTitle: ".poster-card__title",
  rankExpandBtnCount: ".rank-expand-btn__count",
  rankExpandBtnLabel: ".rank-expand-btn__label",
  rankRowPos: ".rank-row__pos",
  rankRowTitle: ".rank-row__title",
  resultsEmpty: "#resultsEmpty",
  resultsPosterCard: "#results .poster-card",
  screenDetail: "#screen-detail",
  screenHome: "#screen-home",
  searchBtn: "#searchBtn",
  searchInput: "#searchInput",
  searchInputWrap: ".search-input-wrap",
  shelfCardOpenStoredDetail: ".shelf-card.open-stored-detail",
  shelfCardVote: ".shelf-card__vote",
  toastError: ".toast.error",
  toastSuccess: ".toast.success",
  tonightCardAffinity: ".tonight-card__affinity",
  tonightCardReason: ".tonight-card__reason",
  tonightHint: ".tonight__hint",
  tonightSoloPosterCard: ".tonight-solo .poster-card",
  top100ListRankRow: "#top100List .rank-row",
  top100PodiumPodiumCard: "#top100Podium .podium-card",
  top100SeriesListRankRow: "#top100SeriesList .rank-row",
  top100SeriesPodiumPodiumCard: "#top100SeriesPodium .podium-card",
  watchShelfShelfCard: "#watchShelf .shelf-card",
} as const;
