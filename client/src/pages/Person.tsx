import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePerson, usePersonFilmography } from '@/api/hooks';
import { tmdbProfile, tmdbPoster } from '@/utils/image';
import { formatDate } from '@/utils/format';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';

export default function Person() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [bioExpanded, setBioExpanded] = useState(false);

  const { data: person, isLoading } = usePerson(id ? Number(id) : null);
  const { data: filmography } = usePersonFilmography(id ? Number(id) : null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        {t('common.error')}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4 pb-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="p-1 mb-3 text-text-muted hover:text-text transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Photo + name */}
      <div className="flex items-start gap-4 mb-6">
        <img
          src={tmdbProfile(person.photoPath, 'h632')}
          alt={person.name}
          className="w-28 h-36 object-cover rounded-md bg-surface-light flex-shrink-0"
        />
        <div>
          <h1 className="text-xl font-bold">{person.name}</h1>
          <p className="text-sm text-text-muted capitalize mt-0.5">{person.knownFor}</p>
          {person.filmographyCount > 0 && (
            <p className="text-xs text-text-muted mt-1">
              {person.filmographyCount} {person.filmographyCount === 1 ? 'credit' : 'credits'}
            </p>
          )}
        </div>
      </div>

      {/* Biography */}
      {person.biography && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            {t('person.biography')}
          </h2>
          <p
            className={`text-sm text-text leading-relaxed ${
              !bioExpanded ? 'line-clamp-5' : ''
            }`}
          >
            {person.biography}
          </p>
          {person.biography.length > 300 && (
            <button
              onClick={() => setBioExpanded(!bioExpanded)}
              className="text-xs text-accent mt-1 hover:underline"
            >
              {bioExpanded ? t('common.close') : t('person.showMore')}
            </button>
          )}
        </div>
      )}

      {/* Awards */}
      {person.awards.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            {t('person.awards')}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {person.awards.map((a, i) => (
              <Badge
                key={i}
                won={a.won}
                label={`${a.category} ${a.year}${a.contentTitle ? ` - ${a.contentTitle}` : ''}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Filmography grouped by role */}
      {filmography && filmography.items.length > 0 && (() => {
        const roleLabels: Record<string, { en: string; uk: string }> = {
          actor: { en: 'Actor', uk: 'Актор' },
          director: { en: 'Director', uk: 'Режисер' },
          writer: { en: 'Writer', uk: 'Сценарист' },
        };
        const locale = i18n.language === 'uk' ? 'uk' : 'en';
        const grouped = new Map<string, typeof filmography.items>();
        for (const item of filmography.items) {
          const arr = grouped.get(item.role) || [];
          arr.push(item);
          grouped.set(item.role, arr);
        }
        // Show knownFor role first, then the rest
        const roles = [...grouped.keys()].sort((a, b) => {
          if (a === person?.knownFor) return -1;
          if (b === person?.knownFor) return 1;
          return 0;
        });

        return roles.map((role) => (
          <div key={role} className="mb-6">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              {roleLabels[role]?.[locale] || role}
            </h2>
            <div className="grid grid-cols-4 gap-x-3 gap-y-4">
              {grouped.get(role)!.map((item) => (
                <button
                  key={item.contentId}
                  onClick={() => navigate(`/content/${item.contentId}`)}
                  className="text-left"
                >
                  <img
                    src={tmdbPoster(item.posterPath, 'w185')}
                    alt={item.title}
                    className="w-full aspect-[2/3] object-cover rounded-md bg-surface-light"
                  />
                  <p className="text-sm text-text mt-1 leading-tight line-clamp-2">
                    {item.title}
                  </p>
                  <p className="text-xs text-text-muted">
                    {formatDate(item.releaseDate)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ));
      })()}

    </div>
  );
}
