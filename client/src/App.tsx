import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import PageShell from '@/components/layout/PageShell';
import Login from '@/pages/Login';
import Onboarding from '@/pages/Onboarding';
import Feed from '@/pages/Feed';
import Saved from '@/pages/Saved';
import Search from '@/pages/Search';
import Profile from '@/pages/Profile';
import Person from '@/pages/Person';
import ContentDetail from '@/pages/ContentDetail';
import AuthCallback from '@/pages/AuthCallback';

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const theme = useUIStore((s) => s.theme);
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // i18n визначає мову сам — по localStorage, а на першому заході по мові
  // браузера. uiStore при цьому мав власний дефолт, і вони розходились:
  // інтерфейс англійською, а в сторі «uk», тож перемикач у профілі підсвічував
  // не ту кнопку, а бот відповідав не тією мовою. Джерело правди одне — i18n.
  useEffect(() => {
    const sync = (lng: string) => {
      const locale = lng.startsWith('uk') ? 'uk' : 'en';
      if (useUIStore.getState().locale !== locale) useUIStore.getState().setLocale(locale);
    };
    sync(i18n.language);
    i18n.on('languageChanged', sync);
    return () => { i18n.off('languageChanged', sync); };
  }, [i18n]);

  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<PageShell />}>
          <Route path="/" element={<Feed />} />
          <Route path="/saved" element={<Saved />} />
          <Route path="/watchlist" element={<Navigate to="/saved" replace />} />
          <Route path="/search" element={<Search />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/person/:id" element={<Person />} />
          <Route path="/content/:id" element={<ContentDetail />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
