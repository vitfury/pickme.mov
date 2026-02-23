import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

const TMDB = 'https://image.tmdb.org/t/p/w342';

/* ---- Shuffled movie feed: likes & dislikes mixed naturally ---- */
const MOVIES: { poster: string; like: boolean; action: 'scroll' | 'swipe'; posY?: string }[] = [
  { poster: '/tphkjmQq8WebuVwNXelmjLUXuPJ.jpg', like: true, action: 'scroll' },   // Godzilla
  { poster: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', like: true, action: 'scroll' },   // The Godfather
  { poster: '/3Gkb6jm6962ADUPaCBqzz9CTbn9.jpg', like: false, action: 'swipe' },   // Twilight
  { poster: '/9kKXH6eJpzoFGhCbTN3FVwSQK3n.jpg', like: true, action: 'scroll' },   // King Arthur
  { poster: '/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg', like: true, action: 'swipe' },    // Inception
  { poster: '/p96dm7sCMn4VYAStA6siNz30G1r.jpg', like: true, action: 'swipe' },    // The Matrix
  { poster: '/6oom5QYQ2yQTMJIbnvbkBL9cHo6.jpg', like: true, action: 'swipe' },    // LOTR
  { poster: '/zxkY8byBnCsXodEYpK8tmwEGXBI.jpg', like: false, action: 'scroll' },  // The Mummy
  { poster: '/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg', like: true, action: 'swipe' },    // Star Wars
  { poster: '/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg', like: true, action: 'swipe' },    // Gladiator
  { poster: '/sk3FZgh3sRrmr8vyhaitNobMcfh.jpg', like: false, action: 'scroll' },  // Suicide Squad
  { poster: '/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg', like: true, action: 'swipe' },    // Shawshank
  { poster: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', like: true, action: 'swipe' },    // Fight Club
  { poster: '/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg', like: true, action: 'scroll' },   // Titanic
  { poster: '/saHP97rTPS5eLmrLQEcANmKrsFl.jpg', like: true, action: 'swipe' },    // Forrest Gump
  { poster: '/2Gfjn962aaFSD6eST6QU3oLDZTo.jpg', like: false, action: 'swipe' },   // San Andreas
  { poster: '/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg', like: true, action: 'swipe' },    // Pulp Fiction
];

type Phase = 'scatter' | 'stack' | 'swipe';

/* ---- Timing (ms) ---- */
const SCATTER_DURATION = 1300;
const STACK_TO_SWIPE = 600;
const SWIPE_LIKE_INTERVAL = 1500;
const SWIPE_DISLIKE_INTERVAL = 2500;
const SCROLL_INTERVAL = 2000;
const SWIPE_ANIM = 0.35;

/* ---- Phone frame ---- */
const PHONE_W = 260;
const PHONE_RATIO = 1545 / 819;
const PHONE_H = Math.round(PHONE_W * PHONE_RATIO) - 20; // ~470

/* Phone screen area (% of phone dimensions, measured from iPhone 4 image) */
const SCR_TOP = 18.8;
const SCR_LEFT = 8.5;
const SCR_W_PCT = 82.9;
const SCR_H_PCT = 65.4;

/* ---- Layout ---- */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const STACK_Y = -80; // phone center offset above viewport center
/* Phone screen center is ~1.5% below phone center */
const CARD_STACK_Y = STACK_Y + Math.round(
  PHONE_H * (SCR_TOP / 100 + SCR_H_PCT / 200 - 0.5),
) - 2; // nudged down from -22 to -2 (card 20px lower)
const VISIBLE_AHEAD = 8;
const VISIBLE_BEHIND = 3;
const CARD_SCALE_PHONE = 0.81;

/* ---- Clip-path: masks card layer to phone screen area ---- */
const CLIP_PAD = 8; // expand clip a few px beyond calculated screen to avoid gaps
const _CLIP_TOP = STACK_Y - PHONE_H * (0.5 - SCR_TOP / 100) - CLIP_PAD;
const _CLIP_SIDE = PHONE_W * (0.5 - SCR_LEFT / 100) + CLIP_PAD;
const _CLIP_BOT = -STACK_Y - PHONE_H * (0.5 - (100 - SCR_TOP - SCR_H_PCT) / 100) - CLIP_PAD;

const PHONE_CLIP = `inset(calc(50% + ${_CLIP_TOP.toFixed(1)}px) calc(50% - ${_CLIP_SIDE.toFixed(1)}px) calc(50% + ${_CLIP_BOT.toFixed(1)}px) calc(50% - ${_CLIP_SIDE.toFixed(1)}px) round 6px)`;
const NO_CLIP = 'inset(0% 0% 0% 0% round 0px)';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const theme = useUIStore((s) => s.theme);
  const [phase, setPhase] = useState<Phase>('scatter');
  const [phoneVisible, setPhoneVisible] = useState(false);
  const [swipeCount, setSwipeCount] = useState(0);
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [devEmail, setDevEmail] = useState('dev@pickme.mov');
  const [devLoading, setDevLoading] = useState(false);

  /* Dark bg → white phone frame, light bg → black phone frame */
  const phoneImg = theme === 'dark'
    ? '/images/iphone-white.png'
    : '/images/iphone-black.png';

  const handleDevLogin = useCallback(async () => {
    setDevLoading(true);
    try {
      const { data } = await api.post('/auth/dev-login', { email: devEmail });
      login(
        { accessToken: data.accessToken, refreshToken: data.refreshToken },
        data.user,
      );
      navigate('/');
    } catch {
      setDevLoading(false);
    }
  }, [devEmail, login, navigate]);

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
    const t2 = setTimeout(() => setPhoneVisible(true), SCATTER_DURATION + 200);
    const t3 = setTimeout(
      () => setPhase('swipe'),
      SCATTER_DURATION + 200 + STACK_TO_SWIPE,
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  /* ---- endless auto-advance ---- */
  useEffect(() => {
    if (phase !== 'swipe') return;
    const current = MOVIES[swipeCount % MOVIES.length];
    const delay = current.action === 'scroll'
      ? SCROLL_INTERVAL
      : current.like ? SWIPE_LIKE_INTERVAL : SWIPE_DISLIKE_INTERVAL;
    const timer = setTimeout(() => setSwipeCount((c) => c + 1), delay);
    return () => clearTimeout(timer);
  }, [phase, swipeCount]);

  const handleGoogleLogin = () => {
    window.location.href = '/api/v1/auth/google';
  };

  const showUI = phase === 'stack' || phase === 'swipe';
  const showPhone = phoneVisible;

  /* ---- build visible card indices ---- */
  const visibleCards: number[] = [];
  if (phase === 'scatter' || phase === 'stack') {
    /* During scatter + stack fly-in, render ALL cards */
    for (let i = 0; i < MOVIES.length; i++) visibleCards.push(i);
  } else {
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

      {/* ---- Cards layer — clip-path transitions to phone screen ---- */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          clipPath: showPhone ? PHONE_CLIP : NO_CLIP,
          transition: 'clip-path 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
          backgroundColor: showPhone ? '#16161e' : 'transparent',
        }}
      >
        {visibleCards.map((vi) => {
          const movie = MOVIES[vi % MOVIES.length];
          const isSwiped = phase === 'swipe' && vi < swipeCount;
          const depth = vi - swipeCount;

          const { target, trans } =
            phase === 'scatter'
              ? scatterAnim(vi, scatterPos[vi])
              : isSwiped
                ? movie.action === 'scroll' ? scrolledAnim() : swipedAnim(movie.like)
                : stackAnim(vi, depth, phase);

          return (
            <motion.div
              key={vi}
              className="absolute w-[16.5rem] h-[24rem] overflow-hidden"
              style={{
                zIndex: 1000 - (vi - swipeCount),
                willChange: 'transform',
                borderRadius: phase === 'scatter' ? 16 : 0,
                backgroundColor: '#16161e',
                boxShadow: phase === 'scatter' ? '0 10px 40px rgba(0,0,0,0.6)' : 'none',
              }}
              initial={{ opacity: 0, scale: 0, x: 0, y: 0, rotate: 0 }}
              animate={target}
              transition={trans}
            >
              <PosterImg src={`${TMDB}${movie.poster}`} posY={movie.posY} />
              {phase === 'scatter' && (
                <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06]" />
              )}

              {/* Like / Dislike stamp (swipe only) */}
              {isSwiped && movie.action === 'swipe' && (
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

      {/* ---- Phone frame overlay ---- */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1050]">
        <motion.img
          src={phoneImg}
          alt=""
          style={{
            width: PHONE_W,
            height: PHONE_H,
            filter: 'drop-shadow(0 25px 60px rgba(0,0,0,0.35))',
          }}
          initial={{ opacity: 0, scale: 0.85, y: STACK_Y + 30 }}
          animate={
            showPhone
              ? { opacity: 1, scale: 1, y: STACK_Y }
              : { opacity: 0, scale: 0.85, y: STACK_Y + 30 }
          }
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          draggable={false}
        />
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
          </motion.div>

          {/* Dev login — only in dev mode */}
          {import.meta.env.DEV && (
            <motion.div
              className="mt-4 flex flex-col items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <button
                onClick={() => setShowDevLogin((v) => !v)}
                className="text-text-muted/30 text-[0.6rem] tracking-wider uppercase
                  hover:text-text-muted/60 transition-colors pointer-events-auto"
              >
                Dev Login
              </button>
              <AnimatePresence>
                {showDevLogin && (
                  <motion.div
                    className="flex items-center gap-2 pointer-events-auto"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <input
                      type="email"
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
                      className="bg-white/[0.06] border border-white/[0.1] rounded-lg
                        px-3 py-2 text-[0.75rem] text-text w-48 outline-none
                        focus:border-accent/40"
                      placeholder="dev@pickme.mov"
                    />
                    <button
                      onClick={handleDevLogin}
                      disabled={devLoading}
                      className="bg-accent/20 text-accent text-[0.75rem] px-3 py-2
                        rounded-lg hover:bg-accent/30 transition-colors
                        disabled:opacity-50"
                    >
                      {devLoading ? '...' : 'Go'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Animation helpers
   ================================================================ */

interface ScatterPos {
  x: number;
  y: number;
  rotate: number;
}

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

function scrolledAnim() {
  return {
    target: {
      x: 0,
      y: CARD_STACK_Y - 420,
      rotate: 0,
      opacity: 1,
      scale: CARD_SCALE_PHONE,
    },
    trans: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 25,
    },
  };
}

function swipedAnim(like: boolean) {
  return {
    target: {
      x: like ? 180 : -180,
      y: CARD_STACK_Y - 20,
      rotate: like ? 12 : -12,
      opacity: 0,
      scale: 0.6,
    },
    trans: {
      duration: SWIPE_ANIM,
      ease: [0.4, 0, 0.7, 0.2] as const,
    },
  };
}

function stackAnim(i: number, depth: number, phase: Phase) {
  const isVisible = depth >= 0 && depth < VISIBLE_AHEAD;
  return {
    target: {
      x: Math.sin(i * 4.7) * 1,
      y: CARD_STACK_Y + depth * 2,
      rotate: 0,
      opacity: isVisible ? 1 : 0,
      scale: CARD_SCALE_PHONE - depth * 0.005,
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

function PosterImg({ src, posY }: { src: string; posY?: string }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 w-full h-full object-cover"
      style={posY ? { objectPosition: `center ${posY}` } : undefined}
      loading="eager"
      draggable={false}
      onError={() => setVisible(false)}
    />
  );
}
