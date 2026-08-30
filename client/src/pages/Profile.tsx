import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useUserStats, useResetPreferences, useUpdateProfile } from '@/api/hooks';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import McpKeys from '@/components/profile/McpKeys';
import i18n from '@/i18n/config';

export default function Profile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const locale = useUIStore((s) => s.locale);
  const setLocale = useUIStore((s) => s.setLocale);

  const [resetModalOpen, setResetModalOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useUserStats();
  const resetPreferences = useResetPreferences();
  const updateProfile = useUpdateProfile();

  const handleLocaleChange = (newLocale: 'uk' | 'en') => {
    setLocale(newLocale);
    i18n.changeLanguage(newLocale);
    updateProfile.mutate({ locale: newLocale });
    updateUser({ locale: newLocale });
  };

  const handleThemeToggle = () => {
    toggleTheme();
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    updateProfile.mutate({ theme: newTheme });
    updateUser({ theme: newTheme });
  };

  const handleReset = async () => {
    await resetPreferences.mutateAsync();
    updateUser({ onboardingCompleted: false });
    setResetModalOpen(false);
    navigate('/onboarding', { replace: true });
  };

  const handleExport = () => {
    window.open('/api/v1/users/me/export?format=json', '_blank');
  };

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8 space-y-6">
      {/* User info */}
      <div className="flex items-center gap-3">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-surface-light flex items-center justify-center text-text-muted">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold">{user?.displayName}</h1>
          <p className="text-xs text-text-muted">{user?.email}</p>
        </div>
      </div>

      {/* Language */}
      <div>
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          {t('profile.language')}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleLocaleChange('uk')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              locale === 'uk'
                ? 'bg-accent/15 text-accent border border-accent'
                : 'bg-surface-light text-text-muted border border-border'
            }`}
          >
            🇺🇦 UA
          </button>
          <button
            onClick={() => handleLocaleChange('en')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              locale === 'en'
                ? 'bg-accent/15 text-accent border border-accent'
                : 'bg-surface-light text-text-muted border border-border'
            }`}
          >
            🇬🇧 EN
          </button>
        </div>
      </div>

      {/* Theme */}
      <div>
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
          {t('profile.theme')}
        </h2>
        <button
          onClick={handleThemeToggle}
          className="flex items-center gap-2 px-4 py-2 bg-surface-light rounded-md text-sm text-text border border-border"
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
          {theme === 'dark' ? t('profile.dark') : t('profile.light')}
        </button>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
          {t('profile.stats')}
        </h2>
        {statsLoading ? (
          <Spinner size={20} />
        ) : stats ? (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: t('profile.totalSwiped'), value: stats.totalSwiped },
                { label: t('profile.likes'), value: stats.likes },
                { label: t('profile.dislikes'), value: stats.dislikes },
                { label: t('profile.skips'), value: stats.skips },
                { label: t('profile.favoritesSize'), value: stats.watchlistSize },
                { label: t('profile.watchedCount'), value: stats.watched },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface-light rounded-md p-3 text-center">
                  <p className="text-lg font-bold text-accent">{value}</p>
                  <p className="text-[10px] text-text-muted leading-tight">{label}</p>
                </div>
              ))}
            </div>

            {/* Top genres */}
            {stats.topGenres.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-text-muted mb-2">
                  {t('profile.topGenres')}
                </h3>
                <div className="space-y-1.5">
                  {stats.topGenres.slice(0, 5).map((g, i) => {
                    const maxScore = stats.topGenres[0]?.score ?? 1;
                    const pct = (g.score / maxScore) * 100;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-text w-20 truncate">{g.genre}</span>
                        <div className="flex-1 h-2 bg-surface-light rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top directors */}
            {stats.topDirectors.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-text-muted mb-2">
                  {t('profile.topDirectors')}
                </h3>
                <div className="space-y-1">
                  {stats.topDirectors.slice(0, 5).map((d, i) => (
                    <p key={i} className="text-sm text-text">{d.name}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Top actors */}
            {stats.topActors.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-text-muted mb-2">
                  {t('profile.topActors')}
                </h3>
                <div className="space-y-1">
                  {stats.topActors.slice(0, 5).map((a, i) => (
                    <p key={i} className="text-sm text-text">{a.name}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* MCP access */}
      <McpKeys />

      {/* Actions */}
      <div className="space-y-2 pt-2">
        <Button variant="secondary" fullWidth onClick={() => setResetModalOpen(true)}>
          {t('profile.resetPreferences')}
        </Button>
        <Button variant="secondary" fullWidth onClick={handleExport}>
          {t('profile.exportFavorites')}
        </Button>
        <Button variant="danger" fullWidth onClick={handleLogout}>
          {t('profile.logout')}
        </Button>
      </div>

      {/* Version */}
      <p className="text-[10px] text-text-muted/50 text-center pt-2">
        {__APP_VERSION__} &middot; {new Date(__BUILD_TIME__).toLocaleString()}
      </p>

      {/* Reset confirmation modal */}
      <Modal
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={t('profile.resetPreferences')}
      >
        <p className="text-sm text-text-muted mb-4">{t('profile.resetConfirm')}</p>
        <div className="flex gap-3">
          <Button variant="ghost" fullWidth onClick={() => setResetModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={handleReset}
            disabled={resetPreferences.isPending}
          >
            {resetPreferences.isPending ? <Spinner size={16} /> : t('profile.resetConfirmAction')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
