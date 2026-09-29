import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAdminUsers, useMe, useSetTier } from '@/api/hooks';
import Spinner from '@/components/ui/Spinner';

/**
 * Адмінка: усі користувачі й перемикач тиру. Pro відкриває ШІ-чат.
 * Сторінка ховається від не-адмінів, але справжній замок — на сервері:
 * /admin/* відповідає 403 кожному, чий email не в ADMIN_EMAILS.
 */
export default function Admin() {
  const { t } = useTranslation();
  const { data: me, isLoading: meLoading } = useMe();
  const { data, isLoading } = useAdminUsers();
  const setTier = useSetTier();

  if (meLoading) return <div className="flex justify-center pt-20"><Spinner size={28} /></div>;
  if (!me?.isAdmin) return <Navigate to="/" replace />;

  const users = data?.users ?? [];
  const proCount = users.filter((u) => u.tier === 'pro').length;

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-8">
      <h1 className="text-lg font-bold">{t('admin.title')}</h1>
      <p className="text-xs text-text-muted mt-1 mb-4">
        {t('admin.summary', { total: users.length, pro: proCount })}
      </p>

      {isLoading ? (
        <div className="flex justify-center pt-10"><Spinner size={24} /></div>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 bg-surface-light border border-border rounded-lg p-3">
              {u.avatarUrl ? (
                <img src={u.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-surface shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {u.displayName}
                  {u.isAdmin && <span className="ml-1.5 text-[10px] text-accent uppercase tracking-wide">admin</span>}
                </div>
                <div className="text-xs text-text-muted truncate">{u.email}</div>
                <div className="text-[11px] text-text-muted">
                  {t('admin.swipes', { count: u.swipes })}
                  {u.createdAt && ` · ${new Date(u.createdAt).toLocaleDateString()}`}
                </div>
              </div>
              <div className="flex shrink-0 rounded-md border border-border overflow-hidden text-xs font-medium">
                {(['free', 'pro'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    disabled={setTier.isPending}
                    onClick={() => u.tier !== tier && setTier.mutate({ id: u.id, tier })}
                    className={`px-3 py-1.5 transition-colors ${
                      u.tier === tier
                        ? tier === 'pro' ? 'bg-accent text-bg' : 'bg-surface text-text'
                        : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {tier === 'pro' ? 'Pro' : 'Free'}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
