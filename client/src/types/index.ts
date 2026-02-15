export type ContentType = 'movie' | 'series' | 'animation';
export type SwipeAction = 'like' | 'dislike' | 'skip';
export type PersonRole = 'actor' | 'director' | 'writer';
export type ProviderType = 'flatrate' | 'rent' | 'buy';
export type AwardCategory =
  | 'picture'
  | 'director'
  | 'actor'
  | 'actress'
  | 'supporting_actor'
  | 'supporting_actress'
  | 'screenplay'
  | 'cinematography'
  | 'score'
  | 'song'
  | 'animated'
  | 'international'
  | 'other';

export interface User {
  id: number;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  locale: 'uk' | 'en';
  theme: 'dark' | 'light';
  onboardingCompleted: boolean;
}

export interface Genre {
  id: number;
  name: string;
  emoji: string;
  contentCount?: number;
  posterPath?: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  photoPath: string | null;
  billingOrder: number;
}

export interface Director {
  id: number;
  name: string;
  photoPath: string | null;
}

export interface Award {
  category: AwardCategory;
  year: number;
  won: boolean;
  contentTitle?: string;
}

export interface Provider {
  id: number;
  name: string;
  logoPath: string | null;
  type?: ProviderType;
}

export interface FeedCard {
  id: number;
  tmdbId: number;
  contentType: ContentType;
  title: string;
  originalTitle: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  runtime: number | null;
  certification: string | null;
  productionCountries: string[];
  tmdbRating: number | null;
  imdbRating: number | null;
  overview: string;
  genres: Genre[];
  cast: CastMember[];
  directors: Director[];
  awards: Award[];
  providers: Provider[];
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
  releaseDate: string;
  tmdbRating: number | null;
  contentType: ContentType;
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

export interface SearchContentResult {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  contentType: ContentType;
  tmdbRating: number | null;
}

export interface SearchPersonResult {
  id: number;
  name: string;
  photoPath: string | null;
  knownFor: PersonRole;
}

export interface SearchResponse {
  content: SearchContentResult[];
  people: SearchPersonResult[];
}

export interface PersonDetail {
  id: number;
  name: string;
  photoPath: string | null;
  biography: string | null;
  knownFor: PersonRole;
  awards: Award[];
  filmographyCount: number;
}

export interface FilmographyItem {
  contentId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  tmdbRating: number | null;
  role: PersonRole;
  inWatchlist: boolean;
  swiped: SwipeAction | null;
}

export interface ContentDetail {
  id: number;
  tmdbId: number;
  contentType: ContentType;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  runtime: number | null;
  certification: string | null;
  tmdbRating: number | null;
  imdbRating: number | null;
  imdbId: string | null;
  genres: Genre[];
  cast: CastMember[];
  directors: Director[];
  writers: Director[];
  awards: Award[];
  providers: Provider[];
  keywords: string[];
  collections: { id: number; name: string }[];
  recommendationReasons: string[];
  userStatus: {
    swiped: SwipeAction | null;
    inWatchlist: boolean;
    watched: boolean;
    personalRating: number | null;
  };
}

export interface Collection {
  id: number;
  name: string;
  posterPath: string | null;
  contentCount: number;
}

export interface UserStats {
  totalSwiped: number;
  likes: number;
  dislikes: number;

  skips: number;
  watchlistSize: number;
  watched: number;
  topGenres: { genre: string; score: number }[];
  topDirectors: { name: string; score: number }[];
  topActors: { name: string; score: number }[];
}

export interface UserPreferences {
  maturityScore: number;
  preferences: {
    genre: PreferenceEntity[];
    director: PreferenceEntity[];
    actor: PreferenceEntity[];
    keyword: PreferenceEntity[];
    decade: PreferenceEntity[];
    collection: PreferenceEntity[];
  };
}

export interface PreferenceEntity {
  entityId: number;
  name: string;
  score: number;
  interactions: number;
}

export interface OnboardingSeed {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  genres: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface FeedFilters {
  contentType?: ContentType;
  offset?: number;
  genres?: number[];
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
  ratingMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  certification?: string[];
  providers?: number[];
  countries?: string[];
  personId?: number;
  collectionId?: number;
  awards?: 'winner' | 'nominated';
}

export interface WatchlistFilters {
  filter?: 'all' | 'watched' | 'unwatched';
  sort?: 'added' | 'rating' | 'year' | 'personal_rating' | 'title';
  order?: 'asc' | 'desc';
  contentType?: ContentType;
  page?: number;
  limit?: number;
}
