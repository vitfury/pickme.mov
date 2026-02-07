import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  people,
  contentPeople,
  content,
  awards,
  userSwipes,
  userWatchlist,
  users,
} from '../db/schema.js';

const filmographyQuerySchema = z.object({
  role: z.enum(['actor', 'director', 'writer']).optional(),
  sort: z.enum(['year', 'rating']).optional().default('year'),
});

export default async function peopleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /people/:id
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const personId = parseInt(request.params.id, 10);

    const user = await request.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    const locale = user[0]?.locale || 'uk';

    const person = await request.db
      .select()
      .from(people)
      .where(eq(people.id, personId))
      .limit(1);

    if (person.length === 0) {
      return reply.status(404).send({ error: 'Person not found' });
    }

    const p = person[0];

    // Get awards
    const personAwards = await request.db
      .select({
        category: awards.category,
        ceremonyYear: awards.ceremonyYear,
        won: awards.won,
        contentId: awards.contentId,
        titleEn: content.titleEn,
        titleUk: content.titleUk,
      })
      .from(awards)
      .innerJoin(content, eq(awards.contentId, content.id))
      .where(eq(awards.personId, personId))
      .orderBy(desc(awards.ceremonyYear));

    // Get filmography count
    const filmCount = await request.db
      .select({ count: sql<number>`count(DISTINCT ${contentPeople.contentId})` })
      .from(contentPeople)
      .where(eq(contentPeople.personId, personId));

    return {
      id: p.id,
      name: locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn,
      photoPath: p.photoPath,
      biography: locale === 'uk' ? (p.biographyUk || p.biographyEn) : p.biographyEn,
      knownFor: p.knownFor,
      awards: personAwards.map((a) => ({
        category: a.category,
        year: a.ceremonyYear,
        won: a.won,
        contentTitle: locale === 'uk' ? (a.titleUk || a.titleEn) : a.titleEn,
      })),
      filmographyCount: Number(filmCount[0]?.count || 0),
    };
  });

  // GET /people/:id/filmography
  app.get('/:id/filmography', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const personId = parseInt(request.params.id, 10);
    const query = filmographyQuerySchema.parse(request.query);

    const user = await request.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    const locale = user[0]?.locale || 'uk';

    const conditions: any[] = [eq(contentPeople.personId, personId)];
    if (query.role) {
      conditions.push(eq(contentPeople.role, query.role as any));
    }

    const orderBy = query.sort === 'rating'
      ? desc(content.tmdbRating)
      : desc(content.releaseDate);

    const filmography = await request.db
      .select({
        contentId: content.id,
        titleEn: content.titleEn,
        titleUk: content.titleUk,
        posterPath: content.posterPath,
        releaseDate: content.releaseDate,
        tmdbRating: content.tmdbRating,
        role: contentPeople.role,
      })
      .from(contentPeople)
      .innerJoin(content, eq(contentPeople.contentId, content.id))
      .where(and(...conditions))
      .orderBy(orderBy);

    // Check watchlist/swipe status for each item
    const contentIds = filmography.map((f) => f.contentId);

    const swipes = contentIds.length > 0
      ? await request.db
          .select({ contentId: userSwipes.contentId, action: userSwipes.action })
          .from(userSwipes)
          .where(and(eq(userSwipes.userId, request.userId), sql`${userSwipes.contentId} = ANY(${contentIds})`))
      : [];

    const watchlistItems = contentIds.length > 0
      ? await request.db
          .select({ contentId: userWatchlist.contentId })
          .from(userWatchlist)
          .where(and(eq(userWatchlist.userId, request.userId), sql`${userWatchlist.contentId} = ANY(${contentIds})`))
      : [];

    const swipeMap = new Map(swipes.map((s) => [s.contentId, s.action]));
    const watchlistSet = new Set(watchlistItems.map((w) => w.contentId));

    return {
      items: filmography.map((f) => ({
        contentId: f.contentId,
        title: locale === 'uk' ? (f.titleUk || f.titleEn) : f.titleEn,
        posterPath: f.posterPath,
        releaseDate: f.releaseDate,
        tmdbRating: f.tmdbRating ? parseFloat(f.tmdbRating) : null,
        role: f.role,
        inWatchlist: watchlistSet.has(f.contentId),
        swiped: swipeMap.get(f.contentId) || null,
      })),
    };
  });
}
