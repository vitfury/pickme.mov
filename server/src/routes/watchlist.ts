import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { content, users, userSwipes } from '../db/schema.js';
import { reversePreferencesForSwipe } from '../services/preferences.js';

// "Favorites" is not a list of its own — it is the set of titles the user liked.
// The like is the single record of both the opinion and the viewing, so there is
// nothing here to keep in sync.
const favoritesQuerySchema = z.object({
  sort: z.enum(['added', 'rating', 'year', 'title']).optional().default('added'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  contentType: z.enum(['movie', 'series', 'animation']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export default async function watchlistRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /watchlist — liked titles
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = favoritesQuerySchema.parse(request.query);
      const offset = (query.page - 1) * query.limit;

      const user = await request.db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      const locale = user[0]?.locale || 'uk';

      const conditions: any[] = [
        eq(userSwipes.userId, request.userId),
        eq(userSwipes.action, 'like'),
      ];

      if (query.contentType) {
        conditions.push(eq(content.contentType, query.contentType as any));
      }

      let orderBy;
      const dir = query.order === 'asc' ? asc : desc;
      switch (query.sort) {
        case 'rating':
          orderBy = dir(content.imdbRating);
          break;
        case 'year':
          orderBy = dir(content.releaseDate);
          break;
        case 'title':
          orderBy = locale === 'uk' ? dir(content.titleUk) : dir(content.titleEn);
          break;
        default:
          orderBy = dir(userSwipes.createdAt);
      }

      const items = await request.db
        .select({
          contentId: content.id,
          titleEn: content.titleEn,
          titleUk: content.titleUk,
          posterPath: content.posterPath,
          releaseDate: content.releaseDate,
          imdbRating: content.imdbRating,
          tmdbRating: content.tmdbRating,
          contentType: content.contentType,
          watchedAt: userSwipes.watchedAt,
          addedAt: userSwipes.createdAt,
        })
        .from(userSwipes)
        .innerJoin(content, eq(userSwipes.contentId, content.id))
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(query.limit)
        .offset(offset);

      const allCount = await request.db
        .select({ count: sql<number>`count(*)` })
        .from(userSwipes)
        .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.action, 'like')));

      const total = Number(allCount[0]?.count || 0);

      return {
        items: items.map((item) => ({
          contentId: item.contentId,
          title: locale === 'uk' ? (item.titleUk || item.titleEn) : item.titleEn,
          posterPath: item.posterPath,
          releaseDate: item.releaseDate,
          imdbRating: item.imdbRating
            ? parseFloat(item.imdbRating)
            : item.tmdbRating
              ? parseFloat(item.tmdbRating)
              : null,
          contentType: item.contentType,
          watchedAt: item.watchedAt?.toISOString() || null,
          addedAt: item.addedAt?.toISOString() || null,
        })),
        total,
      };
    } catch (err) {
      request.log.error({ err, route: 'GET /watchlist', userId: request.userId }, 'Failed to fetch favorites');
      throw err;
    }
  });

  // DELETE /watchlist/:contentId — take back the like
  app.delete('/:contentId', async (request: FastifyRequest<{ Params: { contentId: string } }>, reply: FastifyReply) => {
    try {
      const contentId = parseInt(request.params.contentId, 10);
      if (Number.isNaN(contentId)) {
        return reply.status(400).send({ error: 'Invalid content id' });
      }

      const existing = await request.db
        .select({ id: userSwipes.id })
        .from(userSwipes)
        .where(and(
          eq(userSwipes.userId, request.userId),
          eq(userSwipes.contentId, contentId),
          eq(userSwipes.action, 'like'),
        ))
        .limit(1);

      if (existing.length === 0) {
        return reply.status(404).send({ error: 'Not in favorites' });
      }

      // Withdrawing the like withdraws the taste signal it created
      await reversePreferencesForSwipe(request.db, request.userId, contentId, 'like');
      await request.db.delete(userSwipes).where(eq(userSwipes.id, existing[0].id));

      return { success: true };
    } catch (err) {
      request.log.error({ err, route: 'DELETE /watchlist/:contentId', userId: request.userId }, 'Failed to remove from favorites');
      throw err;
    }
  });
}
