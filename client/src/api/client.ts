import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

/**
 * Обміняти refresh-токен на новий access.
 *
 * Живе окремо від перехоплювача, бо не всі запити йдуть через axios: чат
 * стрімить SSE голим fetch, і йому потрібен той самий механізм. Паралельні
 * виклики поділяють одну спробу — інакше два запити, що протухли одночасно,
 * спалили б refresh-токен двічі й розлогінили користувача.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    }).catch(() => null);
  }

  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) {
    useAuthStore.getState().logout();
    return null;
  }

  isRefreshing = true;
  try {
    const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
    useAuthStore.getState().login(
      { accessToken: data.accessToken, refreshToken: data.refreshToken },
      useAuthStore.getState().user!,
    );
    processQueue(null, data.accessToken);
    return data.accessToken as string;
  } catch (err) {
    processQueue(err, null);
    useAuthStore.getState().logout();
    return null;
  } finally {
    isRefreshing = false;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;

      const token = await refreshAccessToken();
      if (!token) return Promise.reject(error);

      originalRequest.headers.Authorization = `Bearer ${token}`;
      return api(originalRequest);
    }

    return Promise.reject(error);
  },
);

export default api;
