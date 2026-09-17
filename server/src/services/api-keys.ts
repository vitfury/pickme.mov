import crypto from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import { apiKeys } from '../db/schema.js';
import type { Database } from '../db/index.js';

const KEY_PREFIX = 'pk_live_';

// Keys minted for the chat bot. A different prefix so they are obvious in logs
// and in the key list, and so they can never be confused with a user's own key.
const CHAT_KEY_PREFIX = 'pk_chat_';

const VALID_PREFIXES = [KEY_PREFIX, CHAT_KEY_PREFIX];

// Shown in the UI so a user can tell their keys apart without storing the secret
const VISIBLE_PREFIX_LENGTH = KEY_PREFIX.length + 6;

// Long enough for a slow local model to finish a multi-step tool loop, short
// enough that a key leaked through the bot is worthless by the time it is found.
const CHAT_KEY_TTL_MS = 30 * 60 * 1000;

export interface GeneratedKey {
  key: string;
  keyHash: string;
  keyPrefix: string;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(prefix: string = KEY_PREFIX): GeneratedKey {
  const secret = crypto.randomBytes(24).toString('base64url');
  const key = `${prefix}${secret}`;
  return {
    key,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, VISIBLE_PREFIX_LENGTH),
  };
}

/**
 * Mint a short-lived key for one chat exchange and hand it to the bot container.
 *
 * This is the whole isolation boundary: the bot holds no database credentials
 * and no session secret, so the most a prompt injection can reach is this
 * user's MCP tools, for the next half hour.
 *
 * Expired keys are swept opportunistically here rather than on a timer — the
 * table is small and this is the only thing that creates them.
 */
export async function mintChatKey(db: Database, userId: number): Promise<string> {
  const generated = generateApiKey(CHAT_KEY_PREFIX);
  const expiresAt = new Date(Date.now() + CHAT_KEY_TTL_MS);

  await db.insert(apiKeys).values({
    userId,
    name: 'Chat session',
    keyPrefix: generated.keyPrefix,
    keyHash: generated.keyHash,
    expiresAt,
  });

  void db
    .delete(apiKeys)
    .where(and(sql`${apiKeys.keyPrefix} LIKE ${CHAT_KEY_PREFIX + '%'}`, lt(apiKeys.expiresAt, new Date())))
    .catch(() => {});

  return generated.key;
}

/**
 * Resolve a bearer credential to its owner. Returns null for anything that is
 * not a live key — unknown, malformed, or revoked all look the same to callers.
 *
 * The lookup is by hash on a unique index, so a wrong key costs one index probe
 * and never a string comparison against a stored secret.
 */
export async function verifyApiKey(db: Database, key: string): Promise<number | null> {
  if (!VALID_PREFIXES.some((p) => key.startsWith(p))) return null;

  const rows = await db
    .select({
      id: apiKeys.id,
      userId: apiKeys.userId,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(key)))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;

  // "Last used" only needs to be accurate to the minute, and every MCP call
  // would otherwise write to this row.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(sql`${apiKeys.id} = ${row.id} AND (${apiKeys.lastUsedAt} IS NULL OR ${apiKeys.lastUsedAt} < NOW() - INTERVAL '1 minute')`)
    .catch(() => {});

  return row.userId;
}
