import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/uiStore';

// Дві вкладки ліворуч, дві праворуч — між ними кнопка ШІ
const leftItems = [
  { to: '/', labelKey: 'nav.feed', icon: FilmIcon },
  { to: '/search', labelKey: 'nav.search', icon: SearchIcon },
] as const;

const rightItems = [
  { to: '/saved', labelKey: 'nav.saved', icon: BookmarkIcon },
  { to: '/profile', labelKey: 'nav.profile', icon: UserIcon },
] as const;

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
    isActive ? 'text-accent' : 'text-text-muted'
  }`;

export default function BottomNav() {
  const { t } = useTranslation();
  const chatOpen = useUIStore((s) => s.chatOpen);
  const setChatOpen = useUIStore((s) => s.setChatOpen);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-sm border-t border-border safe-bottom-half">
      <div className="relative grid grid-cols-[1fr_1fr_78px_1fr_1fr] items-center h-14 max-w-lg mx-auto">
        {leftItems.map(({ to, labelKey, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={tabClass}>
            <Icon />
            <span className="text-[10px] font-medium">{t(labelKey)}</span>
          </NavLink>
        ))}

        <span aria-hidden="true" />

        {rightItems.map(({ to, labelKey, icon: Icon }) => (
          <NavLink key={to} to={to} className={tabClass}>
            <Icon />
            <span className="text-[10px] font-medium">{t(labelKey)}</span>
          </NavLink>
        ))}

        {/* bottom-[25px], бо обертання на 45° опускає нижній кут ромба на
            10.4px нижче за власну рамку — на 17px обідок майже торкався краю */}
        <span className="ai-dock absolute left-1/2 -translate-x-1/2 bottom-[25px] z-10 leading-none">
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            data-open={chatOpen}
            aria-label={t('nav.ai')}
            aria-expanded={chatOpen}
            className="ai-dock-btn flex items-center justify-center cursor-pointer"
          >
            <span className="ai-dock-mark inline-flex">
              <SparkleIcon />
            </span>
          </button>
        </span>
      </div>
    </nav>
  );
}

function FilmIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// Розсип зірочок: чотирипроменева зірка з увігнутими гранями — кожна грань
// це квадратична крива з контрольною точкою рівно в центрі зірки.
function SparkleIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'translateY(3px)' }}>
      <path d="M10.2 5Q10.2 13.6 18.8 13.6Q10.2 13.6 10.2 22.2Q10.2 13.6 1.6 13.6Q10.2 13.6 10.2 5Z" />
      <path d="M18.6 1.5Q18.6 5.8 22.9 5.8Q18.6 5.8 18.6 10.1Q18.6 5.8 14.3 5.8Q18.6 5.8 18.6 1.5Z" />
      <path d="M4.6 2.5Q4.6 5.2 7.3 5.2Q4.6 5.2 4.6 7.9Q4.6 5.2 1.9 5.2Q4.6 5.2 4.6 2.5Z" />
    </svg>
  );
}
