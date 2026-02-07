import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  genres,
  content,
  contentGenres,
  onboardingSeeds,
  users,
  userPreferences,
  userSwipes,
} from '../db/schema.js';
import { updatePreferencesForSwipe } from '../services/preferences.js';

const completeOnboardingSchema = z.object({
  selectedGenres: z.array(z.number().int().positive()),
  movieRatings: z.array(z.object({
    contentId: z.number().int().positive(),
    action: z.enum(['like', 'dislike', 'superlike']),
  })),
});

export default async function onboardingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /onboarding/genres
  app.get('/genres', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await request.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    const locale = user[0]?.locale || 'uk';

    // Get genres with a representative poster
    const allGenres = await request.db
      .select({
        id: genres.id,
        tmdbId: genres.tmdbId,
        nameEn: genres.nameEn,
        nameUk: genres.nameUk,
        emoji: genres.emoji,
      })
      .from(genres)
      .orderBy(genres.nameEn);

    // For each genre, get a representative poster from top-rated content
    const genresWithPosters = await Promise.all(
      allGenres.map(async (g) => {
        const topContent = await request.db
          .select({ posterPath: content.posterPath })
          .from(contentGenres)
          .innerJoin(content, eq(contentGenres.contentId, content.id))
          .where(eq(contentGenres.genreId, g.id))
          .orderBy(sql`${content.baseQualityScore} DESC`)
          .limit(1);

        return {
          id: g.id,
          name: locale === 'uk' ? (g.nameUk || g.nameEn) : g.nameEn,
          emoji: g.emoji,
          posterPath: topContent[0]?.posterPath || null,
        };
      }),
    );

    return { genres: genresWithPosters };
  });

  // GET /onboarding/seeds
  app.get('/seeds', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await request.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    const locale = user[0]?.locale || 'uk';

    const seeds = await request.db
      .select({
        id: content.id,
        titleEn: content.titleEn,
        titleUk: content.titleUk,
        posterPath: content.posterPath,
        releaseDate: content.releaseDate,
      })
      .from(onboardingSeeds)
      .innerJoin(content, eq(onboardingSeeds.contentId, content.id))
      .where(eq(onboardingSeeds.isActive, true))
      .orderBy(onboardingSeeds.displayOrder);

    // Get genres for each seed
    const seedIds = seeds.map((s) => s.id);
    const seedGenres = seedIds.length > 0
      ? await request.db
          .select({
            contentId: contentGenres.contentId,
            nameEn: genres.nameEn,
            nameUk: genres.nameUk,
          })
          .from(contentGenres)
          .innerJoin(genres, eq(contentGenres.genreId, genres.id))
          .where(sql`${contentGenres.contentId} = ANY(${seedIds})`)
      : [];

    const genresByContent = new Map<number, string[]>();
    for (const sg of seedGenres) {
      const arr = genresByContent.get(sg.contentId) || [];
      arr.push(locale === 'uk' ? (sg.nameUk || sg.nameEn) : sg.nameEn);
      genresByContent.set(sg.contentId, arr);
    }

    return {
      seeds: seeds.map((s) => ({
        id: s.id,
        title: locale === 'uk' ? (s.titleUk || s.titleEn) : s.titleEn,
        posterPath: s.posterPath,
        releaseDate: s.releaseDate,
        genres: genresByContent.get(s.id) || [],
      })),
    };
  });

  // POST /onboarding/complete
  app.post('/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = completeOnboardingSchema.parse(request.body);

    // 1. Seed genre preferences from selected genres
    for (const genreId of body.selectedGenres) {
      await request.db
        .insert(userPreferences)
        .values({
          userId: request.userId,
          entityType: 'genre',
          entityId: genreId,
          rawScore: '1.0',
          interactionCount: 1,
          lastUpdated: new Date(),
        })
        .onConflictDoUpdate({
          target: [userPreferences.userId, userPreferences.entityType, userPreferences.entityId],
          set: {
            rawScore: sql`${userPreferences.rawScore} + 1.0`,
            interactionCount: sql`${userPreferences.interactionCount} + 1`,
            lastUpdated: new Date(),
          },
        });
    }

    // 2. Process each movie rating as a swipe
    for (const rating of body.movieRatings) {
      // Get content type
      const contentRow = await request.db
        .select({ contentType: content.contentType })
        .from(content)
        .where(eq(content.id, rating.contentId))
        .limit(1);

      if (contentRow.length === 0) continue;

      // Record swipe
      await request.db
        .insert(userSwipes)
        .values({
          userId: request.userId,
          contentId: rating.contentId,
          action: rating.action,
          contentType: contentRow[0].contentType,
        })
        .onConflictDoNothing();

      // Update preferences
      await updatePreferencesForSwipe(
        request.db,
        request.userId,
        rating.contentId,
        rating.action,
      );
    }

    // 3. Set onboarding completed
    await request.db
      .update(users)
      .set({ onboardingCompleted: true })
      .where(eq(users.id, request.userId));

    // Get updated maturity score
    const userRow = await request.db
      .select({ maturityScore: users.maturityScore })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    return {
      success: true,
      maturityScore: userRow[0]?.maturityScore || 0,
      message: 'Your feed is ready!',
    };
  });
}
