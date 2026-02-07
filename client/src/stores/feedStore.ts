import { create } from 'zustand';
import type { FeedCard, ContentType, FeedFilters } from '@/types';

interface SwipeHistoryEntry {
  card: FeedCard;
  action: 'like' | 'dislike' | 'superlike';
}

interface FeedState {
  currentCards: FeedCard[];
  swipeHistory: SwipeHistoryEntry[];
  activeFilters: FeedFilters;
  contentType: ContentType;
  setCards: (cards: FeedCard[]) => void;
  removeTopCard: () => FeedCard | undefined;
  addToHistory: (entry: SwipeHistoryEntry) => void;
  popHistory: () => SwipeHistoryEntry | undefined;
  setFilters: (filters: FeedFilters) => void;
  setContentType: (type: ContentType) => void;
  restoreCard: (card: FeedCard) => void;
}

export const useFeedStore = create<FeedState>()((set, get) => ({
  currentCards: [],
  swipeHistory: [],
  activeFilters: {},
  contentType: 'movie',

  setCards: (cards) => set({ currentCards: cards }),

  removeTopCard: () => {
    const cards = get().currentCards;
    if (cards.length === 0) return undefined;
    const top = cards[0];
    set({ currentCards: cards.slice(1) });
    return top;
  },

  addToHistory: (entry) =>
    set((state) => ({
      swipeHistory: [entry, ...state.swipeHistory].slice(0, 1),
    })),

  popHistory: () => {
    const history = get().swipeHistory;
    if (history.length === 0) return undefined;
    const last = history[0];
    set({ swipeHistory: history.slice(1) });
    return last;
  },

  setFilters: (filters) => set({ activeFilters: filters }),

  setContentType: (type) => set({ contentType: type, currentCards: [] }),

  restoreCard: (card) =>
    set((state) => ({
      currentCards: [card, ...state.currentCards],
    })),
}));
