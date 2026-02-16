import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, sql, or } from 'drizzle-orm';
import { z } from 'zod';
import { content, people, users } from '../db/schema.js';

const searchQuerySchema = z.object({
  q: z.string().min(2),
  type: z.enum(['content', 'person', 'all']).optional().default('all'),
  sort: z.enum(['relevance', 'rating', 'popularity']).optional().default('relevance'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export default async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /search
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = searchQuerySchema.parse(request.query);

      const user = await request.db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      const locale = user[0]?.locale || 'uk';

      const searchTerm = query.q;
      const result: { content: any[]; people: any[] } = { content: [], people: [] };

      // Search content
      if (query.type === 'content' || query.type === 'all') {
        const likeTerm = `%${searchTerm}%`;

        const relevanceExpr = sql`GREATEST(
          similarity(${content.titleEn}, ${searchTerm}),
          COALESCE(similarity(${content.titleUk}, ${searchTerm}), 0),
          CASE WHEN ${content.titleEn} ILIKE ${likeTerm} THEN 0.5 ELSE 0 END,
          CASE WHEN ${content.titleUk} ILIKE ${likeTerm} THEN 0.5 ELSE 0 END,
          CASE WHEN ${content.originalTitle} ILIKE ${likeTerm} THEN 0.5 ELSE 0 END
        )`;

        // All sorts are weighted by relevance so bad matches never rank first
        const orderExpr = query.sort === 'rating'
          ? sql`(${relevanceExpr} * COALESCE(${content.imdbRating}::numeric, 0)) DESC`
          : query.sort === 'popularity'
            ? sql`(${relevanceExpr} * COALESCE(${content.popularity}, 0)) DESC`
            : sql`(${relevanceExpr} + COALESCE(${content.popularity}, 0) / 500.0) DESC`;

        const contentResults = await request.db
          .select({
            id: content.id,
            titleEn: content.titleEn,
            titleUk: content.titleUk,
            posterPath: content.posterPath,
            releaseDate: content.releaseDate,
            contentType: content.contentType,
            imdbRating: content.imdbRating,
            tmdbRating: content.tmdbRating,
          })
          .from(content)
          .where(
            or(
              sql`similarity(${content.titleEn}, ${searchTerm}) > 0.4`,
              sql`similarity(${content.titleUk}, ${searchTerm}) > 0.4`,
              sql`${content.titleEn} ILIKE ${likeTerm}`,
              sql`${content.titleUk} ILIKE ${likeTerm}`,
              sql`${content.originalTitle} ILIKE ${likeTerm}`,
            ),
          )
          .orderBy(orderExpr)
          .limit(query.limit);

        result.content = contentResults.map((c) => ({
          id: c.id,
          title: locale === 'uk' ? (c.titleUk || c.titleEn) : c.titleEn,
          posterPath: c.posterPath,
          releaseDate: c.releaseDate,
          contentType: c.contentType,
          imdbRating: c.imdbRating ? parseFloat(c.imdbRating) : c.tmdbRating ? parseFloat(c.tmdbRating) : null,
        }));
      }

      // Search people
      if (query.type === 'person' || query.type === 'all') {
        const peopleLikeTerm = `%${searchTerm}%`;

        const peopleRelevanceExpr = sql`GREATEST(
          similarity(${people.nameEn}, ${searchTerm}),
          COALESCE(similarity(${people.nameUk}, ${searchTerm}), 0),
          CASE WHEN ${people.nameEn} ILIKE ${peopleLikeTerm} THEN 0.5 ELSE 0 END,
          CASE WHEN ${people.nameUk} ILIKE ${peopleLikeTerm} THEN 0.5 ELSE 0 END
        )`;

        // People: popularity weighted by relevance so bad matches never rank first
        const peopleOrderExpr = query.sort === 'popularity'
          ? sql`(${peopleRelevanceExpr} * COALESCE(${people.popularity}, 0)) DESC`
          : sql`(${peopleRelevanceExpr} + COALESCE(${people.popularity}, 0) / 500.0) DESC`;

        const peopleResults = await request.db
          .select({
            id: people.id,
            nameEn: people.nameEn,
            nameUk: people.nameUk,
            photoPath: people.photoPath,
            knownFor: people.knownFor,
          })
          .from(people)
          .where(
            or(
              sql`similarity(${people.nameEn}, ${searchTerm}) > 0.4`,
              sql`similarity(${people.nameUk}, ${searchTerm}) > 0.4`,
              sql`${people.nameEn} ILIKE ${peopleLikeTerm}`,
              sql`${people.nameUk} ILIKE ${peopleLikeTerm}`,
            ),
          )
          .orderBy(peopleOrderExpr)
          .limit(query.limit);

        result.people = peopleResults.map((p) => ({
          id: p.id,
          name: locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn,
          photoPath: p.photoPath,
          knownFor: p.knownFor,
        }));
      }

      return result;
    } catch (err) {
      request.log.error({ err, route: 'GET /search', userId: request.userId, query: request.query }, 'Search failed');
      throw err;
    }
  });
}
