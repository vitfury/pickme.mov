/**
 * Автооновлення відкритого застосунку після деплою.
 *
 * PWA на iOS може тижнями жити у фоні зі старим JS, навіть коли на сервері
 * вже нова версія, — і стара клієнтська логіка з новим API дає дивні збої.
 * Тож коли застосунок повертається з фону, звіряємо мітку збірки з
 * /version.json і, якщо вона інша, перезавантажуємось.
 */
const CHECK_INTERVAL_MS = 60 * 1000;
let lastCheck = 0;

async function checkForUpdate() {
  if (Date.now() - lastCheck < CHECK_INTERVAL_MS) return;
  lastCheck = Date.now();
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build?: string };
    if (build && build !== __BUILD_TIME__) window.location.reload();
  } catch {
    // Немає мережі чи dev-сервер без version.json — спробуємо наступного разу
  }
}

export function startAutoUpdate() {
  if (import.meta.env.DEV) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}
