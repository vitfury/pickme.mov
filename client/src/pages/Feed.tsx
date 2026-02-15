import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedInfinite, useSwipe, useUndo } from '@/api/hooks';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import FeedItem from '@/components/feed/FeedItem';
import DetailsSheet from '@/components/feed/DetailsSheet';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import type { FeedCard, SwipeAction } from '@/types';

const SCROLL_COOLDOWN = 500; // ms before another scroll is allowed
const TOUCH_SWIPE_THRESHOLD = 50; // px vertical distance to trigger scroll

export default function Feed() {
  const { t } = useTranslation();
  const contentType = useFeedStore((s) => s.contentType);
  const activeFilters = useFeedStore((s) => s.activeFilters);
  const swipedCardIds = useFeedStore((s) => s.swipedCardIds);
  const addSwipedCard = useFeedStore((s) => s.addSwipedCard);
  const removeSwipedCard = useFeedStore((s) => s.removeSwipedCard);
  const setLastSwipe = useFeedStore((s) => s.setLastSwipe);
  const lastSwipe = useFeedStore((s) => s.lastSwipe);

  const [detailCard, setDetailCard] = useState<FeedCard | null>(null);
  const [undoToast, setUndoToast] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewedCardsRef = useRef<Set<number>>(new Set());
  const swipedActionsRef = useRef<Set<number>>(new Set());
  const isAnimatingRef = useRef(false);
  const touchStartYRef = useRef(0);
  const prevCardRef = useRef<{ id: number; index: number } | null>(null);

  const filters = { ...activeFilters, contentType };
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeedInfinite(filters);

  const swipeMutation = useSwipe();
  const undoMutation = useUndo();

  // Flatten all pages into single cards array, filtering out swiped
  const allCards = useMemo(() => {
    if (!data?.pages) return [];
    const cards = data.pages.flatMap((page) => page.cards);
    return cards.filter((c) => !swipedCardIds.has(c.id));
  }, [data?.pages, swipedCardIds]);

  const handleSwipe = useCallback(
    (card: FeedCard, action: SwipeAction) => {
      addSwipedCard(card.id);
      swipedActionsRef.current.add(card.id);
      swipeMutation.mutate({ contentId: card.id, action });

      if (action !== 'skip') {
        setLastSwipe({ card, action });
        setUndoToast(true);
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = setTimeout(() => {
          setUndoToast(false);
          setLastSwipe(null);
        }, 3000);
      }
    },
    [addSwipedCard, swipeMutation, setLastSwipe],
  );

  const handleUndo = useCallback(async () => {
    if (!lastSwipe) return;
    try {
      await undoMutation.mutateAsync();
      removeSwipedCard(lastSwipe.card.id);
      swipedActionsRef.current.delete(lastSwipe.card.id);
      setUndoToast(false);
      setLastSwipe(null);
      clearTimeout(undoTimerRef.current);
    } catch {
      // undo failed, keep state
    }
  }, [lastSwipe, undoMutation, removeSwipedCard, setLastSwipe]);

  // Record skip when navigating away from a card
  const recordSkipIfNeeded = useCallback(
    (cardIndex: number) => {
      const card = allCards[cardIndex];
      if (!card) return;
      if (viewedCardsRef.current.has(card.id) && !swipedActionsRef.current.has(card.id)) {
        handleSwipe(card, 'skip');
      }
    },
    [allCards, handleSwipe],
  );

  // Navigate to a specific index
  const goToIndex = useCallback(
    (index: number) => {
      if (isAnimatingRef.current) return;
      const clamped = Math.max(0, Math.min(index, allCards.length - 1));
      if (clamped === currentIndex) return;

      // Record skip on the card we're leaving
      recordSkipIfNeeded(currentIndex);

      isAnimatingRef.current = true;
      setCurrentIndex(clamped);

      // Mark new card as viewed
      const newCard = allCards[clamped];
      if (newCard) viewedCardsRef.current.add(newCard.id);

      // Fetch next page when nearing end
      if (clamped >= allCards.length - 3 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }

      setTimeout(() => {
        isAnimatingRef.current = false;
      }, SCROLL_COOLDOWN);
    },
    [currentIndex, allCards, hasNextPage, isFetchingNextPage, fetchNextPage, recordSkipIfNeeded],
  );

  const goNext = useCallback(() => goToIndex(currentIndex + 1), [currentIndex, goToIndex]);
  const goPrev = useCallback(() => goToIndex(currentIndex - 1), [currentIndex, goToIndex]);

  // Mark first card as viewed on mount
  useEffect(() => {
    if (allCards.length > 0) {
      viewedCardsRef.current.add(allCards[0]!.id);
    }
  }, [allCards.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track prev card to detect skip when card is removed (swiped)
  useEffect(() => {
    const cur = allCards[currentIndex];
    if (prevCardRef.current && cur && prevCardRef.current.id !== cur.id) {
      // Cards shifted — a card was removed before/at current index
      // Mark the new current card as viewed
      viewedCardsRef.current.add(cur.id);
    }
    prevCardRef.current = cur ? { id: cur.id, index: currentIndex } : null;
  }, [allCards, currentIndex]);

  // Clamp index when cards get filtered out (after swipe removes a card)
  useEffect(() => {
    if (allCards.length > 0 && currentIndex >= allCards.length) {
      setCurrentIndex(allCards.length - 1);
    }
  }, [allCards.length, currentIndex]);

  // Intercept wheel events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isAnimatingRef.current) return;
      if (e.deltaY > 0) goNext();
      else if (e.deltaY < 0) goPrev();
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [goNext, goPrev]);

  // Intercept touch events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0]!.clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isAnimatingRef.current) return;
      const deltaY = touchStartYRef.current - (e.changedTouches[0]?.clientY ?? touchStartYRef.current);
      if (Math.abs(deltaY) < TOUCH_SWIPE_THRESHOLD) return;
      if (deltaY > 0) goNext();
      else goPrev();
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [goNext, goPrev]);

  // Keyboard shortcuts
  const getCurrentCard = useCallback(() => {
    return allCards[currentIndex] ?? null;
  }, [allCards, currentIndex]);

  useKeyboardShortcuts({
    onLeft: () => {
      const c = getCurrentCard();
      if (c) handleSwipe(c, 'dislike');
    },
    onRight: () => {
      const c = getCurrentCard();
      if (c) handleSwipe(c, 'like');
    },
    onUp: goPrev,
    onDown: goNext,
    onUndo: handleUndo,
  });

  if (isLoading && allCards.length === 0) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <Spinner size={32} />
      </div>
    );
  }

  if (allCards.length === 0) {
    return (
      <div className="flex items-center justify-center h-[100dvh]">
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
              <line x1="7" y1="2" x2="7" y2="22" />
              <line x1="17" y1="2" x2="17" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          }
          message={t('feed.noMore')}
          hint={t('feed.noMoreHint')}
        />
      </div>
    );
  }

  return (
    <>
      {/* Outer viewport — clips overflow */}
      <div
        ref={containerRef}
        className="h-[100dvh] overflow-hidden relative"
      >
        {/* Inner track — slides via translateY */}
        <div
          className="will-change-transform"
          style={{
            transform: `translateY(-${currentIndex * 100}dvh)`,
            transition: 'transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
        >
          {allCards.map((card) => (
            <div key={card.id} data-card-id={card.id} className="h-[100dvh] w-full">
              <FeedItem
                card={card}
                onSwipe={(action) => handleSwipe(card, action)}
                onOpenDetails={() => setDetailCard(card)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Details bottom sheet */}
      <DetailsSheet card={detailCard} onClose={() => setDetailCard(null)} />

      {/* Undo toast */}
      {undoToast && lastSwipe && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50
          bg-surface border border-border rounded-lg px-4 py-2.5 shadow-2xl
          flex items-center gap-3 animate-in slide-in-from-bottom-4">
          <span className="text-sm text-text">
            {lastSwipe.action === 'like' ? 'Liked' : 'Disliked'}{' '}
            <span className="font-medium text-accent">{lastSwipe.card.title}</span>
          </span>
          <button
            onClick={handleUndo}
            className="text-sm font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            {t('feed.undo')}
          </button>
        </div>
      )}
    </>
  );
}
