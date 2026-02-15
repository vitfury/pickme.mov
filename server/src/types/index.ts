export interface UserProfile {
  id: number;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  locale: string;
  theme: string;
  onboardingCompleted: boolean;
}

export interface FeedCard {
  id: number;
  tmdbId: number;
  contentType: string;
  title: string;
  originalTitle: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  runtime: number | null;
  certification: string | null;
  tmdbRating: number | null;
  imdbRating: number | null;
  overview: string | null;
  genres: { id: number; name: string; emoji: string | null }[];
  cast: { id: number; name: string; character: string | null; photoPath: string | null; billingOrder: number | null }[];
  directors: { id: number; name: string; photoPath: string | null }[];
  awards: { category: string; year: number; won: boolean }[];
  providers: { id: number; name: string; logoPath: string | null; type: string }[];
  recommendationReason: string | null;
  feedScore: number;
}

export interface FeedResponse {
  cards: FeedCard[];
  remaining: number;
  maturityScore: number;
  offset: number;
}

export interface SwipeResponse {
  success: boolean;
  addedToWatchlist: boolean;
  maturityScore: number;
  preferencesUpdated: string[];
}

export interface UndoResponse {
  success: boolean;
  restoredContent: {
    id: number;
    title: string;
    posterPath: string | null;
  };
}

export interface WatchlistItem {
  contentId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  tmdbRating: number | null;
  contentType: string;
  watched: boolean;
  personalRating: number | null;
  watchedDate: string | null;
  notes: string | null;
  addedAt: string;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  total: number;
  counts: {
    all: number;
    watched: number;
    unwatched: number;
  };
}

export interface SearchResult {
  content: {
    id: number;
    title: string;
    posterPath: string | null;
    releaseDate: string | null;
    contentType: string;
    tmdbRating: number | null;
  }[];
  people: {
    id: number;
    name: string;
    photoPath: string | null;
    knownFor: string | null;
  }[];
}

export interface UserStats {
  totalSwiped: number;
  likes: number;
  dislikes: number;
  superlikes: number;
  watchlistSize: number;
  watched: number;
  topGenres: { genre: string; score: number }[];
  topDirectors: { name: string; score: number }[];
  topActors: { name: string; score: number }[];
}

export interface UserPreferencesResponse {
  maturityScore: number;
  preferences: {
    genre: PreferenceEntry[];
    director: PreferenceEntry[];
    actor: PreferenceEntry[];
    keyword: PreferenceEntry[];
    decade: PreferenceEntry[];
    collection: PreferenceEntry[];
  };
}

export interface PreferenceEntry {
  entityId: number;
  name: string;
  score: number;
  interactions: number;
}

export interface ContentDetail {
  id: number;
  tmdbId: number;
  contentType: string;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  runtime: number | null;
  certification: string | null;
  tmdbRating: number | null;
  imdbRating: number | null;
  imdbId: string | null;
  genres: { id: number; name: string; emoji: string | null }[];
  cast: { id: number; name: string; character: string | null; photoPath: string | null; billingOrder: number | null }[];
  directors: { id: number; name: string; photoPath: string | null }[];
  writers: { id: number; name: string }[];
  awards: { category: string; year: number; won: boolean }[];
  providers: { id: number; name: string; logoPath: string | null; type: string }[];
  keywords: string[];
  collections: { id: number; name: string }[];
  recommendationReasons: string[];
  userStatus: {
    swiped: string | null;
    inWatchlist: boolean;
    watched: boolean;
    personalRating: number | null;
  };
}
