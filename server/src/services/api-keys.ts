import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { apiKeys } from '../db/schema.js';
import type { Database } from '../db/index.js';

const KEY_PREFIX = 'pk_live_';

// Shown in the UI so a user can tell their keys apart without storing the secret
const VISIBLE_PREFIX_LENGTH = KEY_PREFIX.length + 6;

export interface GeneratedKey {
  key: string;
  keyHash: string;
  keyPrefix: string;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): GeneratedKey {
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `${KEY_PREFIX}${secret}`;
  return {
    key,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, VISIBLE_PREFIX_LENGTH),
  };
}

/**
 * Resolve a bearer credential to its owner. Returns null for anything that is
 * not a live key — unknown, malformed, or revoked all look the same to callers.
 *
 * The lookup is by hash on a unique index, so a wrong key costs one index probe
 * and never a string comparison against a stored secret.
 */
export async function verifyApiKey(db: Database, key: string): Promise<number | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;

  const rows = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, revokedAt: apiKeys.revokedAt })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(key)))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt) return null;

  // "Last used" only needs to be accurate to the minute, and every MCP call
  // would otherwise write to this row.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(sql`${apiKeys.id} = ${row.id} AND (${apiKeys.lastUsedAt} IS NULL OR ${apiKeys.lastUsedAt} < NOW() - INTERVAL '1 minute')`)
    .catch(() => {});

  return row.userId;
}
