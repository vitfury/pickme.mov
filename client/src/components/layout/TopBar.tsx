import { useTranslation } from 'react-i18next';
import { useFeedStore } from '@/stores/feedStore';
import { useUIStore } from '@/stores/uiStore';
import type { ContentType } from '@/types';

const tabs: { key: ContentType; labelKey: string }[] = [
  { key: 'movie', labelKey: 'feed.movies' },
  { key: 'series', labelKey: 'feed.series' },
  { key: 'animation', labelKey: 'feed.animation' },
];

export default function TopBar() {
  const { t } = useTranslation();
  const contentType = useFeedStore((s) => s.contentType);
  const setContentType = useFeedStore((s) => s.setContentType);
  const setFilterDrawerOpen = useUIStore((s) => s.setFilterDrawerOpen);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-bg/70 backdrop-blur-md safe-top">
      <div className="flex items-center justify-between px-4 h-12 max-w-lg mx-auto">
        <div className="flex gap-1">
          {tabs.map(({ key, labelKey }) => (
            <button
              key={key}
              onClick={() => setContentType(key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                contentType === key
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFilterDrawerOpen(true)}
          className="p-2 text-white/60 hover:text-white transition-colors"
          aria-label={t('feed.filters')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        </button>
      </div>
    </header>
  );
}
