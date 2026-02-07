import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSearch } from '@/api/hooks';
import { tmdbPoster, tmdbProfile } from '@/utils/image';
import { formatDate, formatRating } from '@/utils/format';
import SearchInput from '@/components/ui/SearchInput';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';

export default function Search() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const { data, isLoading } = useSearch(query);

  const hasResults = data && (data.content.length > 0 || data.people.length > 0);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4">
      <div className="sticky top-0 z-10 bg-bg pb-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('search.placeholder')}
          autoFocus
        />
      </div>

      {isLoading && query.length >= 2 && (
        <div className="flex justify-center py-12">
          <Spinner size={28} />
        </div>
      )}

      {query.length >= 2 && !isLoading && !hasResults && (
        <EmptyState
          message={t('search.noResults')}
          hint={t('search.noResultsHint')}
        />
      )}

      {data && hasResults && (
        <div className="space-y-6 pb-4">
          {/* Content results */}
          {data.content.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                {t('search.movies')}
              </h2>
              <div className="space-y-1">
                {data.content.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/content/${item.id}`)}
                    className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-surface-light transition-colors text-left"
                  >
                    <img
                      src={tmdbPoster(item.posterPath, 'w92')}
                      alt=""
                      className="w-10 h-14 object-cover rounded bg-surface-light flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{item.title}</p>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span>{formatDate(item.releaseDate)}</span>
                        <span className="capitalize">{item.contentType}</span>
                        {item.tmdbRating && (
                          <span className="flex items-center gap-0.5">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-accent">
                              <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7.4-6.3-4.8-6.3 4.8 2.3-7.4-6-4.6h7.6z" />
                            </svg>
                            {formatRating(item.tmdbRating)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* People results */}
          {data.people.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                {t('search.people')}
              </h2>
              <div className="space-y-1">
                {data.people.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => navigate(`/person/${person.id}`)}
                    className="flex items-center gap-3 w-full p-2 rounded-md hover:bg-surface-light transition-colors text-left"
                  >
                    <img
                      src={tmdbProfile(person.photoPath, 'w45')}
                      alt=""
                      className="w-10 h-10 object-cover rounded-full bg-surface-light flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{person.name}</p>
                      <p className="text-xs text-text-muted capitalize">{person.knownFor}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
