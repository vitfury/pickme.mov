import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';
import type {
  FeedResponse,
  FeedFilters,
  SwipeAction,
  SwipeResponse,
  UndoResponse,
  WatchlistResponse,
  WatchlistFilters,
  WatchlistItem,
  BookmarkResponse,
  BookmarkFilters,
  SearchResponse,
  Genre,
  Provider,
  Collection,
  ContentDetail,
  PersonDetail,
  FilmographyItem,
  User,
  UserStats,
  UserPreferences,
  OnboardingSeed,
} from '@/types';

// --- Feed ---

export function useFeed(filters: FeedFilters) {
  return useQuery<FeedResponse>({
    queryKey: ['feed', filters],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filters.contentType) params.contentType = filters.contentType;
      if (filters.genres?.length) params.genres = filters.genres.join(',');
      if (filters.yearMin) params.yearMin = String(filters.yearMin);
      if (filters.yearMax) params.yearMax = String(filters.yearMax);
      if (filters.ratingMin) params.ratingMin = String(filters.ratingMin);
      if (filters.ratingMax) params.ratingMax = String(filters.ratingMax);
      if (filters.runtimeMin) params.runtimeMin = String(filters.runtimeMin);
      if (filters.runtimeMax) params.runtimeMax = String(filters.runtimeMax);
      if (filters.certification?.length) params.certification = filters.certification.join(',');
      if (filters.providers?.length) params.providers = filters.providers.join(',');
      if (filters.countries?.length) params.countries = filters.countries.join(',');
      if (filters.personId) params.personId = String(filters.personId);
      if (filters.collectionId) params.collectionId = String(filters.collectionId);
      if (filters.awards) params.awards = filters.awards;
      const { data } = await api.get('/feed', { params });
      return data;
    },
  });
}

export function useFeedInfinite(filters: FeedFilters) {
  return useInfiniteQuery<FeedResponse>({
    queryKey: ['feed-infinite', filters],
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string> = {};
      if (filters.contentType) params.contentType = filters.contentType;
      if (filters.genres?.length) params.genres = filters.genres.join(',');
      if (filters.yearMin) params.yearMin = String(filters.yearMin);
      if (filters.yearMax) params.yearMax = String(filters.yearMax);
      if (filters.ratingMin) params.ratingMin = String(filters.ratingMin);
      if (filters.ratingMax) params.ratingMax = String(filters.ratingMax);
      if (filters.runtimeMin) params.runtimeMin = String(filters.runtimeMin);
      if (filters.runtimeMax) params.runtimeMax = String(filters.runtimeMax);
      if (filters.certification?.length) params.certification = filters.certification.join(',');
      if (filters.providers?.length) params.providers = filters.providers.join(',');
      if (filters.countries?.length) params.countries = filters.countries.join(',');
      if (filters.personId) params.personId = String(filters.personId);
      if (filters.collectionId) params.collectionId = String(filters.collectionId);
      if (filters.awards) params.awards = filters.awards;
      params.offset = String(pageParam);
      const { data } = await api.get('/feed', { params });
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.remaining > 0 ? lastPage.offset : undefined,
  });
}

