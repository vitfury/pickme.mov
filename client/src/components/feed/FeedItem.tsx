import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion';
import { useCallback, useRef } from 'react';
import { tmdbPoster } from '@/utils/image';
import { formatRuntime, formatDate, formatRating, countryFlag } from '@/utils/format';
import type { FeedCard, SwipeAction } from '@/types';

interface FeedItemProps {
  card: FeedCard;
  onSwipe: (action: SwipeAction) => void;
  onNavigate?: (direction: 'next' | 'prev') => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

const SWIPE_THRESHOLD = 120;
const FLY_DISTANCE = 800;
const DIRECTION_LOCK_THRESHOLD = 10; // px before locking gesture direction
const VERTICAL_THRESHOLD = 50; // px vertical distance to trigger navigation

export default function FeedItem({ card, onSwipe, onNavigate, onUndo, canUndo }: FeedItemProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const cardOpacity = useMotionValue(1);
  const directionRef = useRef<'none' | 'horizontal' | 'vertical'>('none');

  const rotation = useTransform(x, (v) => Math.max(-12, Math.min(12, v / 25)));
  const likeOpacity = useTransform(x, (v) => Math.max(0, Math.min(1, v / SWIPE_THRESHOLD)));
  const dislikeOpacity = useTransform(x, (v) => Math.max(0, Math.min(1, -v / SWIPE_THRESHOLD)));

  const handlePanStart = useCallback(() => {
    directionRef.current = 'none';
  }, []);

  const handlePan = useCallback((_: unknown, info: PanInfo) => {
    // Determine direction once after initial movement
    if (directionRef.current === 'none') {
      const absDx = Math.abs(info.offset.x);
      const absDy = Math.abs(info.offset.y);
      if (absDx > DIRECTION_LOCK_THRESHOLD || absDy > DIRECTION_LOCK_THRESHOLD) {
        directionRef.current = absDx > absDy ? 'horizontal' : 'vertical';
      }
    }

    if (directionRef.current === 'horizontal') {
      x.set(info.offset.x);
    } else if (directionRef.current === 'vertical') {
      y.set(info.offset.y);
    }
  }, [x, y]);

  const handlePanEnd = useCallback(
    async (_: unknown, info: PanInfo) => {
      const direction = directionRef.current;
      directionRef.current = 'none';

      // Vertical gesture → navigate between cards
      if (direction === 'vertical') {
        const offsetY = info.offset.y;
        if (offsetY < -VERTICAL_THRESHOLD) {
          y.set(0);
          onNavigate?.('next');
        } else if (offsetY > VERTICAL_THRESHOLD) {
          y.set(0);
          onNavigate?.('prev');
        } else {
          animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
        }
        return;
      }

      // Horizontal gesture → like / dislike
      if (direction === 'horizontal') {
        const offsetX = info.offset.x;
        if (offsetX > SWIPE_THRESHOLD) {
          await Promise.all([
            animate(x, FLY_DISTANCE, { duration: 0.3 }),
            animate(cardOpacity, 0, { duration: 0.3 }),
          ]);
          onSwipe('like');
          // Reset after fly-away so card is clean if undo brings it back
          requestAnimationFrame(() => { x.set(0); cardOpacity.set(1); });
        } else if (offsetX < -SWIPE_THRESHOLD) {
          await Promise.all([
            animate(x, -FLY_DISTANCE, { duration: 0.3 }),
            animate(cardOpacity, 0, { duration: 0.3 }),
          ]);
          onSwipe('dislike');
          requestAnimationFrame(() => { x.set(0); cardOpacity.set(1); });
        } else {
          animate(x, 0, { type: 'spring', stiffness: 300, damping: 25 });
        }
        return;
      }

      // No direction determined — reset
      x.set(0);
      y.set(0);
    },
    [x, y, cardOpacity, onSwipe, onNavigate],
  );

  return (
    <div className="h-full w-full relative flex-shrink-0">
      <motion.div
        style={{ x, y, rotate: rotation, opacity: cardOpacity }}
        onPanStart={handlePanStart}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        className="absolute inset-0 touch-none"
      >
        {/* Full-bleed poster background */}
        <img
          src={tmdbPoster(card.posterPath, 'w780')}
          alt={card.title}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-full w-auto max-w-none"
          draggable={false}
        />

        {/* Top gradient */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

        {/* Bottom gradient + info */}
        <div
          className="absolute bottom-0 inset-x-0 pointer-events-none pb-20 px-6"
          style={{ paddingTop: '30vh', background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.9) 60%, rgba(0,0,0,1) 100%)' }}
        >
          <h2 className="text-4xl font-bold text-white leading-tight line-clamp-2 drop-shadow-lg">
            {card.title}
          </h2>
          <div className="flex items-center gap-3 mt-3 text-xl text-white/80">
            <span>{formatDate(card.releaseDate)}</span>
            {card.runtime && (
              <>
                <span className="text-white/40">|</span>
                <span className="flex items-center gap-1.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatRuntime(card.runtime)}
                </span>
              </>
            )}
            {card.tmdbRating && (
              <>
                <span className="text-white/40">|</span>
                <span className="flex items-center gap-1.5">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                    <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7.4-6.3-4.8-6.3 4.8 2.3-7.4-6-4.6h7.6z" />
                  </svg>
                  {formatRating(card.tmdbRating)}
                </span>
              </>
            )}
            {card.productionCountries.length > 0 && (
              <>
                <span className="text-white/40">|</span>
                <span>{countryFlag(card.productionCountries[0])} {card.productionCountries[0]}</span>
              </>
            )}
          </div>

          {/* Genre chips */}
          <div className="flex flex-wrap gap-2.5 mt-3">
            {card.genres.slice(0, 4).map((g) => (
              <span
                key={g.id}
                className="text-base px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-white/90"
              >
                {g.emoji} {g.name}
              </span>
            ))}
          </div>
        </div>

        {/* Undo button */}
        <div className="absolute right-4 bottom-24 z-20 pointer-events-auto">
          <button
            onClick={(e) => { e.stopPropagation(); onUndo?.(); }}
            disabled={!canUndo}
            className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border-2 border-white/40
              flex items-center justify-center text-white active:scale-90 transition-all
              shadow-lg shadow-black/40 disabled:opacity-20"
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Swipe overlays */}
        <motion.div
          className="absolute inset-0 bg-like/20 pointer-events-none flex items-center justify-center"
          style={{ opacity: likeOpacity }}
        >
          <svg width="240" height="240" viewBox="0 0 24 24" fill="currentColor" className="text-like drop-shadow-2xl">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </motion.div>
        <motion.div
          className="absolute inset-0 bg-dislike/20 pointer-events-none flex items-center justify-center"
          style={{ opacity: dislikeOpacity }}
        >
          <svg width="240" height="240" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-dislike drop-shadow-2xl">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
