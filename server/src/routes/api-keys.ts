import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiKeys } from '../db/schema.js';
import { generateApiKey } from '../services/api-keys.js';

const MAX_ACTIVE_KEYS = 10;

const createBodySchema = z.object({
  name: z.string().min(1).max(100),
});

export default async function apiKeyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /api-keys — the secret is never returned again after creation
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const rows = await request.db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          lastUsedAt: apiKeys.lastUsedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        // expiresAt is null for keys the user made; the chat's own short-lived
        // keys are an implementation detail and never shown in the list.
        .where(and(
          eq(apiKeys.userId, request.userId),
          isNull(apiKeys.revokedAt),
          isNull(apiKeys.expiresAt),
        ))
        .orderBy(desc(apiKeys.createdAt));

      return {
        keys: rows.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          lastUsedAt: k.lastUsedAt?.toISOString() || null,
          createdAt: k.createdAt?.toISOString() || null,
        })),
      };
    } catch (err) {
      request.log.error({ err, route: 'GET /api-keys', userId: request.userId }, 'Failed to list API keys');
      throw err;
    }
  });

  // POST /api-keys — returns the plaintext key exactly once
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createBodySchema.parse(request.body);

      const active = await request.db
        .select({ count: sql<number>`count(*)` })
        .from(apiKeys)
        .where(and(eq(apiKeys.userId, request.userId), isNull(apiKeys.revokedAt)));

      if (Number(active[0]?.count || 0) >= MAX_ACTIVE_KEYS) {
        return reply.status(409).send({ error: 'Key limit reached', limit: MAX_ACTIVE_KEYS });
      }

      const generated = generateApiKey();

      const inserted = await request.db
        .insert(apiKeys)
        .values({
          userId: request.userId,
          name: body.name,
          keyPrefix: generated.keyPrefix,
          keyHash: generated.keyHash,
        })
        .returning({ id: apiKeys.id, createdAt: apiKeys.createdAt });

      return reply.status(201).send({
        id: inserted[0].id,
        name: body.name,
        keyPrefix: generated.keyPrefix,
        createdAt: inserted[0].createdAt?.toISOString() || null,
        // Only time this is ever sent
        key: generated.key,
      });
    } catch (err) {
      request.log.error({ err, route: 'POST /api-keys', userId: request.userId }, 'Failed to create API key');
      throw err;
    }
  });

  // DELETE /api-keys/:id — revoke (kept as a row so the audit trail survives)
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (Number.isNaN(id)) {
        return reply.status(400).send({ error: 'Invalid key id' });
      }

      const revoked = await request.db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, request.userId), isNull(apiKeys.revokedAt)))
        .returning({ id: apiKeys.id });

      if (revoked.length === 0) {
        return reply.status(404).send({ error: 'Key not found' });
      }

      return { success: true };
    } catch (err) {
      request.log.error({ err, route: 'DELETE /api-keys/:id', userId: request.userId }, 'Failed to revoke API key');
      throw err;
    }
  });
}
