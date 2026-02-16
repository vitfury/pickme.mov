import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, animate as fmAnimate } from 'framer-motion';
import { useFeedStore } from '@/stores/feedStore';
import { useFeedInfinite, useSwipe, useUndo, useToggleBookmark } from '@/api/hooks';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import FeedItem from '@/components/feed/FeedItem';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import type { FeedCard, SwipeAction } from '@/types';

interface HistoryEntry {
  previousIndex: number;
  apiAction: boolean;
  cardId?: number;
}

export default function Feed() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const contentType = useFeedStore((s) => s.contentType);
  const activeFilters = useFeedStore((s) => s.activeFilters);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [canUndo, setCanUndo] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isAnimatingRef = useRef(false);
  const actedOnRef = useRef<Set<number>>(new Set());
  const historyRef = useRef<HistoryEntry[]>([]);
  const currentIndexRef = useRef(0);
  const containerHeightRef = useRef(0);

  // Scroll position MotionValue — moves all cards as a group
  const scrollY = useMotionValue(0);

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
  const toggleBookmarkMutation = useToggleBookmark();

  const [localBookmarks, setLocalBookmarks] = useState<Map<number, boolean>>(new Map());

  // Keep refs in sync
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // Measure container height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      containerHeightRef.current = el.clientHeight;
      // Reposition on resize
      scrollY.set(-currentIndexRef.current * containerHeightRef.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollY]);

  // Flat card list
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

  // --- Animate scroll to a target index ---

  const animateToIndex = useCallback((newIndex: number, instant?: boolean) => {
    isAnimatingRef.current = true;
    currentIndexRef.current = newIndex;
    setCurrentIndex(newIndex);

    const target = -newIndex * containerHeightRef.current;
    if (instant) {
      scrollY.set(target);
      isAnimatingRef.current = false;
      return;
    }

    fmAnimate(scrollY, target, {
      type: 'tween',
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
      onComplete: () => { isAnimatingRef.current = false; },
    });
  }, [scrollY]);

  // --- Navigation ---

  const goNext = useCallback(() => {
    if (isAnimatingRef.current) return;
    if (currentIndex >= allCards.length - 1) return;

    const currentCard = allCards[currentIndex];
    let hadApiAction = false;
    if (currentCard && !actedOnRef.current.has(currentCard.id)) {
      actedOnRef.current.add(currentCard.id);
      swipeMutation.mutate({ contentId: currentCard.id, action: 'skip' });
      hadApiAction = true;
    }

    historyRef.current.push({
      previousIndex: currentIndex,
      apiAction: hadApiAction,
      cardId: hadApiAction ? currentCard?.id : undefined,
    });
    setCanUndo(true);

    animateToIndex(currentIndex + 1);

    if (currentIndex >= allCards.length - 4 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [currentIndex, allCards, swipeMutation, hasNextPage, isFetchingNextPage, fetchNextPage, animateToIndex]);

  const goPrev = useCallback(() => {
    if (isAnimatingRef.current) return;
    if (currentIndex <= 0) return;

    historyRef.current.push({
      previousIndex: currentIndex,
      apiAction: false,
    });
    setCanUndo(true);

    animateToIndex(currentIndex - 1);
  }, [currentIndex, animateToIndex]);

  // --- Swipe (like / dislike) ---

  const handleSwipe = useCallback(
    (card: FeedCard, action: SwipeAction) => {
      if (action === 'skip') return;

      actedOnRef.current.add(card.id);
      swipeMutation.mutate({ contentId: card.id, action });

      if (currentIndex < allCards.length - 1) {
        historyRef.current.push({
          previousIndex: currentIndex,
          apiAction: true,
          cardId: card.id,
        });
        setCanUndo(true);

        animateToIndex(currentIndex + 1);

        if (currentIndex >= allCards.length - 4 && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }
    },
    [currentIndex, allCards.length, swipeMutation, hasNextPage, isFetchingNextPage, fetchNextPage, animateToIndex],
  );

  // --- Undo ---

  const handleUndo = useCallback(async () => {
    if (historyRef.current.length === 0) return;
    if (isAnimatingRef.current) return;

    const entry = historyRef.current.pop()!;
    setCanUndo(historyRef.current.length > 0);

    if (entry.apiAction) {
      try {
        await undoMutation.mutateAsync();
      } catch {
        // API undo failed, still navigate back
      }
      if (entry.cardId) {
        actedOnRef.current.delete(entry.cardId);
      }
    }

    animateToIndex(entry.previousIndex);
  }, [undoMutation, animateToIndex]);

  // --- Vertical drag (from FeedItem) ---

  const handleVerticalDrag = useCallback((offsetY: number) => {
    const base = -currentIndexRef.current * containerHeightRef.current;
    scrollY.set(base + offsetY);
  }, [scrollY]);

  const handleVerticalDragEnd = useCallback(() => {
    // Snap back to current card position
    const target = -currentIndexRef.current * containerHeightRef.current;
    fmAnimate(scrollY, target, {
      type: 'spring',
      stiffness: 300,
      damping: 30,
    });
  }, [scrollY]);

  // --- Bookmark ---

  const handleToggleBookmark = useCallback((card: FeedCard) => {
    const current = localBookmarks.get(card.id) ?? card.isBookmarked ?? false;
    setLocalBookmarks((prev) => new Map(prev).set(card.id, !current));
    toggleBookmarkMutation.mutate(card.id);
  }, [localBookmarks, toggleBookmarkMutation]);

  const getBookmarkStatus = useCallback((card: FeedCard) => {
    return localBookmarks.get(card.id) ?? card.isBookmarked ?? false;
  }, [localBookmarks]);

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

  // --- Touch navigation ---

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
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  if (allCards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
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
      <div ref={containerRef} className="h-full overflow-hidden relative">
        {/* Inner container — moves all cards together via scrollY */}
        <motion.div style={{ y: scrollY }} className="h-full relative">
          {renderWindow.map(({ index, card }) => (
            <div
              key={card.id}
              className="absolute inset-0 will-change-transform"
              style={{
                transform: `translateY(${index * 100}%)`,
              }}
            >
              <FeedItem
                card={card}
                onSwipe={(action) => handleSwipe(card, action)}
                onNavigate={handleNavigate}
                onVerticalDrag={handleVerticalDrag}
                onVerticalDragEnd={handleVerticalDragEnd}
                onUndo={handleUndo}
                onTap={() => navigate(`/content/${card.id}`)}
                canUndo={canUndo}
                isBookmarked={getBookmarkStatus(card)}
                onToggleBookmark={() => handleToggleBookmark(card)}
              />
            </div>
          ))}
        </motion.div>
      </div>
    </>
  );
}
