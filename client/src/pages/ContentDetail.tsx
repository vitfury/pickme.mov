import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useContentDetail } from '@/api/hooks';
import { tmdbBackdrop, tmdbPoster, tmdbProfile, tmdbLogo } from '@/utils/image';
import { formatRuntime, formatDate, formatRating } from '@/utils/format';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';

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
    <div className="pb-8">
      {/* Backdrop hero */}
      <div className="relative h-56 md:h-72">
        <img
          src={tmdbBackdrop(content.backdropPath)}
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div className="px-4 -mt-16 relative z-10 max-w-2xl mx-auto space-y-4">
        {/* Title row with poster */}
        <div className="flex gap-4">
          <img
            src={tmdbPoster(content.posterPath, 'w185')}
            alt={content.title}
            className="w-24 aspect-[2/3] object-cover rounded-md shadow-lg flex-shrink-0"
          />
          <div className="flex-1 pt-8">
            <h1 className="text-xl font-bold leading-tight">{content.title}</h1>
            {content.originalTitle !== content.title && (
              <p className="text-xs text-text-muted mt-0.5">{content.originalTitle}</p>
            )}
            <div className="flex items-center gap-2 mt-2 text-sm text-text-muted flex-wrap">
              <span>{formatDate(content.releaseDate)}</span>
              {content.runtime && <span>{formatRuntime(content.runtime)}</span>}
              {content.certification && (
                <span className="px-1.5 py-0.5 border border-border rounded text-xs">
                  {content.certification}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Ratings */}
        <div className="flex gap-4">
          {content.tmdbRating && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">TMDB</span>
              <span className="text-lg font-bold text-accent">{formatRating(content.tmdbRating)}</span>
            </div>
          )}
          {content.imdbRating && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-muted">IMDb</span>
              <span className="text-lg font-bold text-accent">{formatRating(content.imdbRating)}</span>
            </div>
          )}
        </div>

        {/* Genre pills */}
        <div className="flex flex-wrap gap-1.5">
          {content.genres.map((g) => (
            <span key={g.id} className="text-xs px-2 py-0.5 bg-surface-light rounded text-text-muted">
              {g.emoji} {g.name}
            </span>
          ))}
        </div>

        {/* Overview */}
        {content.overview && (
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
              {t('card.overview')}
            </h3>
            <p className="text-sm text-text leading-relaxed">{content.overview}</p>
          </div>
        )}

        {/* Cast */}
        {content.cast.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              {t('card.cast')}
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {content.cast.map((actor) => (
                <button
                  key={actor.id}
                  onClick={() => navigate(`/person/${actor.id}`)}
                  className="flex-shrink-0 text-center w-16"
                >
                  <img
                    src={tmdbProfile(actor.photoPath)}
                    alt={actor.name}
                    className="w-14 h-14 rounded-full object-cover mx-auto bg-surface-light"
                  />
                  <p className="text-[10px] text-text mt-1 leading-tight line-clamp-2">{actor.name}</p>
                  <p className="text-[9px] text-text-muted leading-tight line-clamp-1">{actor.character}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Directors */}
        {content.directors.length > 0 && (
          <div className="text-sm">
            <span className="text-text-muted font-semibold">{t('card.director')}: </span>
            {content.directors.map((d, i) => (
              <span key={d.id}>
                <button
                  onClick={() => navigate(`/person/${d.id}`)}
                  className="text-accent hover:underline"
                >
                  {d.name}
                </button>
                {i < content.directors.length - 1 && ', '}
              </span>
            ))}
          </div>
        )}

        {/* Writers */}
        {content.writers.length > 0 && (
          <div className="text-sm">
            <span className="text-text-muted font-semibold">{t('content.writers')}: </span>
            {content.writers.map((w, i) => (
              <span key={w.id}>
                {w.name}
                {i < content.writers.length - 1 && ', '}
              </span>
            ))}
          </div>
        )}

        {/* Awards */}
        {content.awards.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              {t('card.awards')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {content.awards.map((a, i) => (
                <Badge
                  key={i}
                  won={a.won}
                  label={`${a.category} ${a.year}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Providers */}
        {content.providers.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              {t('card.providers')}
            </h3>
            <div className="flex gap-2">
              {content.providers.map((p) => (
                <img
                  key={p.id}
                  src={tmdbLogo(p.logoPath)}
                  alt={p.name}
                  className="w-10 h-10 rounded-md object-cover bg-surface-light"
                  title={p.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Why recommended */}
        {content.recommendationReasons.length > 0 && (
          <div className="bg-surface-light rounded-md p-3">
            <h3 className="text-xs font-semibold text-accent uppercase tracking-wide mb-1.5">
              {t('content.whyRecommended')}
            </h3>
            <ul className="space-y-1">
              {content.recommendationReasons.map((reason, i) => (
                <li key={i} className="text-sm text-text-muted">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Watchlist actions */}
        <div className="flex gap-3 pt-2">
          {content.userStatus.inWatchlist ? (
            <Button variant="secondary" fullWidth>
              {t('content.inFavorites')}
            </Button>
          ) : (
            <Button variant="primary" fullWidth>
              {t('content.addToFavorites')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
