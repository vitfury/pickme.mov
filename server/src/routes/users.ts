import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  users,
  userSwipes,
  userPreferences,
  userWatchlist,
  content,
  genres,
  people,
  contentGenres,
} from '../db/schema.js';

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
    };
  });

  // PATCH /users/me
  app.patch('/me', async (request: FastifyRequest, reply: FastifyReply) => {
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
  });

  // GET /users/me/stats
  app.get('/me/stats', async (request: FastifyRequest, reply: FastifyReply) => {
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

    const superlikes = await request.db
      .select({ count: sql<number>`count(*)` })
      .from(userSwipes)
      .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.action, 'superlike')));

    // Watchlist counts
    const watchlistSize = await request.db
      .select({ count: sql<number>`count(*)` })
      .from(userWatchlist)
      .where(eq(userWatchlist.userId, request.userId));

    const watchedCount = await request.db
      .select({ count: sql<number>`count(*)` })
      .from(userWatchlist)
      .where(and(eq(userWatchlist.userId, request.userId), eq(userWatchlist.watched, true)));

    // Top genres
    const topGenres = await request.db
      .select({
        entityId: userPreferences.entityId,
        rawScore: userPreferences.rawScore,
        nameEn: genres.nameEn,
        nameUk: genres.nameUk,
      })
      .from(userPreferences)
      .innerJoin(genres, eq(userPreferences.entityId, genres.id))
      .where(and(eq(userPreferences.userId, request.userId), eq(userPreferences.entityType, 'genre')))
      .orderBy(desc(userPreferences.rawScore))
      .limit(5);

    // Top directors
    const topDirectors = await request.db
      .select({
        entityId: userPreferences.entityId,
        rawScore: userPreferences.rawScore,
        nameEn: people.nameEn,
        nameUk: people.nameUk,
      })
      .from(userPreferences)
      .innerJoin(people, eq(userPreferences.entityId, people.id))
      .where(and(eq(userPreferences.userId, request.userId), eq(userPreferences.entityType, 'director')))
      .orderBy(desc(userPreferences.rawScore))
      .limit(5);

    // Top actors
    const topActors = await request.db
      .select({
        entityId: userPreferences.entityId,
        rawScore: userPreferences.rawScore,
        nameEn: people.nameEn,
        nameUk: people.nameUk,
      })
      .from(userPreferences)
      .innerJoin(people, eq(userPreferences.entityId, people.id))
      .where(and(eq(userPreferences.userId, request.userId), eq(userPreferences.entityType, 'actor')))
      .orderBy(desc(userPreferences.rawScore))
      .limit(5);

    return {
      totalSwiped: Number(totalSwiped[0]?.count || 0),
      likes: Number(likes[0]?.count || 0),
      dislikes: Number(dislikes[0]?.count || 0),
      superlikes: Number(superlikes[0]?.count || 0),
      watchlistSize: Number(watchlistSize[0]?.count || 0),
      watched: Number(watchedCount[0]?.count || 0),
      topGenres: topGenres.map((g) => ({
        genre: locale === 'uk' ? (g.nameUk || g.nameEn) : g.nameEn,
        score: parseFloat(g.rawScore || '0'),
      })),
      topDirectors: topDirectors.map((d) => ({
        name: locale === 'uk' ? (d.nameUk || d.nameEn) : d.nameEn,
        score: parseFloat(d.rawScore || '0'),
      })),
      topActors: topActors.map((a) => ({
        name: locale === 'uk' ? (a.nameUk || a.nameEn) : a.nameEn,
        score: parseFloat(a.rawScore || '0'),
      })),
    };
  });

  // GET /users/me/preferences
  app.get('/me/preferences', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await request.db
      .select({ maturityScore: users.maturityScore, locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    const locale = user[0]?.locale || 'uk';

    const allPrefs = await request.db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, request.userId))
      .orderBy(desc(userPreferences.rawScore));

    // Group by entity type
    const grouped: Record<string, any[]> = {
      genre: [], director: [], actor: [], keyword: [], decade: [], collection: [],
    };

    // Fetch names for genres, directors, actors
    const genreIds = allPrefs.filter((p) => p.entityType === 'genre').map((p) => p.entityId);
    const directorIds = allPrefs.filter((p) => p.entityType === 'director').map((p) => p.entityId);
    const actorIds = allPrefs.filter((p) => p.entityType === 'actor').map((p) => p.entityId);

    const [genreNames, personNames] = await Promise.all([
      genreIds.length > 0
        ? request.db.select().from(genres).where(sql`${genres.id} = ANY(${genreIds})`)
        : [],
      (directorIds.length > 0 || actorIds.length > 0)
        ? request.db.select().from(people).where(sql`${people.id} = ANY(${[...directorIds, ...actorIds]})`)
        : [],
    ]);

    const genreMap = new Map(genreNames.map((g) => [g.id, locale === 'uk' ? (g.nameUk || g.nameEn) : g.nameEn]));
    const personMap = new Map(personNames.map((p) => [p.id, locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn]));

    for (const pref of allPrefs) {
      let name = '';
      switch (pref.entityType) {
        case 'genre':
          name = genreMap.get(pref.entityId) || `Genre ${pref.entityId}`;
          break;
        case 'director':
        case 'actor':
          name = personMap.get(pref.entityId) || `Person ${pref.entityId}`;
          break;
        case 'decade':
          name = `${pref.entityId}s`;
          break;
        case 'keyword':
          name = `Keyword ${pref.entityId}`;
          break;
        case 'collection':
          name = `Collection ${pref.entityId}`;
          break;
      }

      if (grouped[pref.entityType]) {
        grouped[pref.entityType].push({
          entityId: pref.entityId,
          name,
          score: parseFloat(pref.rawScore || '0'),
          interactions: pref.interactionCount || 0,
        });
      }
    }

    return {
      maturityScore: user[0]?.maturityScore || 0,
      preferences: grouped,
    };
  });

  // POST /users/me/reset-preferences
  app.post('/me/reset-preferences', async (request: FastifyRequest, reply: FastifyReply) => {
    await request.db
      .delete(userPreferences)
      .where(eq(userPreferences.userId, request.userId));

    await request.db
      .update(users)
      .set({ maturityScore: 0 })
      .where(eq(users.id, request.userId));

    return reply.status(204).send();
  });

  // GET /users/me/export
  app.get('/me/export', async (request: FastifyRequest, reply: FastifyReply) => {
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
        watched: userWatchlist.watched,
        personalRating: userWatchlist.personalRating,
        watchedDate: userWatchlist.watchedDate,
        notes: userWatchlist.notes,
        addedAt: userWatchlist.createdAt,
      })
      .from(userWatchlist)
      .innerJoin(content, eq(userWatchlist.contentId, content.id))
      .where(eq(userWatchlist.userId, request.userId))
      .orderBy(desc(userWatchlist.createdAt));

    const exportData = watchlistItems.map((item) => ({
      title: locale === 'uk' ? (item.titleUk || item.titleEn) : item.titleEn,
      contentType: item.contentType,
      releaseDate: item.releaseDate,
      tmdbRating: item.tmdbRating ? parseFloat(item.tmdbRating) : null,
      watched: item.watched,
      personalRating: item.personalRating,
      watchedDate: item.watchedDate,
      notes: item.notes,
      addedAt: item.addedAt?.toISOString() || null,
    }));

    if (query.format === 'csv') {
      const headers = ['title', 'contentType', 'releaseDate', 'tmdbRating', 'watched', 'personalRating', 'watchedDate', 'notes', 'addedAt'];
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
  });
}
