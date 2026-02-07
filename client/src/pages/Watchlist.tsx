import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWatchlist } from '@/api/hooks';
import { tmdbPoster } from '@/utils/image';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import type { WatchlistFilters } from '@/types';

type Tab = 'all' | 'unwatched' | 'watched';
type Sort = 'added' | 'rating' | 'year' | 'title';

export default function Watchlist() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('added');

  const filters: WatchlistFilters = {
    filter: tab,
    sort,
    order: 'desc',
  };

  const { data, isLoading } = useWatchlist(filters);

  const tabs: { key: Tab; labelKey: string }[] = [
    { key: 'all', labelKey: 'watchlist.all' },
    { key: 'unwatched', labelKey: 'watchlist.unwatched' },
    { key: 'watched', labelKey: 'watchlist.watched' },
  ];

  const sorts: { key: Sort; labelKey: string }[] = [
    { key: 'added', labelKey: 'watchlist.sortAdded' },
    { key: 'rating', labelKey: 'watchlist.sortRating' },
    { key: 'year', labelKey: 'watchlist.sortYear' },
    { key: 'title', labelKey: 'watchlist.sortTitle' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4">
      <h1 className="text-lg font-bold mb-3">{t('watchlist.title')}</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {tabs.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === key
                ? 'bg-surface-light text-accent'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {t(labelKey)}
            {data?.counts && (
              <span className="ml-1 text-xs opacity-60">
                {data.counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex gap-1 mb-4">
        {sorts.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              sort === key
                ? 'text-accent bg-accent/10'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size={28} />
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          message={t('watchlist.empty')}
          hint={t('watchlist.emptyHint')}
        />
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {data.items.map((item) => (
            <button
              key={item.contentId}
              onClick={() => navigate(`/content/${item.contentId}`)}
              className="relative group"
            >
              <img
                src={tmdbPoster(item.posterPath, 'w342')}
                alt={item.title}
                className="w-full aspect-[2/3] object-cover rounded-md bg-surface-light"
              />
              {item.watched && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-like rounded-full flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
              {item.personalRating && (
                <div className="absolute bottom-1 right-1 bg-black/70 text-accent text-[10px] font-bold px-1 rounded">
                  {item.personalRating}
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
