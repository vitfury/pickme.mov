import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { useFeed, useSwipe, useUndo } from '@/api/hooks';
import { useShakeDetector } from '@/hooks/useShakeDetector';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import CardStack from '@/components/cards/CardStack';
import type { SwipeAction } from '@/types';

export default function Feed() {
  const { t } = useTranslation();
  const cards = useFeedStore((s) => s.currentCards);
  const setCards = useFeedStore((s) => s.setCards);
  const removeTopCard = useFeedStore((s) => s.removeTopCard);
  const addToHistory = useFeedStore((s) => s.addToHistory);
  const popHistory = useFeedStore((s) => s.popHistory);
  const restoreCard = useFeedStore((s) => s.restoreCard);
  const contentType = useFeedStore((s) => s.contentType);
  const activeFilters = useFeedStore((s) => s.activeFilters);

  const filters = { ...activeFilters, contentType };
  const { data, isLoading } = useFeed(filters);
  const swipeMutation = useSwipe();
  const undoMutation = useUndo();

  // Load cards from API when feed data changes
  useEffect(() => {
    if (data?.cards && cards.length === 0) {
      setCards(data.cards);
    }
  }, [data, cards.length, setCards]);

  // Pre-fetch next batch when cards running low
  useEffect(() => {
    if (cards.length < 5 && data?.cards) {
      // TanStack Query will handle refetch via queryKey change
    }
  }, [cards.length, data?.cards]);

  const handleSwipe = useCallback(
    (cardId: number, direction: 'left' | 'right' | 'up') => {
      const actionMap: Record<string, SwipeAction> = {
        left: 'dislike',
        right: 'like',
        up: 'superlike',
      };
      const action = actionMap[direction];
      const card = cards.find((c) => c.id === cardId);

      if (card) {
        addToHistory({ card, action });
        removeTopCard();
        swipeMutation.mutate({ contentId: cardId, action });
      }
    },
    [cards, addToHistory, removeTopCard, swipeMutation],
  );

  const handleUndo = useCallback(async () => {
    const entry = popHistory();
    if (!entry) return;
    try {
      await undoMutation.mutateAsync();
      restoreCard(entry.card);
    } catch {
      // If undo fails, put it back in history
      addToHistory(entry);
    }
  }, [popHistory, undoMutation, restoreCard, addToHistory]);

  const handleButtonSwipe = useCallback(
    (direction: 'left' | 'right' | 'up') => {
      const topCard = cards[0];
      if (topCard) {
        handleSwipe(topCard.id, direction);
      }
    },
    [cards, handleSwipe],
  );

  // Shake to undo
  useShakeDetector(handleUndo);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onLeft: () => handleButtonSwipe('left'),
    onRight: () => handleButtonSwipe('right'),
    onUp: () => handleButtonSwipe('up'),
    onUndo: handleUndo,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Card area */}
      <div className="flex-1 relative overflow-hidden">
        <CardStack
          cards={cards}
          onSwipe={handleSwipe}
          isLoading={isLoading}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-5 pb-4 pt-2 px-4">
        {/* Undo - desktop only */}
        <button
          onClick={handleUndo}
          className="hidden md:flex w-10 h-10 items-center justify-center rounded-full
            bg-surface-light text-text-muted hover:text-accent transition-colors"
          title={t('feed.undo')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>

        {/* Dislike */}
        <button
          onClick={() => handleButtonSwipe('left')}
          disabled={cards.length === 0}
          className="w-14 h-14 rounded-full bg-dislike/10 border-2 border-dislike text-dislike
            flex items-center justify-center hover:bg-dislike/20 transition-colors
            disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Superlike */}
        <button
          onClick={() => handleButtonSwipe('up')}
          disabled={cards.length === 0}
          className="w-12 h-12 rounded-full bg-superlike/10 border-2 border-superlike text-superlike
            flex items-center justify-center hover:bg-superlike/20 transition-colors
            disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7.4-6.3-4.8-6.3 4.8 2.3-7.4-6-4.6h7.6z" />
          </svg>
        </button>

        {/* Like */}
        <button
          onClick={() => handleButtonSwipe('right')}
          disabled={cards.length === 0}
          className="w-14 h-14 rounded-full bg-like/10 border-2 border-like text-like
            flex items-center justify-center hover:bg-like/20 transition-colors
            disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
