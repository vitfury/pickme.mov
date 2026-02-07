import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, sql, or } from 'drizzle-orm';
import { z } from 'zod';
import { content, people, users } from '../db/schema.js';

const searchQuerySchema = z.object({
  q: z.string().min(2),
  type: z.enum(['content', 'person', 'all']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

export default async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /search
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = searchQuerySchema.parse(request.query);

    const user = await request.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    const locale = user[0]?.locale || 'uk';

    const searchTerm = query.q;
    const result: { content: any[]; people: any[] } = { content: [], people: [] };

    // Search content using pg_trgm similarity
    if (query.type === 'content' || query.type === 'all') {
      const contentResults = await request.db
        .select({
          id: content.id,
          titleEn: content.titleEn,
          titleUk: content.titleUk,
          posterPath: content.posterPath,
          releaseDate: content.releaseDate,
          contentType: content.contentType,
          tmdbRating: content.tmdbRating,
          similarity: sql<number>`GREATEST(
            similarity(${content.titleEn}, ${searchTerm}),
            COALESCE(similarity(${content.titleUk}, ${searchTerm}), 0)
          )`,
        })
        .from(content)
        .where(
          or(
            sql`similarity(${content.titleEn}, ${searchTerm}) > 0.1`,
            sql`similarity(${content.titleUk}, ${searchTerm}) > 0.1`,
          ),
        )
        .orderBy(sql`GREATEST(
          similarity(${content.titleEn}, ${searchTerm}),
          COALESCE(similarity(${content.titleUk}, ${searchTerm}), 0)
        ) DESC`)
        .limit(query.limit);

      result.content = contentResults.map((c) => ({
        id: c.id,
        title: locale === 'uk' ? (c.titleUk || c.titleEn) : c.titleEn,
        posterPath: c.posterPath,
        releaseDate: c.releaseDate,
        contentType: c.contentType,
        tmdbRating: c.tmdbRating ? parseFloat(c.tmdbRating) : null,
      }));
    }

    // Search people using pg_trgm similarity
    if (query.type === 'person' || query.type === 'all') {
      const peopleResults = await request.db
        .select({
          id: people.id,
          nameEn: people.nameEn,
          nameUk: people.nameUk,
          photoPath: people.photoPath,
          knownFor: people.knownFor,
          similarity: sql<number>`GREATEST(
            similarity(${people.nameEn}, ${searchTerm}),
            COALESCE(similarity(${people.nameUk}, ${searchTerm}), 0)
          )`,
        })
        .from(people)
        .where(
          or(
            sql`similarity(${people.nameEn}, ${searchTerm}) > 0.1`,
            sql`similarity(${people.nameUk}, ${searchTerm}) > 0.1`,
          ),
        )
        .orderBy(sql`GREATEST(
          similarity(${people.nameEn}, ${searchTerm}),
          COALESCE(similarity(${people.nameUk}, ${searchTerm}), 0)
        ) DESC`)
        .limit(query.limit);

      result.people = peopleResults.map((p) => ({
        id: p.id,
        name: locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn,
        photoPath: p.photoPath,
        knownFor: p.knownFor,
      }));
    }

    return result;
  });
}
