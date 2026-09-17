import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { tmdbPoster, tmdbBackdrop } from '@/utils/image';
import { formatRuntime, formatDate, formatRating } from '@/utils/format';
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
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[70] bg-surface overflow-y-auto"
        >
          {/* Backdrop hero */}
          <div className="relative h-56">
            <img
              src={tmdbBackdrop(card.backdropPath)}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="px-4 -mt-16 relative z-10 pb-6 space-y-4">
            {/* Title row with poster + trailer */}
            <div className="flex gap-4 items-end">
              <img
                src={tmdbPoster(card.posterPath, 'w185')}
                alt={card.title}
                className="w-24 aspect-[2/3] object-cover rounded-md shadow-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0 pt-8 space-y-2">
                <div>
                  <h2 className="text-xl font-bold leading-tight">{card.title}</h2>
                  {card.originalTitle && card.originalTitle !== card.title && (
                    <p className="text-xs text-text-muted mt-0.5">{card.originalTitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-text-muted flex-wrap">
                  <span>{formatDate(card.releaseDate)}</span>
                  {card.runtime && <span>{formatRuntime(card.runtime)}</span>}
                  {card.certification && (
                    <span className="px-1.5 py-0.5 border border-border rounded text-xs">
                      {card.certification}
                    </span>
                  )}
                </div>
              </div>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${card.title} ${t('content.trailerQuery')}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 flex-shrink-0"
              >
                <span className="w-24 h-16 flex items-center justify-center rounded-xl bg-red-600 text-white shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.5v13l11-6.5-11-6.5z"/>
                  </svg>
                </span>
                <span className="text-xs text-text-muted font-medium">{t('content.watchTrailer')}</span>
              </a>
            </div>

            {/* Rating */}
            {card.imdbRating && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">IMDb</span>
                <span className="text-lg font-bold text-accent">{formatRating(card.imdbRating)}</span>
              </div>
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

            {/* Overview */}
            {card.overview && (
              <p className="text-sm text-text-muted leading-relaxed">{card.overview}</p>
            )}

            {/* Directors */}
            {card.directors.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2">
                  {t('card.director')}
                </h3>
                <div className="grid grid-cols-4 gap-x-3 gap-y-5">
                  {card.directors.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => { onClose(); navigate(`/person/${d.id}`); }}
                      className="text-center"
                    >
                      <img
                        src={
                          d.photoPath
                            ? `https://image.tmdb.org/t/p/w185${d.photoPath}`
                            : '/profile-placeholder.svg'
                        }
                        alt={d.name}
                        className="w-24 h-24 rounded-full object-cover mx-auto bg-surface-light"
                      />
                      <p className="text-xs text-text-muted mt-1 leading-tight line-clamp-2">
                        {d.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Cast */}
            {card.cast.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2">
                  {t('card.cast')}
                </h3>
                <div className="grid grid-cols-4 gap-x-3 gap-y-5">
                  {card.cast.slice(0, 8).map((actor) => (
                    <button
                      key={actor.id}
                      onClick={() => { onClose(); navigate(`/person/${actor.id}`); }}
                      className="text-center"
                    >
                      <img
                        src={
                          actor.photoPath
                            ? `https://image.tmdb.org/t/p/w185${actor.photoPath}`
                            : '/profile-placeholder.svg'
                        }
                        alt={actor.name}
                        className="w-24 h-24 rounded-full object-cover mx-auto bg-surface-light"
                      />
                      <p className="text-xs text-text-muted mt-1 leading-tight line-clamp-2">
                        {actor.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Awards */}
            {card.awards.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2">
                  {t('card.awards')}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                {[...card.awards].sort((a, b) => (a.won === b.won ? 0 : a.won ? -1 : 1)).map((a, i) => (
                  <span
                    key={i}
                    className={`text-sm px-2.5 py-1 rounded ${
                      a.won
                        ? 'bg-accent/15 text-accent'
                        : 'bg-surface-light text-text-muted'
                    }`}
                  >
                    {a.won ? '\u2605' : '\u2606'} {t(`card.awardCategory.${a.category}`, a.category)} {a.year}
                  </span>
                ))}
                </div>
              </div>
            )}

            {/* Why recommended */}
            {card.recommendationReason && (
              <div className="bg-surface-light rounded-md p-3 mt-6">
                <h3 className="text-sm font-semibold text-accent uppercase tracking-wide mb-1">
                  {t('content.whyRecommended')}
                </h3>
                <p className="text-base text-text-muted">{card.recommendationReason}</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
