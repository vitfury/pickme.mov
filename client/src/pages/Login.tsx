import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

const TMDB = 'https://image.tmdb.org/t/p/w342';

/* ---- Shuffled movie feed: likes & dislikes mixed naturally ---- */
const MOVIES: { poster: string; like: boolean }[] = [
  { poster: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg', like: true },   // LOTR: Fellowship
  { poster: '/3Gkb6jm6962ADUPaCBqzz9CTbn9.jpg', like: false },  // Twilight
  { poster: '/jFTVD4XoWQTcg7wdyJKa8PEds5q.jpg', like: true },   // Terminator 2
  { poster: '/tphkjmQq8WebuVwNXelmjLUXuPJ.jpg', like: false },  // Godzilla
  { poster: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', like: true },   // The Godfather
  { poster: '/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg', like: true },   // Inception
  { poster: '/zxkY8byBnCsXodEYpK8tmwEGXBI.jpg', like: false },  // The Mummy
  { poster: '/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg', like: true },   // Star Wars
  { poster: '/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg', like: true },   // Gladiator
  { poster: '/sk3FZgh3sRrmr8vyhaitNobMcfh.jpg', like: false },  // Suicide Squad
  { poster: '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', like: true },   // Shawshank
  { poster: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', like: true },   // Fight Club
  { poster: '/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', like: true },   // Titanic
  { poster: '/p96dm7sCMn4VYAStA6siNz30G1r.jpg', like: true },   // The Matrix
  { poster: '/9kKXH6eJpzoFGhCbTN3FVwSQK3n.jpg', like: false },  // King Arthur
  { poster: '/saHP97rTPS5eLmrLQEcANmKrsFl.jpg', like: true },   // Forrest Gump
  { poster: '/2Gfjn962aaFSD6eST6QU3oLDZTo.jpg', like: false },  // San Andreas
  { poster: '/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg', like: true },   // Pulp Fiction
];

type Phase = 'scatter' | 'stack' | 'swipe';

/* ---- Timing (ms) ---- */
const SCATTER_DURATION = 1500;  // how long cards stay scattered
const STACK_TO_SWIPE = 1;    // pause after stacking before swiping starts
const SWIPE_LIKE_INTERVAL = 1500;   // ms before swiping a like
const SWIPE_DISLIKE_INTERVAL = 2500; // ms before swiping a dislike
const SWIPE_ANIM = 0.3;        // seconds for a card to fly off screen

/* ---- Layout ---- */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const STACK_Y = -130;           // shift stack into upper portion
const VISIBLE_AHEAD = 8;        // cards ahead in stack to render
const VISIBLE_BEHIND = 3;       // swiped cards still animating off

export default function Login() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('scatter');
  const [swipeCount, setSwipeCount] = useState(0);

  /* ---- scatter positions: golden-ratio spiral ---- */
  const scatterPos = useMemo(
    () =>
      MOVIES.map((_, i) => {
        const angle = i * GOLDEN_ANGLE + 0.5;
        const r = 50 + i * 14;
        return {
          x: Math.cos(angle) * Math.min(r, 180),
          y: Math.sin(angle) * Math.min(r * 1.6, 340),
          rotate: Math.sin(i * 2.7) * 25,
        };
      }),
    [],
  );

  /* ---- phase timeline ---- */
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('stack'), SCATTER_DURATION);
    const t2 = setTimeout(() => setPhase('swipe'), SCATTER_DURATION + STACK_TO_SWIPE);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  /* ---- endless auto-swipe ---- */
  useEffect(() => {
    if (phase !== 'swipe') return;
    const current = MOVIES[swipeCount % MOVIES.length];
    const delay = current.like ? SWIPE_LIKE_INTERVAL : SWIPE_DISLIKE_INTERVAL;
    const timer = setTimeout(() => setSwipeCount((c) => c + 1), delay);
    return () => clearTimeout(timer);
  }, [phase, swipeCount]);

  const handleGoogleLogin = () => {
    window.location.href = '/api/v1/auth/google';
  };

  const handleAppleLogin = () => {
    window.location.href = '/api/v1/auth/apple';
  };

  const showUI = phase === 'stack' || phase === 'swipe';

  /* ---- build visible card indices ---- */
  const visibleCards: number[] = [];
  if (phase === 'scatter') {
    // During scatter, show all original cards
    for (let i = 0; i < MOVIES.length; i++) visibleCards.push(i);
  } else {
    // During stack/swipe, show a sliding window around swipeCount
    const from = Math.max(0, swipeCount - VISIBLE_BEHIND);
    const to = swipeCount + VISIBLE_AHEAD;
    for (let i = from; i < to; i++) visibleCards.push(i);
  }

  return (
    <div className="relative min-h-full overflow-hidden select-none">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 40% at 50% 30%, rgba(212,168,67,0.08) 0%, transparent 100%)',
        }}
      />

      {/* ---- Cards ---- */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {visibleCards.map((vi) => {
          const movie = MOVIES[vi % MOVIES.length];
          const isSwiped = phase === 'swipe' && vi < swipeCount;
          const depth = vi - swipeCount; // negative = swiped, 0 = top, positive = below

          const { target, trans } = phase === 'scatter'
            ? scatterAnim(vi, scatterPos[vi])
            : isSwiped
              ? swipedAnim(movie.like)
              : stackAnim(vi, depth, phase);

          return (
            <motion.div
              key={vi}
              className="absolute w-[16.5rem] h-[24rem] rounded-2xl overflow-hidden"
              style={{
                zIndex: 1000 - (vi - swipeCount),
                willChange: 'transform',
                backgroundColor: '#16161e',
                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              }}
              initial={{ opacity: 0, scale: 0, x: 0, y: 0, rotate: 0 }}
              animate={target}
              transition={trans}
            >
              <PosterImg src={`${TMDB}${movie.poster}`} />
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06]" />

              {/* Like / Dislike stamp */}
              {isSwiped && (
                <div
                  className={`absolute inset-0 flex items-center justify-center rounded-2xl ${
                    movie.like ? 'bg-like/20' : 'bg-dislike/20'
                  }`}
                >
                  <span
                    className={`text-[7rem] drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] ${
                      movie.like ? 'text-like' : 'text-dislike'
                    }`}
                  >
                    {movie.like ? '\u2665' : '\u2715'}
                  </span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* ---- Brand & Login — appears once cards stack ---- */}
      {showUI && (
        <div className="absolute inset-x-0 bottom-0 z-[1100] flex flex-col items-center pb-14 px-6">
          <motion.div
            className="text-center mb-8"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="font-heading text-[4.5rem] leading-none tracking-[0.06em]">
              <span className="text-text">pickme</span>
              <span className="text-accent">.mov</span>
            </h1>
            <p className="text-text-muted/50 text-[0.65rem] mt-3 tracking-[0.3em] uppercase">
              {t('login.subtitle')}
            </p>
          </motion.div>

          <motion.div
            className="pointer-events-auto flex items-center gap-3"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.15,
              duration: 0.7,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <button
              onClick={handleGoogleLogin}
              className="group flex items-center justify-center gap-2.5
                px-5 py-3.5 rounded-full
                bg-white/[0.08] backdrop-blur-sm
                border border-white/[0.12]
                text-text text-[0.8rem] font-medium tracking-wide
                transition-all duration-300 ease-out
                hover:bg-white/[0.1] hover:border-accent/25
                hover:text-text/95 hover:shadow-[0_0_40px_rgba(212,168,67,0.06)]
                active:scale-[0.97]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                className="shrink-0"
              >
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t('login.google')}
            </button>

            <button
              onClick={handleAppleLogin}
              className="group flex items-center justify-center gap-2.5
                px-5 py-3.5 rounded-full
                bg-white/[0.08] backdrop-blur-sm
                border border-white/[0.12]
                text-text text-[0.8rem] font-medium tracking-wide
                transition-all duration-300 ease-out
                hover:bg-white/[0.1] hover:border-accent/25
                hover:text-text/95 hover:shadow-[0_0_40px_rgba(212,168,67,0.06)]
                active:scale-[0.97]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="shrink-0"
              >
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              {t('login.apple')}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Animation helpers
   ================================================================ */

interface ScatterPos { x: number; y: number; rotate: number }

function scatterAnim(i: number, scatter: ScatterPos) {
  return {
    target: {
      x: scatter.x,
      y: scatter.y,
      rotate: scatter.rotate,
      opacity: 1,
      scale: 0.78,
    },
    trans: {
      type: 'spring' as const,
      stiffness: 130,
      damping: 16,
      delay: i * 0.03,
      opacity: { duration: 0.25, delay: i * 0.03 },
    },
  };
}

function swipedAnim(like: boolean) {
  return {
    target: {
      x: like ? 450 : -450,
      y: STACK_Y - 40,
      rotate: like ? 18 : -18,
      opacity: 0,
      scale: 0.9,
    },
    trans: {
      duration: SWIPE_ANIM,
      ease: [0.4, 0, 0.7, 0.2] as const,
    },
  };
}

function stackAnim(i: number, depth: number, phase: Phase) {
  return {
    target: {
      x: Math.sin(i * 4.7) * 1,
      y: STACK_Y + depth * 2,
      rotate: 0,
      opacity: depth < VISIBLE_AHEAD ? 1 : 0,
      scale: 1 - depth * 0.005,
    },
    trans:
      phase === 'stack'
        ? {
            type: 'spring' as const,
            stiffness: 80,
            damping: 14,
            delay: i * 0.02,
          }
        : {
            type: 'spring' as const,
            stiffness: 250,
            damping: 22,
          },
  };
}

function PosterImg({ src }: { src: string }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      loading="eager"
      draggable={false}
      onError={() => setVisible(false)}
    />
  );
}
