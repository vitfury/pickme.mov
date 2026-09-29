import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { users, userSwipes } from '../db/schema.js';
import { getAccess, isAdminEmail } from '../services/access.js';

const tierBodySchema = z.object({ tier: z.enum(['free', 'pro']) });
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // Кожен запит сюди перевіряє адмінство заново, з бази — токен сам по собі
  // нічого не дає, навіть якщо його видали адміну
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const access = await getAccess(request.db, request.userId);
    if (!access?.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  });

  // GET /admin/users — усі користувачі з тиром і кількістю свайпів
  app.get('/users', async (request: FastifyRequest) => {
    const rows = await request.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        tier: users.tier,
        createdAt: users.createdAt,
        swipes: sql<number>`(select count(*) from ${userSwipes} where ${userSwipes.userId} = ${users.id})`,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return {
      users: rows.map((u) => ({
        ...u,
        swipes: Number(u.swipes),
        isAdmin: isAdminEmail(u.email),
        createdAt: u.createdAt?.toISOString() ?? null,
      })),
    };
  });

  // PATCH /admin/users/:id — змінити тир
  app.patch('/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = tierBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.status(400).send({ error: 'Invalid request' });
    }

    const updated = await request.db
      .update(users)
      .set({ tier: body.data.tier, updatedAt: new Date() })
      .where(eq(users.id, params.data.id))
      .returning({ id: users.id, tier: users.tier });

    if (updated.length === 0) return reply.status(404).send({ error: 'User not found' });

    request.log.info(
      { adminId: request.userId, targetId: params.data.id, tier: body.data.tier },
      'tier changed',
    );
    return updated[0];
  });
}
