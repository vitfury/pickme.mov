import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import api from '@/api/client';
import type { User } from '@/types';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (!accessToken || !refreshToken) {
      navigate('/login', { replace: true });
      return;
    }

    // Temporarily store tokens so the api interceptor can use them
    useAuthStore.getState().login(
      { accessToken, refreshToken },
      { id: 0, displayName: '', email: '', avatarUrl: null, locale: 'uk', theme: 'dark', onboardingCompleted: false },
    );

    api.get<User>('/users/me')
      .then(({ data }) => {
        login({ accessToken, refreshToken }, data);
        navigate(data.onboardingCompleted ? '/' : '/onboarding', { replace: true });
      })
      .catch(() => {
        useAuthStore.getState().logout();
        navigate('/login', { replace: true });
      });
  }, [params, navigate, login]);

  return (
    <div className="flex items-center justify-center min-h-full">
      <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  );
}
