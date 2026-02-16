import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, asc } from 'drizzle-orm';
import { z } from 'zod';
import { userBookmarks, content, users } from '../db/schema.js';

const toggleBodySchema = z.object({
  contentId: z.number().int().positive(),
});

const listQuerySchema = z.object({
  sort: z.enum(['added', 'rating', 'year', 'title']).optional().default('added'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  contentType: z.enum(['movie', 'series', 'animation']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export default async function bookmarkRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // POST /bookmarks — toggle bookmark
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = toggleBodySchema.parse(request.body);

    // Check if bookmark exists
    const existing = await request.db
      .select({ id: userBookmarks.id })
      .from(userBookmarks)
      .where(and(eq(userBookmarks.userId, request.userId), eq(userBookmarks.contentId, body.contentId)))
      .limit(1);

    if (existing.length > 0) {
      await request.db
        .delete(userBookmarks)
        .where(eq(userBookmarks.id, existing[0].id));
      return { bookmarked: false };
    }

    await request.db
      .insert(userBookmarks)
      .values({ userId: request.userId, contentId: body.contentId })
      .onConflictDoNothing();

    return { bookmarked: true };
  });

  // DELETE /bookmarks/:contentId
  app.delete('/:contentId', async (request: FastifyRequest<{ Params: { contentId: string } }>, reply: FastifyReply) => {
    const contentId = parseInt(request.params.contentId, 10);
    await request.db
      .delete(userBookmarks)
      .where(and(eq(userBookmarks.userId, request.userId), eq(userBookmarks.contentId, contentId)));
    return { success: true };
  });

  // GET /bookmarks — list bookmarks
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listQuerySchema.parse(request.query);

    const user = await request.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    const locale = user[0]?.locale || 'uk';

    const offset = (query.page - 1) * query.limit;

    let orderBy;
    switch (query.sort) {
      case 'rating':
        orderBy = query.order === 'asc' ? asc(content.imdbRating) : desc(content.imdbRating);
        break;
      case 'year':
        orderBy = query.order === 'asc' ? asc(content.releaseDate) : desc(content.releaseDate);
        break;
      case 'title':
        orderBy = query.order === 'asc' ? asc(content.titleEn) : desc(content.titleEn);
        break;
      default:
        orderBy = query.order === 'asc' ? asc(userBookmarks.createdAt) : desc(userBookmarks.createdAt);
    }

    const conditions = [eq(userBookmarks.userId, request.userId)];
    if (query.contentType) {
      conditions.push(eq(content.contentType, query.contentType as any));
    }

    const rows = await request.db
      .select({
        contentId: content.id,
        titleEn: content.titleEn,
        titleUk: content.titleUk,
        posterPath: content.posterPath,
        releaseDate: content.releaseDate,
        contentType: content.contentType,
        imdbRating: content.imdbRating,
        createdAt: userBookmarks.createdAt,
      })
      .from(userBookmarks)
      .innerJoin(content, eq(userBookmarks.contentId, content.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset);

    const items = rows.map((r) => ({
      contentId: r.contentId,
      title: locale === 'uk' ? (r.titleUk || r.titleEn) : r.titleEn,
      posterPath: r.posterPath,
      releaseDate: r.releaseDate,
      contentType: r.contentType,
      imdbRating: r.imdbRating ? parseFloat(r.imdbRating) : null,
      addedAt: r.createdAt?.toISOString() || '',
    }));

    return { items, total: items.length };
  });
}
