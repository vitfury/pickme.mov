import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import PageShell from '@/components/layout/PageShell';
import Login from '@/pages/Login';
import Onboarding from '@/pages/Onboarding';
import Feed from '@/pages/Feed';
import Watchlist from '@/pages/Watchlist';
import Search from '@/pages/Search';
import Profile from '@/pages/Profile';
import Person from '@/pages/Person';
import ContentDetail from '@/pages/ContentDetail';

export default function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<PageShell />}>
          <Route path="/" element={<Feed />} />
          <Route path="/watchlist" element={<Watchlist />} />
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
