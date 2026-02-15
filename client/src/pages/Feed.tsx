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

const ANIM_DURATION = 500; // ms — transition duration

export default function Feed() {
  const { t } = useTranslation();
  const contentType = useFeedStore((s) => s.contentType);
  const activeFilters = useFeedStore((s) => s.activeFilters);
  const setLastSwipe = useFeedStore((s) => s.setLastSwipe);
  const lastSwipe = useFeedStore((s) => s.lastSwipe);

  const [detailCard, setDetailCard] = useState<FeedCard | null>(null);
  const [undoToast, setUndoToast] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAnimatingRef = useRef(false);
  const actedOnRef = useRef<Set<number>>(new Set()); // card IDs with recorded like/dislike/skip

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

  // Flat card list — NO filtering, stable array
  const allCards = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.cards);
  }, [data?.pages]);

  // 3-card render window: [prev, current, next]
  const renderWindow = useMemo(() => {
    const items: { index: number; card: FeedCard }[] = [];
    for (let i = currentIndex - 1; i <= currentIndex + 1; i++) {
      if (i >= 0 && i < allCards.length) {
        items.push({ index: i, card: allCards[i]! });
      }
    }
    return items;
  }, [currentIndex, allCards]);

  // --- Navigation ---

  const goNext = useCallback(() => {
    if (isAnimatingRef.current) return;
    if (currentIndex >= allCards.length - 1) return;

    // Record skip for current card if not already acted on
    const currentCard = allCards[currentIndex];
    if (currentCard && !actedOnRef.current.has(currentCard.id)) {
      actedOnRef.current.add(currentCard.id);
      swipeMutation.mutate({ contentId: currentCard.id, action: 'skip' });
    }

    // Clear undo when scrolling past
    setLastSwipe(null);
    setUndoToast(false);
    clearTimeout(undoTimerRef.current);

    isAnimatingRef.current = true;
    setCurrentIndex((prev) => prev + 1);

    // Prefetch more cards when nearing end
    if (currentIndex >= allCards.length - 4 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }

    setTimeout(() => {
      isAnimatingRef.current = false;
    }, ANIM_DURATION);
  }, [currentIndex, allCards, swipeMutation, setLastSwipe, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const goPrev = useCallback(() => {
    if (isAnimatingRef.current) return;
    if (currentIndex <= 0) return;

    isAnimatingRef.current = true;
    setCurrentIndex((prev) => prev - 1);

    setTimeout(() => {
      isAnimatingRef.current = false;
    }, ANIM_DURATION);
  }, [currentIndex]);

  // --- Swipe (like / dislike) ---

  const handleSwipe = useCallback(
    (card: FeedCard, action: SwipeAction) => {
      if (action === 'skip') return; // skips handled by goNext

      // Mark acted so goNext won't double-skip
      actedOnRef.current.add(card.id);
      swipeMutation.mutate({ contentId: card.id, action });

      // Undo toast
      setLastSwipe({ card, action });
      setUndoToast(true);
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        setUndoToast(false);
        setLastSwipe(null);
      }, 3000);

      // Advance to next card
      if (currentIndex < allCards.length - 1) {
        isAnimatingRef.current = true;
        setCurrentIndex((prev) => prev + 1);

        if (currentIndex >= allCards.length - 4 && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }

        setTimeout(() => {
          isAnimatingRef.current = false;
        }, ANIM_DURATION);
      }
    },
    [currentIndex, allCards.length, swipeMutation, setLastSwipe, hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  // --- Undo ---

  const handleUndo = useCallback(async () => {
    if (!lastSwipe) return;
    try {
      await undoMutation.mutateAsync();
      actedOnRef.current.delete(lastSwipe.card.id);
      setUndoToast(false);
      setLastSwipe(null);
      clearTimeout(undoTimerRef.current);

      // Go back to the card we just swiped
      isAnimatingRef.current = true;
      setCurrentIndex((prev) => Math.max(0, prev - 1));
      setTimeout(() => {
        isAnimatingRef.current = false;
      }, ANIM_DURATION);
    } catch {
      // undo failed
    }
  }, [lastSwipe, undoMutation, setLastSwipe]);

  // --- Wheel handler ---

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isAnimatingRef.current) return;
      if (e.deltaY > 0) goNext();
      else if (e.deltaY < 0) goPrev();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [goNext, goPrev]);

  // --- Touch navigation (handled by FeedItem via onNavigate) ---

  const handleNavigate = useCallback((direction: 'next' | 'prev') => {
    if (direction === 'next') goNext();
    else goPrev();
  }, [goNext, goPrev]);

  // --- Keyboard ---

  const getCurrentCard = useCallback(() => allCards[currentIndex] ?? null, [allCards, currentIndex]);

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

  // --- Render ---

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
      {/* Viewport — clips everything, no native scroll */}
      <div ref={containerRef} className="h-[100dvh] overflow-hidden relative">
        {renderWindow.map(({ index, card }) => (
          <div
            key={card.id}
            className="absolute inset-0 will-change-transform"
            style={{
              transform: `translateY(${(index - currentIndex) * 100}%)`,
              transition: `transform ${ANIM_DURATION}ms cubic-bezier(0.16, 1, 0.3, 1)`,
            }}
          >
            <FeedItem
              card={card}
              onSwipe={(action) => handleSwipe(card, action)}
              onOpenDetails={() => setDetailCard(card)}
              onNavigate={handleNavigate}
            />
          </div>
        ))}
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
