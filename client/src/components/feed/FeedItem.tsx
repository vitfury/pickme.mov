import { motion, useAnimation, type PanInfo } from 'framer-motion';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { tmdbPoster } from '@/utils/image';
import { formatRuntime, formatDate, formatRating } from '@/utils/format';
import type { FeedCard, SwipeAction } from '@/types';

interface FeedItemProps {
  card: FeedCard;
  onSwipe: (action: SwipeAction) => void;
  onOpenDetails: () => void;
}

const SWIPE_THRESHOLD = 120;
const FLY_DISTANCE = 800;

export default function FeedItem({ card, onSwipe, onOpenDetails }: FeedItemProps) {
  const { t } = useTranslation();
  const controls = useAnimation();
  const [dragX, setDragX] = useState(0);

  const handleDrag = useCallback((_: unknown, info: PanInfo) => {
    setDragX(info.offset.x);
  }, []);

  const handleDragEnd = useCallback(
    async (_: unknown, info: PanInfo) => {
      const { x } = info.offset;

      if (x > SWIPE_THRESHOLD) {
        await controls.start({ x: FLY_DISTANCE, opacity: 0, transition: { duration: 0.3 } });
        onSwipe('like');
      } else if (x < -SWIPE_THRESHOLD) {
        await controls.start({ x: -FLY_DISTANCE, opacity: 0, transition: { duration: 0.3 } });
        onSwipe('dislike');
      } else {
        controls.start({ x: 0, rotate: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
      }
      setDragX(0);
    },
    [controls, onSwipe],
  );

  const likeOpacity = Math.max(0, Math.min(1, dragX / SWIPE_THRESHOLD));
  const dislikeOpacity = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD));
  const rotation = Math.max(-12, Math.min(12, dragX / 25));

  return (
    <div className="h-[100dvh] w-full relative flex-shrink-0">
      <motion.div
        animate={controls}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{ rotate: rotation }}
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

        {/* Bottom gradient with info */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none pt-40 pb-20 px-4">
          <h2 className="text-2xl font-bold text-white leading-tight line-clamp-2 drop-shadow-lg">
            {card.title}
          </h2>
          <div className="flex items-center gap-2 mt-1.5 text-sm text-white/80">
            <span>{formatDate(card.releaseDate)}</span>
            {card.runtime && (
              <>
                <span className="text-white/40">|</span>
                <span>{formatRuntime(card.runtime)}</span>
              </>
            )}
            {card.tmdbRating && (
              <>
                <span className="text-white/40">|</span>
                <span className="flex items-center gap-1">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                    <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7.4-6.3-4.8-6.3 4.8 2.3-7.4-6-4.6h7.6z" />
                  </svg>
                  {formatRating(card.tmdbRating)}
                </span>
              </>
            )}
          </div>

          {/* Genre chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {card.genres.slice(0, 4).map((g) => (
              <span
                key={g.id}
                className="text-xs px-2 py-0.5 bg-white/15 backdrop-blur-sm rounded-full text-white/90"
              >
                {g.emoji} {g.name}
              </span>
            ))}
          </div>
        </div>

        {/* Right-side action buttons (TikTok-style) */}
        <div className="absolute right-3 bottom-28 flex flex-col items-center gap-4 pointer-events-auto">
          {/* Like */}
          <button
            onClick={(e) => { e.stopPropagation(); onSwipe('like'); }}
            className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/20
              flex items-center justify-center text-like active:scale-90 transition-transform"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>

          {/* Dislike */}
          <button
            onClick={(e) => { e.stopPropagation(); onSwipe('dislike'); }}
            className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/20
              flex items-center justify-center text-dislike active:scale-90 transition-transform"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Info / expand details */}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDetails(); }}
            className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/20
              flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
        </div>

        {/* Swipe overlays */}
        <motion.div
          className="absolute inset-0 bg-like/20 pointer-events-none flex items-center justify-center"
          style={{ opacity: likeOpacity }}
        >
          <span className="text-like text-5xl font-bold rotate-[-12deg] border-4 border-like rounded-lg px-6 py-3 drop-shadow-2xl">
            LIKE
          </span>
        </motion.div>
        <motion.div
          className="absolute inset-0 bg-dislike/20 pointer-events-none flex items-center justify-center"
          style={{ opacity: dislikeOpacity }}
        >
          <span className="text-dislike text-5xl font-bold rotate-12 border-4 border-dislike rounded-lg px-6 py-3 drop-shadow-2xl">
            NOPE
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}
