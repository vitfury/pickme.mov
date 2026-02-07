import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, asc, sql, count } from 'drizzle-orm';
import { z } from 'zod';
import { userWatchlist, content, users, userSwipes } from '../db/schema.js';
import { updatePreferencesForSwipe } from '../services/preferences.js';

const watchlistQuerySchema = z.object({
  filter: z.enum(['all', 'watched', 'unwatched']).optional().default('all'),
  sort: z.enum(['added', 'rating', 'year', 'personal_rating', 'title']).optional().default('added'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  contentType: z.enum(['movie', 'series', 'animation']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

const updateWatchlistSchema = z.object({
  watched: z.boolean().optional(),
  personalRating: z.number().int().min(1).max(10).optional(),
  watchedDate: z.string().optional(),
  notes: z.string().optional(),
});

export default async function watchlistRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /watchlist
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = watchlistQuerySchema.parse(request.query);
    const offset = (query.page - 1) * query.limit;

    const user = await request.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    const locale = user[0]?.locale || 'uk';

    // Build conditions
    const conditions: any[] = [eq(userWatchlist.userId, request.userId)];

    if (query.filter === 'watched') {
      conditions.push(eq(userWatchlist.watched, true));
    } else if (query.filter === 'unwatched') {
      conditions.push(eq(userWatchlist.watched, false));
    }

    if (query.contentType) {
      conditions.push(eq(content.contentType, query.contentType as any));
    }

    // Determine sort
    let orderBy;
    const dir = query.order === 'asc' ? asc : desc;
    switch (query.sort) {
      case 'rating':
        orderBy = dir(content.tmdbRating);
        break;
      case 'year':
        orderBy = dir(content.releaseDate);
        break;
      case 'personal_rating':
        orderBy = dir(userWatchlist.personalRating);
        break;
      case 'title':
        orderBy = locale === 'uk' ? dir(content.titleUk) : dir(content.titleEn);
        break;
      default:
        orderBy = dir(userWatchlist.createdAt);
    }

    const items = await request.db
      .select({
        contentId: content.id,
        titleEn: content.titleEn,
        titleUk: content.titleUk,
        posterPath: content.posterPath,
        releaseDate: content.releaseDate,
        tmdbRating: content.tmdbRating,
        contentType: content.contentType,
        watched: userWatchlist.watched,
        personalRating: userWatchlist.personalRating,
        watchedDate: userWatchlist.watchedDate,
        notes: userWatchlist.notes,
        addedAt: userWatchlist.createdAt,
      })
      .from(userWatchlist)
      .innerJoin(content, eq(userWatchlist.contentId, content.id))
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset);

    // Get counts
    const allCount = await request.db
      .select({ count: sql<number>`count(*)` })
      .from(userWatchlist)
      .where(eq(userWatchlist.userId, request.userId));

    const watchedCount = await request.db
      .select({ count: sql<number>`count(*)` })
      .from(userWatchlist)
      .where(and(eq(userWatchlist.userId, request.userId), eq(userWatchlist.watched, true)));

    const total = Number(allCount[0]?.count || 0);
    const watched = Number(watchedCount[0]?.count || 0);

    return {
      items: items.map((item) => ({
        contentId: item.contentId,
        title: locale === 'uk' ? (item.titleUk || item.titleEn) : item.titleEn,
        posterPath: item.posterPath,
        releaseDate: item.releaseDate,
        tmdbRating: item.tmdbRating ? parseFloat(item.tmdbRating) : null,
        contentType: item.contentType,
        watched: item.watched,
        personalRating: item.personalRating,
        watchedDate: item.watchedDate,
        notes: item.notes,
        addedAt: item.addedAt?.toISOString() || null,
      })),
      total,
      counts: {
        all: total,
        watched,
        unwatched: total - watched,
      },
    };
  });

  // PATCH /watchlist/:contentId
  app.patch('/:contentId', async (request: FastifyRequest<{ Params: { contentId: string } }>, reply: FastifyReply) => {
    const contentId = parseInt(request.params.contentId, 10);
    const body = updateWatchlistSchema.parse(request.body);

    const existing = await request.db
      .select()
      .from(userWatchlist)
      .where(and(eq(userWatchlist.userId, request.userId), eq(userWatchlist.contentId, contentId)))
      .limit(1);

    if (existing.length === 0) {
      return reply.status(404).send({ error: 'Watchlist entry not found' });
    }

    const updateData: Record<string, any> = {};
    if (body.watched !== undefined) updateData.watched = body.watched;
    if (body.personalRating !== undefined) updateData.personalRating = body.personalRating;
    if (body.watchedDate !== undefined) updateData.watchedDate = body.watchedDate;
    if (body.notes !== undefined) updateData.notes = body.notes;

    await request.db
      .update(userWatchlist)
      .set(updateData)
      .where(and(eq(userWatchlist.userId, request.userId), eq(userWatchlist.contentId, contentId)));

    // If personalRating provided and watched, update preferences
    if (body.personalRating !== undefined) {
      if (body.personalRating >= 8) {
        // Equivalent to additional like
        await updatePreferencesForSwipe(request.db, request.userId, contentId, 'like');
      } else if (body.personalRating <= 4) {
        // Equivalent to dislike
        await updatePreferencesForSwipe(request.db, request.userId, contentId, 'dislike');
      }
    }

    // Return updated entry
    const updated = await request.db
      .select()
      .from(userWatchlist)
      .where(and(eq(userWatchlist.userId, request.userId), eq(userWatchlist.contentId, contentId)))
      .limit(1);

    return updated[0];
  });

  // DELETE /watchlist/:contentId
  app.delete('/:contentId', async (request: FastifyRequest<{ Params: { contentId: string } }>, reply: FastifyReply) => {
    const contentId = parseInt(request.params.contentId, 10);

    // Remove from watchlist
    await request.db
      .delete(userWatchlist)
      .where(and(eq(userWatchlist.userId, request.userId), eq(userWatchlist.contentId, contentId)));

    // Get content type for the swipe record
    const contentRow = await request.db
      .select({ contentType: content.contentType })
      .from(content)
      .where(eq(content.id, contentId))
      .limit(1);

    if (contentRow.length > 0) {
      // Replace previous swipe with dislike
      await request.db
        .insert(userSwipes)
        .values({
          userId: request.userId,
          contentId,
          action: 'dislike',
          contentType: contentRow[0].contentType,
        })
        .onConflictDoUpdate({
          target: [userSwipes.userId, userSwipes.contentId],
          set: {
            action: 'dislike',
            createdAt: new Date(),
          },
        });
    }

    return reply.status(204).send();
  });
}
