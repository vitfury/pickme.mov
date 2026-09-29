import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import type { Database } from '../db/index.js';

export type Tier = 'free' | 'pro';

/**
 * Адміни задаються списком email у ADMIN_EMAILS, а не роллю в базі: їх один-два,
 * і так неможливо «підвищити» себе через будь-яку дірку в API — лише доступом
 * до .env на сервері.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'omelchenkovitaly@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

export interface Access {
  tier: Tier;
  isAdmin: boolean;
  /** Чи дозволено ШІ-чат. Адмін завжди може — щоб не зачинити себе ж. */
  canChat: boolean;
}

export async function getAccess(db: Database, userId: number): Promise<Access | null> {
  const rows = await db
    .select({ email: users.email, tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (rows.length === 0) return null;

  const tier: Tier = rows[0].tier === 'pro' ? 'pro' : 'free';
  const isAdmin = isAdminEmail(rows[0].email);
  return { tier, isAdmin, canChat: isAdmin || tier === 'pro' };
}
