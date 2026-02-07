import { motion, useAnimation, type PanInfo } from 'framer-motion';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { tmdbPoster } from '@/utils/image';
import { formatRuntime, formatDate, formatRating } from '@/utils/format';
import type { FeedCard } from '@/types';

interface SwipeCardProps {
  card: FeedCard;
  isTop: boolean;
  onSwipe: (direction: 'left' | 'right' | 'up') => void;
  stackIndex: number;
}

const SWIPE_THRESHOLD = 150;
const SUPERLIKE_Y_THRESHOLD = -120;
const FLY_DISTANCE = 1000;

export default function SwipeCard({ card, isTop, onSwipe, stackIndex }: SwipeCardProps) {
  const { t } = useTranslation();
  const controls = useAnimation();
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const handleDrag = useCallback((_: unknown, info: PanInfo) => {
    setDragX(info.offset.x);
    setDragY(info.offset.y);
  }, []);

  const handleDragEnd = useCallback(
    async (_: unknown, info: PanInfo) => {
      const { x, y } = info.offset;

      if (y < SUPERLIKE_Y_THRESHOLD) {
        await controls.start({ y: -FLY_DISTANCE, x: 0, opacity: 0, transition: { duration: 0.3 } });
        onSwipe('up');
      } else if (x > SWIPE_THRESHOLD) {
        await controls.start({ x: FLY_DISTANCE, opacity: 0, transition: { duration: 0.3 } });
        onSwipe('right');
      } else if (x < -SWIPE_THRESHOLD) {
        await controls.start({ x: -FLY_DISTANCE, opacity: 0, transition: { duration: 0.3 } });
        onSwipe('left');
      } else {
        controls.start({ x: 0, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 300, damping: 25 } });
      }
      setDragX(0);
      setDragY(0);
    },
    [controls, onSwipe],
  );

  const animateSwipe = useCallback(
    async (direction: 'left' | 'right' | 'up') => {
      if (direction === 'up') {
        await controls.start({ y: -FLY_DISTANCE, opacity: 0, transition: { duration: 0.3 } });
      } else if (direction === 'right') {
        await controls.start({ x: FLY_DISTANCE, rotate: 15, opacity: 0, transition: { duration: 0.3 } });
      } else {
        await controls.start({ x: -FLY_DISTANCE, rotate: -15, opacity: 0, transition: { duration: 0.3 } });
      }
      onSwipe(direction);
    },
    [controls, onSwipe],
  );

  // Expose animateSwipe for parent usage
  (SwipeCard as { animateSwipe?: typeof animateSwipe }).animateSwipe = animateSwipe;

  const rotation = Math.max(-15, Math.min(15, dragX / 20));
  const likeOpacity = Math.max(0, Math.min(1, dragX / SWIPE_THRESHOLD));
  const dislikeOpacity = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD));
  const superlikeOpacity = Math.max(0, Math.min(1, -dragY / Math.abs(SUPERLIKE_Y_THRESHOLD)));

  const scale = 1 - stackIndex * 0.04;
  const translateY = stackIndex * 8;

  return (
    <motion.div
      animate={controls}
      drag={isTop ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={1}
      onDrag={isTop ? handleDrag : undefined}
      onDragEnd={isTop ? handleDragEnd : undefined}
      style={{
        rotate: isTop ? rotation : 0,
        scale,
        y: isTop ? 0 : translateY,
        zIndex: 10 - stackIndex,
      }}
      className="absolute inset-x-4 top-0 touch-none select-none"
    >
      <div
        className={`relative bg-surface rounded-lg overflow-hidden shadow-2xl ${
          expanded ? 'max-h-[80vh] overflow-y-auto' : 'aspect-[2/3]'
        }`}
        onClick={() => {
          if (!isTop) return;
          setExpanded(!expanded);
        }}
      >
        {/* Poster image */}
        <img
          src={tmdbPoster(card.posterPath, 'w780')}
          alt={card.title}
          className="w-full aspect-[2/3] object-cover"
          draggable={false}
        />

        {/* Title gradient overlay */}
        <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
        <div className="absolute top-3 left-4 right-4 pointer-events-none">
          <h2 className="text-lg font-semibold text-white leading-tight line-clamp-2">
            {card.title}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-white/70">
            <span>{formatDate(card.releaseDate)}</span>
            {card.runtime && <span>{formatRuntime(card.runtime)}</span>}
            {card.tmdbRating && (
              <span className="flex items-center gap-0.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                  <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7.4-6.3-4.8-6.3 4.8 2.3-7.4-6-4.6h7.6z" />
                </svg>
                {formatRating(card.tmdbRating)}
              </span>
            )}
          </div>
        </div>

        {/* Swipe overlays */}
        {isTop && (
          <>
            <motion.div
              className="absolute inset-0 bg-like/20 pointer-events-none flex items-center justify-center"
              style={{ opacity: likeOpacity }}
            >
              <span className="text-like text-4xl font-bold rotate-[-12deg] border-4 border-like rounded-lg px-4 py-2">
                LIKE
              </span>
            </motion.div>
            <motion.div
              className="absolute inset-0 bg-dislike/20 pointer-events-none flex items-center justify-center"
              style={{ opacity: dislikeOpacity }}
            >
              <span className="text-dislike text-4xl font-bold rotate-12 border-4 border-dislike rounded-lg px-4 py-2">
                NOPE
              </span>
            </motion.div>
            <motion.div
              className="absolute inset-0 bg-superlike/20 pointer-events-none flex items-center justify-center"
              style={{ opacity: superlikeOpacity }}
            >
              <span className="text-superlike text-4xl font-bold border-4 border-superlike rounded-lg px-4 py-2">
                SUPER
              </span>
            </motion.div>
          </>
        )}

        {/* Bottom gradient for details hint */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

        {/* Expanded details panel */}
        {expanded && (
          <div className="bg-surface p-4 space-y-3">
            {/* Genres */}
            <div className="flex flex-wrap gap-1.5">
              {card.genres.map((g) => (
                <span
                  key={g.id}
                  className="text-xs px-2 py-0.5 bg-surface-light rounded text-text-muted"
                >
                  {g.emoji} {g.name}
                </span>
              ))}
            </div>

            {/* Overview */}
            {card.overview && (
              <p className="text-sm text-text-muted leading-relaxed">
                {card.overview}
              </p>
            )}

            {/* Cast */}
            {card.cast.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                  {t('card.cast')}
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {card.cast.slice(0, 6).map((actor) => (
                    <div key={actor.id} className="flex-shrink-0 text-center w-14">
                      <img
                        src={
                          actor.photoPath
                            ? `https://image.tmdb.org/t/p/w185${actor.photoPath}`
                            : '/profile-placeholder.svg'
                        }
                        alt={actor.name}
                        className="w-12 h-12 rounded-full object-cover mx-auto bg-surface-light"
                      />
                      <p className="text-[10px] text-text-muted mt-1 leading-tight line-clamp-2">
                        {actor.name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Directors */}
            {card.directors.length > 0 && (
              <div className="text-xs text-text-muted">
                <span className="font-semibold uppercase tracking-wide">
                  {t('card.director')}:
                </span>{' '}
                {card.directors.map((d) => d.name).join(', ')}
              </div>
            )}

            {/* Awards */}
            {card.awards.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {card.awards.map((a, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-0.5 rounded ${
                      a.won
                        ? 'bg-accent/15 text-accent'
                        : 'bg-surface-light text-text-muted'
                    }`}
                  >
                    {a.won ? '★' : '☆'} {a.category} {a.year}
                  </span>
                ))}
              </div>
            )}

            {/* Providers */}
            {card.providers.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
                  {t('card.providers')}
                </h3>
                <div className="flex gap-2">
                  {card.providers.map((p) => (
                    <img
                      key={p.id}
                      src={p.logoPath ? `https://image.tmdb.org/t/p/w92${p.logoPath}` : '/logo-placeholder.svg'}
                      alt={p.name}
                      className="w-8 h-8 rounded object-cover bg-surface-light"
                      title={p.name}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export type { SwipeCardProps };
