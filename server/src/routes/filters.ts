import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  genres,
  contentGenres,
  streamingProviders,
  contentProviders,
  collections,
  contentCollections,
  content,
  users,
} from '../db/schema.js';

export default async function filtersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /filters/genres
  app.get('/genres', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await request.db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      const locale = user[0]?.locale || 'uk';

      const result = await request.db
        .select({
          id: genres.id,
          nameEn: genres.nameEn,
          nameUk: genres.nameUk,
          emoji: genres.emoji,
          contentCount: sql<number>`count(${contentGenres.contentId})`,
        })
        .from(genres)
        .leftJoin(contentGenres, eq(genres.id, contentGenres.genreId))
        .groupBy(genres.id)
        .orderBy(genres.nameEn);

      return {
        genres: result.map((g) => ({
          id: g.id,
          name: locale === 'uk' ? (g.nameUk || g.nameEn) : g.nameEn,
          emoji: g.emoji,
          contentCount: Number(g.contentCount),
        })),
      };
    } catch (err) {
      request.log.error({ err, route: 'GET /genres', userId: request.userId }, 'Failed to fetch genres');
      throw err;
    }
  });

  // GET /filters/providers
  app.get('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = z.object({
        country: z.string().optional().default('UA'),
      }).parse(request.query);

      const result = await request.db
        .select({
          id: streamingProviders.id,
          name: streamingProviders.name,
          logoPath: streamingProviders.logoPath,
        })
        .from(streamingProviders)
        .innerJoin(contentProviders, eq(streamingProviders.id, contentProviders.providerId))
        .where(eq(contentProviders.country, query.country))
        .groupBy(streamingProviders.id)
        .orderBy(streamingProviders.name);

      return { providers: result };
    } catch (err) {
      request.log.error({ err, route: 'GET /providers', userId: request.userId }, 'Failed to fetch providers');
      throw err;
    }
  });

  // GET /filters/collections
  app.get('/collections', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await request.db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);
      const locale = user[0]?.locale || 'uk';

      const result = await request.db
        .select({
          id: collections.id,
          nameEn: collections.nameEn,
          nameUk: collections.nameUk,
          posterPath: collections.posterPath,
          contentCount: sql<number>`count(${contentCollections.contentId})`,
        })
        .from(collections)
        .leftJoin(contentCollections, eq(collections.id, contentCollections.collectionId))
        .groupBy(collections.id)
        .orderBy(collections.nameEn);

      return {
        collections: result.map((c) => ({
          id: c.id,
          name: locale === 'uk' ? (c.nameUk || c.nameEn) : c.nameEn,
          posterPath: c.posterPath,
          contentCount: Number(c.contentCount),
        })),
      };
    } catch (err) {
      request.log.error({ err, route: 'GET /collections', userId: request.userId }, 'Failed to fetch collections');
      throw err;
    }
  });

  // GET /filters/certifications
  app.get('/certifications', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await request.db
        .selectDistinct({ certification: content.certification })
        .from(content)
        .where(sql`${content.certification} IS NOT NULL`)
        .orderBy(content.certification);

      return {
        certifications: result.map((r) => r.certification).filter(Boolean),
      };
    } catch (err) {
      request.log.error({ err, route: 'GET /certifications', userId: request.userId }, 'Failed to fetch certifications');
      throw err;
    }
  });
}
