import { create } from 'zustand';
import type { FeedCard, ContentType, FeedFilters, SwipeAction } from '@/types';

interface LastSwipe {
  card: FeedCard;
  action: SwipeAction;
}

interface FeedState {
  activeFilters: FeedFilters;
  contentType: ContentType;
  swipedCardIds: Set<number>;
  lastSwipe: LastSwipe | null;
  currentIndex: number;
  setFilters: (filters: FeedFilters) => void;
  setContentType: (type: ContentType) => void;
  addSwipedCard: (id: number) => void;
  removeSwipedCard: (id: number) => void;
  setLastSwipe: (swipe: LastSwipe | null) => void;
  setCurrentIndex: (index: number) => void;
  clearSwiped: () => void;
}

export const useFeedStore = create<FeedState>()((set) => ({
  activeFilters: {},
  contentType: 'movie',
  swipedCardIds: new Set(),
  lastSwipe: null,
  currentIndex: 0,

  setFilters: (filters) => set({ activeFilters: filters, swipedCardIds: new Set(), currentIndex: 0 }),

  setContentType: (type) => set({ contentType: type, swipedCardIds: new Set(), currentIndex: 0 }),

  addSwipedCard: (id) =>
    set((state) => {
      const next = new Set(state.swipedCardIds);
      next.add(id);
      return { swipedCardIds: next };
    }),

  removeSwipedCard: (id) =>
    set((state) => {
      const next = new Set(state.swipedCardIds);
      next.delete(id);
      return { swipedCardIds: next };
    }),

  setLastSwipe: (swipe) => set({ lastSwipe: swipe }),

  setCurrentIndex: (index) => set({ currentIndex: index }),

  clearSwiped: () => set({ swipedCardIds: new Set(), lastSwipe: null, currentIndex: 0 }),
}));