export function useSwipe() {
  const queryClient = useQueryClient();
  return useMutation<SwipeResponse, Error, { contentId: number; action: SwipeAction }>({
    mutationFn: async ({ contentId, action }) => {
      const { data } = await api.post('/feed/swipe', { contentId, action });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });
}

export function useUndo() {
  return useMutation<UndoResponse, Error>({
    mutationFn: async () => {
      const { data } = await api.post('/feed/undo');
      return data;
    },
  });
}

// --- Watchlist ---

export function useWatchlist(filters: WatchlistFilters) {
  return useQuery<WatchlistResponse>({
    queryKey: ['watchlist', filters],
    queryFn: async () => {
      const { data } = await api.get('/watchlist', { params: filters });
      return data;
    },
  });
}

export function useUpdateWatchlistItem() {
  const queryClient = useQueryClient();
  return useMutation<
    WatchlistItem,
    Error,
    { contentId: number; updates: Partial<Pick<WatchlistItem, 'watched' | 'personalRating' | 'watchedDate' | 'notes'>> }
  >({
    mutationFn: async ({ contentId, updates }) => {
      const { data } = await api.patch(`/watchlist/${contentId}`, updates);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (contentId) => {
      await api.delete(`/watchlist/${contentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

// --- Bookmarks ---

export function useBookmarks(filters: BookmarkFilters) {
  return useQuery<BookmarkResponse>({
    queryKey: ['bookmarks', filters],
    queryFn: async () => {
      const { data } = await api.get('/bookmarks', { params: filters });
      return data;
    },
  });
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();
  return useMutation<{ bookmarked: boolean }, Error, number>({
    mutationFn: async (contentId) => {
      const { data } = await api.post('/bookmarks', { contentId });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['feed-infinite'] });
    },
  });
}

// --- Search ---

export function useSearch(query: string, type?: 'content' | 'person', sort?: 'relevance' | 'rating' | 'popularity') {
  return useQuery<SearchResponse>({
    queryKey: ['search', query, type, sort],
    queryFn: async () => {
      const params: Record<string, string> = { q: query };
      if (type) params.type = type;
      if (sort) params.sort = sort;
      const { data } = await api.get('/search', { params });
      return data;
    },
    enabled: query.length >= 2,
  });
}

// --- Filters ---

export function useGenres() {
  return useQuery<{ genres: Genre[] }>({
    queryKey: ['genres'],
    queryFn: async () => {
      const { data } = await api.get('/filters/genres');
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useProviders() {
  return useQuery<{ providers: Provider[] }>({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data } = await api.get('/filters/providers');
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useCollections() {
  return useQuery<{ collections: Collection[] }>({
    queryKey: ['collections'],
    queryFn: async () => {
      const { data } = await api.get('/filters/collections');
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useCertifications() {
  return useQuery<{ certifications: string[] }>({
    queryKey: ['certifications'],
    queryFn: async () => {
      const { data } = await api.get('/filters/certifications');
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useCountries() {
  return useQuery<{ countries: { code: string; name: string; flag: string; count: number }[] }>({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data } = await api.get('/filters/countries');
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}

// --- Content Detail ---

export function useContentDetail(id: number | null) {
  return useQuery<ContentDetail>({
    queryKey: ['content', id],
    queryFn: async () => {
      const { data } = await api.get(`/content/${id}`);
      return data;
    },
    enabled: id !== null,
  });
}

// --- People ---

export function usePerson(id: number | null) {
  return useQuery<PersonDetail>({
    queryKey: ['person', id],
    queryFn: async () => {
      const { data } = await api.get(`/people/${id}`);
      return data;
    },
    enabled: id !== null,
  });
}

export function usePersonFilmography(id: number | null) {
  return useQuery<{ items: FilmographyItem[] }>({
    queryKey: ['person-filmography', id],
    queryFn: async () => {
      const { data } = await api.get(`/people/${id}/filmography`);
      return data;
    },
    enabled: id !== null,
  });
}

// --- Onboarding ---

export function useOnboardingGenres() {
  return useQuery<{ genres: Genre[] }>({
    queryKey: ['onboarding-genres'],
    queryFn: async () => {
      const { data } = await api.get('/onboarding/genres');
      return data;
    },
  });
}

export function useOnboardingSeeds() {
  return useQuery<{ seeds: OnboardingSeed[] }>({
    queryKey: ['onboarding-seeds'],
    queryFn: async () => {
      const { data } = await api.get('/onboarding/seeds');
      return data;
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation<
    { success: boolean; maturityScore: number; message: string },
    Error,
    { selectedGenres: number[]; movieRatings: { contentId: number; action: SwipeAction }[] }
  >({
    mutationFn: async (body) => {
      const { data } = await api.post('/onboarding/complete', body);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });
}

// --- User ---

export function useUserProfile() {
  return useQuery<User>({
    queryKey: ['user'],
    queryFn: async () => {
      const { data } = await api.get('/users/me');
      return data;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation<User, Error, Partial<Pick<User, 'locale' | 'theme'>>>({
    mutationFn: async (updates) => {
      const { data } = await api.patch('/users/me', updates);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user'], data);
    },
  });
}

export function useUserStats() {
  return useQuery<UserStats>({
    queryKey: ['user-stats'],
    queryFn: async () => {
      const { data } = await api.get('/users/me/stats');
      return data;
    },
  });
}

export function useUserPreferences() {
  return useQuery<UserPreferences>({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const { data } = await api.get('/users/me/preferences');
      return data;
    },
  });
}

export function useResetPreferences() {
  const queryClient = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      await api.post('/users/me/reset-preferences');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-stats'] });
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
