import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion';
import { useCallback, useRef } from 'react';
import { tmdbPoster } from '@/utils/image';
import { LikeIcon, DislikeIcon } from '@/components/ui/icons';
import { formatRuntime, formatDate, formatRating, countryFlag } from '@/utils/format';
import type { FeedCard, SwipeAction } from '@/types';

interface FeedItemProps {
  card: FeedCard;
  onSwipe: (action: SwipeAction) => void;
  onNavigate?: (direction: 'next' | 'prev') => void;
  onVerticalDrag?: (offsetY: number) => void;
  onVerticalDragEnd?: () => void;
  onUndo?: () => void;
  onTap?: () => void;
  canUndo?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

const SWIPE_THRESHOLD = 120;
const FLY_DISTANCE = 800;
const DIRECTION_LOCK_THRESHOLD = 10;
const VERTICAL_THRESHOLD = 50;
const TAP_THRESHOLD = 10;

export default function FeedItem({ card, onSwipe, onNavigate, onVerticalDrag, onVerticalDragEnd, onUndo, onTap, canUndo, isBookmarked, onToggleBookmark }: FeedItemProps) {
  const x = useMotionValue(0);
  const cardOpacity = useMotionValue(1);
  const directionRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const wasPanningRef = useRef(false);

  const rotation = useTransform(x, (v) => Math.max(-12, Math.min(12, v / 25)));
  const likeOpacity = useTransform(x, (v) => Math.max(0, Math.min(1, v / SWIPE_THRESHOLD)));
  const dislikeOpacity = useTransform(x, (v) => Math.max(0, Math.min(1, -v / SWIPE_THRESHOLD)));

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    wasPanningRef.current = false;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current || wasPanningRef.current) {
      pointerStartRef.current = null;
      return;
    }
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    pointerStartRef.current = null;
    if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
      onTap?.();
    }
  }, [onTap]);

  const handlePanStart = useCallback(() => {
    directionRef.current = 'none';
  }, []);

  const handlePan = useCallback((_: unknown, info: PanInfo) => {
    const absDx = Math.abs(info.offset.x);
    const absDy = Math.abs(info.offset.y);

    if (absDx > TAP_THRESHOLD || absDy > TAP_THRESHOLD) {
      wasPanningRef.current = true;
    }

    if (directionRef.current === 'none') {
      if (absDx > DIRECTION_LOCK_THRESHOLD || absDy > DIRECTION_LOCK_THRESHOLD) {
        directionRef.current = absDx > absDy ? 'horizontal' : 'vertical';
      }
    }

    if (directionRef.current === 'horizontal') {
      x.set(info.offset.x);
    } else if (directionRef.current === 'vertical') {
      onVerticalDrag?.(info.offset.y);
    }
  }, [x, onVerticalDrag]);

  const handlePanEnd = useCallback(
    async (_: unknown, info: PanInfo) => {
      const direction = directionRef.current;
      directionRef.current = 'none';

      // Vertical gesture → navigate between cards (Feed handles the scroll)
      if (direction === 'vertical') {
        const offsetY = info.offset.y;
        if (offsetY < -VERTICAL_THRESHOLD) {
          onNavigate?.('next');
        } else if (offsetY > VERTICAL_THRESHOLD) {
          onNavigate?.('prev');
        } else {
          onVerticalDragEnd?.();
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
    },
    [x, cardOpacity, onSwipe, onNavigate, onVerticalDragEnd],
  );

  return (
    <div className="h-full w-full relative flex-shrink-0">
      <motion.div
        style={{ x, rotate: rotation, opacity: cardOpacity }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPanStart={handlePanStart}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        className="absolute inset-0 touch-none"
      >
        {/* Full-bleed poster background */}
        <img
          src={tmdbPoster(card.posterPath, 'w780')}
          alt={card.title}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        {/* Top gradient */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

        {/* Bottom gradient + info */}
        <div
          /* pb-27.5 = calc(var(--spacing) * 27.5) = 110px: 100px, щоб ромб ШІ
             (діагональ 70.7px + обідок, верхівка ~92px від низу) не накривав
             жанри, плюс 10px повітря на прохання власника. */
          className="absolute bottom-0 inset-x-0 pointer-events-none pb-27.5 px-6"
          style={{ paddingTop: '30vh', background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.9) 60%, rgba(0,0,0,1) 100%)' }}
        >
          <h2 className="text-3xl font-bold text-white leading-tight line-clamp-2 drop-shadow-lg">
            {card.title}
          </h2>
          {card.titleEn && card.titleEn !== card.title && (
            <p className="text-sm text-white/50 mt-1">({card.titleEn})</p>
          )}
          <div className="flex items-center gap-2 mt-4 text-base text-white/80">
            <span>{formatDate(card.releaseDate)}</span>
            {card.runtime && (
              <>
                <span className="text-white/40">|</span>
                <span className="flex items-center gap-1">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {formatRuntime(card.runtime)}
                </span>
              </>
            )}
            {card.imdbRating && (
              <>
                <span className="text-white/40">|</span>
                <span className="flex items-center gap-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                    <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7.4-6.3-4.8-6.3 4.8 2.3-7.4-6-4.6h7.6z" />
                  </svg>
                  {formatRating(card.imdbRating)}
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
          <div className="flex flex-wrap gap-2 mt-4">
            {card.genres.slice(0, 4).map((g) => (
              <span
                key={g.id}
                className="text-xs px-2.5 py-0.5 bg-white/15 backdrop-blur-sm rounded-full text-white/90"
              >
                {g.emoji} {g.name}
              </span>
            ))}
          </div>
        </div>

        {/* Bookmark. Кнопки «скасувати» тут більше немає — undo лишився
            жестом (шейк на мобілці) і Ctrl+Z на десктопі */}
        <div className="absolute right-4 top-4 z-20 pointer-events-auto flex flex-col gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleBookmark?.(); }}
            className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/30
              flex items-center justify-center text-white active:scale-90 transition-all
              shadow-lg shadow-black/40"
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>

        {/* Swipe overlays */}
        <motion.div
          className="absolute inset-0 bg-like/20 pointer-events-none flex items-center justify-center"
          style={{ opacity: likeOpacity }}
        >
          <LikeIcon size={240} className="text-like drop-shadow-2xl" />
        </motion.div>
        <motion.div
          className="absolute inset-0 bg-dislike/20 pointer-events-none flex items-center justify-center"
          style={{ opacity: dislikeOpacity }}
        >
          <DislikeIcon size={240} className="text-dislike drop-shadow-2xl" />
        </motion.div>
      </motion.div>
    </div>
  );
}
