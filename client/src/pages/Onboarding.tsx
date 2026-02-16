import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useOnboardingGenres, useOnboardingSeeds, useCompleteOnboarding } from '@/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { tmdbPoster } from '@/utils/image';
import Chip from '@/components/ui/Chip';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import type { SwipeAction } from '@/types';

type Step = 'genres' | 'rate' | 'ready';

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateUser = useAuthStore((s) => s.updateUser);

  const [step, setStep] = useState<Step>('genres');
  const [direction, setDirection] = useState(1);
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [movieRatings, setMovieRatings] = useState<{ contentId: number; action: SwipeAction }[]>([]);
  const [currentSeedIndex, setCurrentSeedIndex] = useState(0);

  const { data: genresData, isLoading: genresLoading } = useOnboardingGenres();
  const { data: seedsData, isLoading: seedsLoading } = useOnboardingSeeds();
  const completeOnboarding = useCompleteOnboarding();

  const toggleGenre = useCallback((id: number) => {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  }, []);

  const goNext = () => {
    setDirection(1);
    if (step === 'genres') setStep('rate');
    else if (step === 'rate') setStep('ready');
  };

  const goBack = () => {
    setDirection(-1);
    if (step === 'rate') setStep('genres');
    else if (step === 'ready') setStep('rate');
  };

  const rateSeed = (action: SwipeAction) => {
    const seed = seedsData?.seeds[currentSeedIndex];
    if (!seed) return;
    setMovieRatings((prev) => [...prev, { contentId: seed.id, action }]);
    if (currentSeedIndex + 1 < (seedsData?.seeds.length ?? 0)) {
      setCurrentSeedIndex((i) => i + 1);
    } else {
      goNext();
    }
  };

  const handleComplete = async () => {
    try {
      await completeOnboarding.mutateAsync({ selectedGenres, movieRatings });
      updateUser({ onboardingCompleted: true });
      navigate('/', { replace: true });
    } catch {
      // error handled by mutation
    }
  };

  const currentSeed = seedsData?.seeds[currentSeedIndex];
  const totalSeeds = seedsData?.seeds.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Progress dots */}
      <div className="flex justify-center gap-2 pt-6 pb-4">
        {(['genres', 'rate', 'ready'] as Step[]).map((s) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full transition-colors ${
              s === step ? 'bg-accent' : 'bg-surface-light'
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        {step === 'genres' && (
          <motion.div
            key="genres"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex-1 flex flex-col px-6"
          >
            <div className="text-center mb-6">
              <h1 className="text-xl font-bold mb-1">{t('onboarding.genreTitle')}</h1>
              <p className="text-sm text-text-muted">{t('onboarding.genreSubtitle')}</p>
            </div>

            {genresLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
              <div className="flex flex-wrap gap-2 justify-center flex-1 content-start overflow-y-auto pb-4">
                {genresData?.genres.map((g) => (
                  <Chip
                    key={g.id}
                    label={g.name}
                    emoji={g.emoji}
                    selected={selectedGenres.includes(g.id)}
                    onClick={() => toggleGenre(g.id)}
                  />
                ))}
              </div>
            )}

            <div className="py-4">
              <Button
                fullWidth
                disabled={selectedGenres.length < 5 || selectedGenres.length > 10}
                onClick={goNext}
              >
                {t('onboarding.next')}
              </Button>
              <p className="text-center text-xs text-text-muted mt-2">
                {selectedGenres.length}/10
              </p>
            </div>
          </motion.div>
        )}

        {step === 'rate' && (
          <motion.div
            key="rate"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex-1 flex flex-col items-center px-6"
          >
            <div className="text-center mb-4">
              <h1 className="text-xl font-bold mb-1">{t('onboarding.rateTitle')}</h1>
              <p className="text-sm text-text-muted">{t('onboarding.rateSubtitle')}</p>
            </div>

            <p className="text-sm text-accent font-medium mb-4">
              {t('onboarding.rateProgress', {
                current: currentSeedIndex + 1,
                total: totalSeeds,
              })}
            </p>

            {seedsLoading ? (
              <Spinner />
            ) : currentSeed ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <img
                  src={tmdbPoster(currentSeed.posterPath, 'w342')}
                  alt={currentSeed.title}
                  className="w-48 aspect-[2/3] object-cover rounded-lg shadow-xl mb-4"
                />
                <h2 className="text-lg font-semibold text-center mb-1">{currentSeed.title}</h2>
                <p className="text-xs text-text-muted mb-6">
                  {currentSeed.genres.join(' / ')}
                </p>

                <div className="flex gap-6">
                  <button
                    onClick={() => rateSeed('dislike')}
                    className="w-16 h-16 rounded-full bg-dislike/10 border-2 border-dislike text-dislike
                      flex items-center justify-center hover:bg-dislike/20 transition-colors"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <button
                    onClick={() => rateSeed('like')}
                    className="w-16 h-16 rounded-full bg-like/10 border-2 border-like text-like
                      flex items-center justify-center hover:bg-like/20 transition-colors"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : null}

            <div className="py-4 w-full">
              <Button variant="ghost" fullWidth onClick={goBack}>
                {t('onboarding.back')}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'ready' && (
          <motion.div
            key="ready"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex-1 flex flex-col items-center justify-center px-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center mb-6"
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </motion.div>

            <h1 className="text-xl font-bold mb-2">{t('onboarding.readyTitle')}</h1>
            <p className="text-sm text-text-muted text-center mb-8">
              {t('onboarding.readySubtitle')}
            </p>

            <Button
              fullWidth
              size="lg"
              onClick={handleComplete}
              disabled={completeOnboarding.isPending}
            >
              {completeOnboarding.isPending ? <Spinner size={18} /> : t('onboarding.startSwiping')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
