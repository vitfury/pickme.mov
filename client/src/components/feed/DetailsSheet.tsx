import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { FeedCard } from '@/types';

interface DetailsSheetProps {
  card: FeedCard | null;
  onClose: () => void;
}

export default function DetailsSheet({ card, onClose }: DetailsSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AnimatePresence>
      {card && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 150) onClose();
            }}
            className="fixed bottom-0 inset-x-0 z-[70] bg-surface rounded-t-2xl max-h-[80vh] overflow-y-auto touch-pan-y"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2 sticky top-0 bg-surface z-10">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="px-4 pb-6 space-y-4">
              {/* Title */}
              <div>
                <h2 className="text-xl font-bold leading-tight">{card.title}</h2>
                {card.originalTitle && card.originalTitle !== card.title && (
                  <p className="text-xs text-text-muted mt-0.5">{card.originalTitle}</p>
                )}
              </div>

              {/* Overview */}
              {card.overview && (
                <p className="text-sm text-text-muted leading-relaxed">{card.overview}</p>
              )}

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

              {/* Cast */}
              {card.cast.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    {t('card.cast')}
                  </h3>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {card.cast.slice(0, 6).map((actor) => (
                      <button
                        key={actor.id}
                        onClick={() => { onClose(); navigate(`/person/${actor.id}`); }}
                        className="flex-shrink-0 text-center w-14"
                      >
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
                      </button>
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
                      {a.won ? '\u2605' : '\u2606'} {a.category} {a.year}
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

              {/* Why recommended */}
              {card.recommendationReason && (
                <div className="bg-surface-light rounded-md p-3">
                  <h3 className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">
                    {t('content.whyRecommended')}
                  </h3>
                  <p className="text-sm text-text-muted">{card.recommendationReason}</p>
                </div>
              )}

              {/* View full details link */}
              <button
                onClick={() => { onClose(); navigate(`/content/${card.id}`); }}
                className="w-full py-2.5 rounded-md bg-surface-light text-accent text-sm font-medium
                  hover:bg-accent/10 transition-colors"
              >
                {t('card.overview')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
