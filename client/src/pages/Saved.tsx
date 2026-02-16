import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWatchlist, useBookmarks } from '@/api/hooks';
import { tmdbPoster } from '@/utils/image';
import Spinner from '@/components/ui/Spinner';
import EmptyState from '@/components/ui/EmptyState';
import type { WatchlistFilters, BookmarkFilters } from '@/types';

type TopTab = 'watchlist' | 'favorites';
type FavoritesTab = 'all' | 'unwatched' | 'watched';
type Sort = 'added' | 'rating' | 'year' | 'title';

export default function Saved() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [topTab, setTopTab] = useState<TopTab>('watchlist');
  const [favTab, setFavTab] = useState<FavoritesTab>('all');
  const [sort, setSort] = useState<Sort>('added');

  const bookmarkFilters: BookmarkFilters = { sort, order: 'desc' };
  const watchlistFilters: WatchlistFilters = { filter: favTab, sort, order: 'desc' };

  const { data: bookmarkData, isLoading: bookmarksLoading } = useBookmarks(bookmarkFilters);
  const { data: watchlistData, isLoading: watchlistLoading } = useWatchlist(watchlistFilters);

  const topTabs: { key: TopTab; labelKey: string }[] = [
    { key: 'watchlist', labelKey: 'saved.watchlist' },
    { key: 'favorites', labelKey: 'saved.favorites' },
  ];

  const favTabs: { key: FavoritesTab; labelKey: string }[] = [
    { key: 'all', labelKey: 'favorites.all' },
    { key: 'unwatched', labelKey: 'favorites.unwatched' },
    { key: 'watched', labelKey: 'favorites.watched' },
  ];

  const sorts: { key: Sort; labelKey: string }[] = [
    { key: 'added', labelKey: 'favorites.sortAdded' },
    { key: 'rating', labelKey: 'favorites.sortRating' },
    { key: 'year', labelKey: 'favorites.sortYear' },
    { key: 'title', labelKey: 'favorites.sortTitle' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pt-4">
      <h1 className="text-lg font-bold mb-3">{t('saved.title')}</h1>

      {/* Top toggle: Watchlist | Favorites */}
      <div className="flex bg-surface-light rounded-lg p-0.5 mb-3">
        {topTabs.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setTopTab(key)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              topTab === key
                ? 'bg-surface text-accent shadow-sm'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {topTab === 'watchlist' ? (
        /* Watchlist tab — bookmarked items */
        <>
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

          {bookmarksLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size={28} />
            </div>
          ) : !bookmarkData?.items.length ? (
            <EmptyState
              message={t('saved.emptyWatchlist')}
              hint={t('saved.emptyWatchlistHint')}
            />
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {bookmarkData.items.map((item) => (
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
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors" />
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Favorites tab — liked/superliked items */
        <>
          <div className="flex gap-1 mb-3">
            {favTabs.map(({ key, labelKey }) => (
              <button
                key={key}
                onClick={() => setFavTab(key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  favTab === key
                    ? 'bg-surface-light text-accent'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {t(labelKey)}
                {watchlistData?.counts && (
                  <span className="ml-1 text-xs opacity-60">
                    {watchlistData.counts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

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

          {watchlistLoading ? (
            <div className="flex justify-center py-12">
              <Spinner size={28} />
            </div>
          ) : !watchlistData?.items.length ? (
            <EmptyState
              message={t('favorites.empty')}
              hint={t('favorites.emptyHint')}
            />
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {watchlistData.items.map((item) => (
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
        </>
      )}
    </div>
  );
}
