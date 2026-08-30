import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { userSwipes, content, users, userBookmarks } from '../db/schema.js';
import { generateFeed } from '../services/recommendation.js';
import { updatePreferencesForSwipe, reversePreferencesForSwipe } from '../services/preferences.js';

const feedQuerySchema = z.object({
  contentType: z.enum(['movie', 'series', 'animation']).optional().default('movie'),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  genres: z.string().optional().transform((v) => v ? v.split(',').map(Number) : undefined),
  yearMin: z.coerce.number().int().optional(),
  yearMax: z.coerce.number().int().optional(),
  ratingMin: z.coerce.number().optional(),
  ratingMax: z.coerce.number().optional(),
  runtimeMin: z.coerce.number().int().optional(),
  runtimeMax: z.coerce.number().int().optional(),
  certification: z.string().optional().transform((v) => v ? v.split(',') : undefined),
  providers: z.string().optional().transform((v) => v ? v.split(',').map(Number) : undefined),
  countries: z.string().optional().transform((v) => v ? v.split(',') : undefined),
  personId: z.coerce.number().int().optional(),
  collectionId: z.coerce.number().int().optional(),
  awards: z.enum(['winner', 'nominated']).optional(),
});

const swipeBodySchema = z.object({
  contentId: z.number().int().positive(),
  action: z.enum(['like', 'dislike', 'skip']),
});

export default async function feedRoutes(app: FastifyInstance) {
  // All feed routes require authentication
  app.addHook('preHandler', app.authenticate);

  // GET /feed
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const filters = feedQuerySchema.parse(request.query);
      const user = await request.db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);

      const locale = user[0]?.locale || 'uk';
      const result = await generateFeed(request.db, request.userId, filters, locale);
      return result;
    } catch (err) {
      request.log.error({ err, route: 'GET /feed', userId: request.userId, query: request.query }, 'Feed fetch failed');
      throw err;
    }
  });

  // POST /feed/swipe
  app.post('/swipe', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = swipeBodySchema.parse(request.body);

      // Get content info
      const contentRow = await request.db
        .select({ contentType: content.contentType })
        .from(content)
        .where(eq(content.id, body.contentId))
        .limit(1);

      if (contentRow.length === 0) {
        return reply.status(404).send({ error: 'Content not found' });
      }

      // An opinion implies the title was seen: you cannot like or dislike what you
      // have not watched. A skip says nothing either way, and never clears a
      // viewing already recorded (e.g. marked through the MCP server).
      const impliesWatched = body.action === 'like' || body.action === 'dislike';

      // Record swipe (upsert)
      await request.db
        .insert(userSwipes)
        .values({
          userId: request.userId,
          contentId: body.contentId,
          action: body.action,
          contentType: contentRow[0].contentType,
          isWatched: impliesWatched,
          watchedAt: impliesWatched ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [userSwipes.userId, userSwipes.contentId],
          set: {
            action: body.action,
            createdAt: new Date(),
            ...(impliesWatched
              ? {
                  isWatched: true,
                  // keep the first viewing date if one is already on record
                  watchedAt: sql`COALESCE(${userSwipes.watchedAt}, NOW())`,
                }
              : {}),
          },
        });

      // Skip: just record, no preferences/maturity updates
      if (body.action === 'skip') {
        return {
          success: true,
          isWatched: false,
          maturityScore: 0,
          preferencesUpdated: [],
        };
      }

      // Update preferences
      const preferencesUpdated = await updatePreferencesForSwipe(
        request.db,
        request.userId,
        body.contentId,
        body.action,
      );

      // Watching it settles the question the bookmark was asking
      // Auto-remove bookmark on like/dislike
      await request.db
        .delete(userBookmarks)
        .where(
          and(
            eq(userBookmarks.userId, request.userId),
            eq(userBookmarks.contentId, body.contentId),
          ),
        );

      // Get updated maturity score
      const userRow = await request.db
        .select({ maturityScore: users.maturityScore })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);

      return {
        success: true,
        isWatched: impliesWatched,
        maturityScore: userRow[0]?.maturityScore || 0,
        preferencesUpdated,
      };
    } catch (err) {
      request.log.error({ err, route: 'POST /feed/swipe', userId: request.userId, body: request.body }, 'Swipe failed');
      throw err;
    }
  });

  // POST /feed/undo
  app.post('/undo', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Find the last swipe
      const lastSwipe = await request.db
        .select()
        .from(userSwipes)
        .where(eq(userSwipes.userId, request.userId))
        .orderBy(desc(userSwipes.createdAt))
        .limit(1);

      if (lastSwipe.length === 0) {
        return reply.status(404).send({ error: 'No swipe to undo' });
      }

      const swipe = lastSwipe[0];

      // Reverse preference updates ('skip' and 'watched' carry no opinion)
      if (swipe.action === 'like' || swipe.action === 'dislike') {
        await reversePreferencesForSwipe(
          request.db,
          request.userId,
          swipe.contentId,
          swipe.action,
        );
      }

      // Delete the swipe record
      await request.db
        .delete(userSwipes)
        .where(eq(userSwipes.id, swipe.id));

      // Get content info for response
      const contentRow = await request.db
        .select({
          id: content.id,
          titleEn: content.titleEn,
          titleUk: content.titleUk,
          posterPath: content.posterPath,
        })
        .from(content)
        .where(eq(content.id, swipe.contentId))
        .limit(1);

      const user = await request.db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.id, request.userId))
        .limit(1);

      const locale = user[0]?.locale || 'uk';
      const c = contentRow[0];

      return {
        success: true,
        restoredContent: c
          ? {
              id: c.id,
              title: locale === 'uk' ? (c.titleUk || c.titleEn) : c.titleEn,
              posterPath: c.posterPath,
            }
          : null,
      };
    } catch (err) {
      request.log.error({ err, route: 'POST /feed/undo', userId: request.userId }, 'Undo failed');
      throw err;
    }
  });
}
