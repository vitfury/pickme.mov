/**
 * Автооновлення відкритого застосунку після деплою.
 *
 * PWA на iOS може тижнями жити у фоні зі старим JS, навіть коли на сервері
 * вже нова версія, — і стара клієнтська логіка з новим API дає дивні збої.
 * Тож звіряємо мітку збірки з /version.json при кожному поверненні з фону й
 * щопівхвилини, поки застосунок відкритий, і на новій версії одразу
 * перезавантажуємось. Користувачів мало — зайві запити нічого не коштують.
 */
const POLL_MS = 30 * 1000;
let reloading = false;

async function checkForUpdate() {
  if (reloading) return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build?: string };
    if (build && build !== __BUILD_TIME__) {
      reloading = true;
      window.location.reload();
    }
  } catch {
    // Немає мережі — спробуємо наступного разу
  }
}

export function startAutoUpdate() {
  if (import.meta.env.DEV) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('focus', checkForUpdate);
  window.addEventListener('pageshow', checkForUpdate);
  setInterval(() => {
    if (document.visibilityState === 'visible') checkForUpdate();
  }, POLL_MS);
}
