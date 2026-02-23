import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useContentDetail } from '@/api/hooks';
import { tmdbBackdrop, tmdbPoster } from '@/utils/image';
import { formatRuntime, formatDate, formatRating } from '@/utils/format';
import Spinner from '@/components/ui/Spinner';

export default function ContentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: content, isLoading } = useContentDetail(id ? Number(id) : null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        {t('common.error')}
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface overflow-y-auto">
      {/* Backdrop hero */}
      <div className="relative h-56">
        <img
          src={tmdbBackdrop(content.backdropPath)}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div className="px-4 -mt-16 relative z-10 pb-6 space-y-4">
        {/* Title row with poster + trailer */}
        <div className="flex gap-4 items-end">
          <img
            src={tmdbPoster(content.posterPath, 'w185')}
            alt={content.title}
            className="w-24 aspect-[2/3] object-cover rounded-md shadow-lg flex-shrink-0"
          />
          <div className="flex-1 min-w-0 pt-8 space-y-2">
            <div>
              <h2 className="text-xl font-bold leading-tight">{content.title}</h2>
              {content.originalTitle && content.originalTitle !== content.title && (
                <p className="text-xs text-text-muted mt-0.5">{content.originalTitle}</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-text-muted flex-wrap">
              <span>{formatDate(content.releaseDate)}</span>
              {content.runtime && <span>{formatRuntime(content.runtime)}</span>}
              {content.certification && (
                <span className="px-1.5 py-0.5 border border-border rounded text-xs">
                  {content.certification}
                </span>
              )}
            </div>
          </div>
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(content.title + ' trailer')}`}
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
        {content.imdbRating && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">IMDb</span>
            <span className="text-lg font-bold text-accent">{formatRating(content.imdbRating)}</span>
          </div>
        )}

        {/* Genres */}
        <div className="flex flex-wrap gap-1.5">
          {content.genres.map((g) => (
            <span
              key={g.id}
              className="text-xs px-2 py-0.5 bg-surface-light rounded text-text-muted"
            >
              {g.emoji} {g.name}
            </span>
          ))}
        </div>

        {/* Overview */}
        {content.overview && (
          <p className="text-sm text-text-muted leading-relaxed">{content.overview}</p>
        )}

        {/* Directors */}
        {content.directors.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2">
              {t('card.director')}
            </h3>
            <div className="grid grid-cols-4 gap-x-3 gap-y-5">
              {content.directors.map((d) => (
                <button
                  key={d.id}
                  onClick={() => navigate(`/person/${d.id}`)}
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
        {content.cast.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2">
              {t('card.cast')}
            </h3>
            <div className="grid grid-cols-4 gap-x-3 gap-y-5">
              {content.cast.slice(0, 8).map((actor) => (
                <button
                  key={actor.id}
                  onClick={() => navigate(`/person/${actor.id}`)}
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
        {content.awards.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mt-6 mb-2">
              {t('card.awards')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {[...content.awards].sort((a, b) => (a.won === b.won ? 0 : a.won ? -1 : 1)).map((a, i) => (
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
        {content.recommendationReasons.length > 0 && (
          <div className="bg-surface-light rounded-md p-3 mt-6">
            <h3 className="text-sm font-semibold text-accent uppercase tracking-wide mb-1">
              {t('content.whyRecommended')}
            </h3>
            <ul className="space-y-1">
              {content.recommendationReasons.map((reason, i) => (
                <li key={i} className="text-base text-text-muted">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Add to favorites */}
        <button className="w-full py-3 rounded-lg bg-accent text-bg font-semibold text-sm mt-6">
          {content.userStatus?.inWatchlist ? t('content.inFavorites') : t('content.addToFavorites')}
        </button>
      </div>
    </div>
  );
}
