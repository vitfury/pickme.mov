import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  users,
  userSwipes,
  content,
  genres,
  people,
  contentGenres,
} from '../db/schema.js';
import { isAdminEmail } from '../services/access.js';
import { getTasteProfile, topEntities } from '../services/taste.js';

const updateUserSchema = z.object({
  locale: z.enum(['uk', 'en']).optional(),
  theme: z.enum(['dark', 'light']).optional(),
});

const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).optional().default('json'),
});

export default async function usersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /users/me
  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await request.db
        .select()
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);

      if (user.length === 0) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const u = user[0];
      return {
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        avatarUrl: u.avatarUrl,
        locale: u.locale,
        theme: u.theme,
        onboardingCompleted: u.onboardingCompleted,
        tier: u.tier === 'pro' ? 'pro' : 'free',
        isAdmin: isAdminEmail(u.email),
      };
    } catch (err) {
      request.log.error({ err, route: 'GET /me', userId: request.userId }, 'Failed to fetch user profile');
      throw err;
    }
  });

  // PATCH /users/me
  app.patch('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = updateUserSchema.parse(request.body);

      const updateData: Record<string, any> = {};
      if (body.locale !== undefined) updateData.locale = body.locale;
      if (body.theme !== undefined) updateData.theme = body.theme;

      if (Object.keys(updateData).length > 0) {
        await request.db
          .update(users)
          .set(updateData)
          .where(eq(users.id, request.userId));
      }

      const updated = await request.db
        .select()
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);

      const u = updated[0];
      return {
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        avatarUrl: u.avatarUrl,
        locale: u.locale,
        theme: u.theme,
        onboardingCompleted: u.onboardingCompleted,
      };
    } catch (err) {
      request.log.error({ err, route: 'PATCH /me', userId: request.userId, body: request.body }, 'Failed to update user profile');
      throw err;
    }
  });

  // GET /users/me/stats
  app.get('/me/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await request.db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      const locale = user[0]?.locale || 'uk';

      // Swipe counts
      const totalSwiped = await request.db
        .select({ count: sql<number>`count(*)` })
        .from(userSwipes)
        .where(eq(userSwipes.userId, request.userId));

      const likes = await request.db
        .select({ count: sql<number>`count(*)` })
        .from(userSwipes)
        .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.action, 'like')));

      const dislikes = await request.db
        .select({ count: sql<number>`count(*)` })
        .from(userSwipes)
        .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.action, 'dislike')));

      const skips = await request.db
        .select({ count: sql<number>`count(*)` })
        .from(userSwipes)
        .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.action, 'skip')));

      // Favorites are the liked titles; watched counts every title seen,
      // however it was recorded
      const watchlistSize = await request.db
        .select({ count: sql<number>`count(*)` })
        .from(userSwipes)
        .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.action, 'like')));

      const watchedCount = await request.db
        .select({ count: sql<number>`count(*)` })
        .from(userSwipes)
        .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.isWatched, true)));

      // Топи — з профілю смаку, тобто рівно з лайків і дизлайків. Людей
      // показуємо від двох лайків: один фільм ще не робить режисера улюбленим.
      const profile = await getTasteProfile(request.db, request.userId);
      const genreTop = topEntities(profile, 'genre', 5);
      const directorTop = topEntities(profile, 'director', 5, 2);
      const actorTop = topEntities(profile, 'actor', 5, 2);
      const genreIds = genreTop.map((t) => t.id as number);
      const personIds = [...directorTop, ...actorTop].map((t) => t.id as number);
      const [genreRows, personRows] = await Promise.all([
        genreIds.length ? request.db.select().from(genres).where(inArray(genres.id, genreIds)) : [],
        personIds.length ? request.db.select().from(people).where(inArray(people.id, personIds)) : [],
      ]);
      const genreName = new Map(genreRows.map((g) => [g.id, locale === 'uk' ? (g.nameUk || g.nameEn) : g.nameEn]));
      const personName = new Map(personRows.map((p) => [p.id, locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn]));
      const named = (list: typeof genreTop, names: Map<number, string>) =>
        list
          .filter((t) => names.has(t.id as number))
          .map((t) => ({ name: names.get(t.id as number)!, score: t.score, likes: t.likes }));

      return {
        totalSwiped: Number(totalSwiped[0]?.count || 0),
        likes: Number(likes[0]?.count || 0),
        dislikes: Number(dislikes[0]?.count || 0),
        skips: Number(skips[0]?.count || 0),
        watchlistSize: Number(watchlistSize[0]?.count || 0),
        watched: Number(watchedCount[0]?.count || 0),
        topGenres: named(genreTop, genreName).map(({ name, ...rest }) => ({ genre: name, ...rest })),
        topDirectors: named(directorTop, personName),
        topActors: named(actorTop, personName),
      };
    } catch (err) {
      request.log.error({ err, route: 'GET /me/stats', userId: request.userId }, 'Failed to fetch user stats');
      throw err;
    }
  });

  // POST /users/me/reset-preferences
  app.post('/me/reset-preferences', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.db
        .delete(userSwipes)
        .where(eq(userSwipes.userId, request.userId));

      return reply.status(204).send();
    } catch (err) {
      request.log.error({ err, route: 'POST /me/reset-preferences', userId: request.userId, body: request.body }, 'Failed to reset user preferences');
      throw err;
    }
  });

  // GET /users/me/export
  app.get('/me/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = exportQuerySchema.parse(request.query);

      const user = await request.db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      const locale = user[0]?.locale || 'uk';

      const watchlistItems = await request.db
        .select({
          titleEn: content.titleEn,
          titleUk: content.titleUk,
          contentType: content.contentType,
          releaseDate: content.releaseDate,
          tmdbRating: content.tmdbRating,
          watched: userSwipes.isWatched,
          watchedDate: userSwipes.watchedAt,
          addedAt: userSwipes.createdAt,
        })
        .from(userSwipes)
        .innerJoin(content, eq(userSwipes.contentId, content.id))
        .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.action, 'like')))
        .orderBy(desc(userSwipes.createdAt));

      const exportData = watchlistItems.map((item) => ({
        title: locale === 'uk' ? (item.titleUk || item.titleEn) : item.titleEn,
        contentType: item.contentType,
        releaseDate: item.releaseDate,
        tmdbRating: item.tmdbRating ? parseFloat(item.tmdbRating) : null,
        watched: item.watched,
        watchedDate: item.watchedDate?.toISOString() || null,
        addedAt: item.addedAt?.toISOString() || null,
      }));

      if (query.format === 'csv') {
        const headers = ['title', 'contentType', 'releaseDate', 'tmdbRating', 'watched', 'watchedDate', 'addedAt'];
        const csvRows = [headers.join(',')];
        for (const item of exportData) {
          const row = headers.map((h) => {
            const val = (item as any)[h];
            if (val === null || val === undefined) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          });
          csvRows.push(row.join(','));
        }

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename="watchlist.csv"');
        return csvRows.join('\n');
      }

      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', 'attachment; filename="watchlist.json"');
      return exportData;
    } catch (err) {
      request.log.error({ err, route: 'GET /me/export', userId: request.userId }, 'Failed to export user watchlist');
      throw err;
    }
  });
}
