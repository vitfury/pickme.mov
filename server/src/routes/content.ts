import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import {
  content,
  contentGenres,
  contentPeople,
  contentKeywords,
  contentCollections,
  contentProviders,
  awards,
  genres,
  people,
  keywords,
  collections,
  streamingProviders,
  userSwipes,
  userWatchlist,
  users,
} from '../db/schema.js';
import { generateReasons } from '../services/reasons.js';

export default async function contentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);

  // GET /content/:id
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const contentId = parseInt(request.params.id, 10);

    const user = await request.db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);
    const locale = user[0]?.locale || 'uk';

    // Fetch content
    const contentRow = await request.db
      .select()
      .from(content)
      .where(eq(content.id, contentId))
      .limit(1);

    if (contentRow.length === 0) {
      return reply.status(404).send({ error: 'Content not found' });
    }

    const c = contentRow[0];

    // Fetch all related data in parallel
    const [
      contentGenreRows,
      contentPeopleRows,
      contentKeywordRows,
      contentCollectionRows,
      contentProviderRows,
      contentAwardRows,
      swipeRow,
      watchlistRow,
    ] = await Promise.all([
      request.db
        .select({ genreId: genres.id, nameEn: genres.nameEn, nameUk: genres.nameUk, emoji: genres.emoji })
        .from(contentGenres)
        .innerJoin(genres, eq(contentGenres.genreId, genres.id))
        .where(eq(contentGenres.contentId, contentId)),
      request.db
        .select({
          personId: people.id,
          nameEn: people.nameEn,
          nameUk: people.nameUk,
          photoPath: people.photoPath,
          role: contentPeople.role,
          characterName: contentPeople.characterName,
          billingOrder: contentPeople.billingOrder,
        })
        .from(contentPeople)
        .innerJoin(people, eq(contentPeople.personId, people.id))
        .where(eq(contentPeople.contentId, contentId)),
      request.db
        .select({ nameEn: keywords.nameEn, nameUk: keywords.nameUk })
        .from(contentKeywords)
        .innerJoin(keywords, eq(contentKeywords.keywordId, keywords.id))
        .where(eq(contentKeywords.contentId, contentId)),
      request.db
        .select({ collectionId: collections.id, nameEn: collections.nameEn, nameUk: collections.nameUk })
        .from(contentCollections)
        .innerJoin(collections, eq(contentCollections.collectionId, collections.id))
        .where(eq(contentCollections.contentId, contentId)),
      request.db
        .select({
          providerId: streamingProviders.id,
          name: streamingProviders.name,
          logoPath: streamingProviders.logoPath,
          providerType: contentProviders.providerType,
        })
        .from(contentProviders)
        .innerJoin(streamingProviders, eq(contentProviders.providerId, streamingProviders.id))
        .where(eq(contentProviders.contentId, contentId)),
      request.db
        .select({ category: awards.category, ceremonyYear: awards.ceremonyYear, won: awards.won })
        .from(awards)
        .where(eq(awards.contentId, contentId)),
      request.db
        .select({ action: userSwipes.action })
        .from(userSwipes)
        .where(and(eq(userSwipes.userId, request.userId), eq(userSwipes.contentId, contentId)))
        .limit(1),
      request.db
        .select({ watched: userWatchlist.watched, personalRating: userWatchlist.personalRating })
        .from(userWatchlist)
        .where(and(eq(userWatchlist.userId, request.userId), eq(userWatchlist.contentId, contentId)))
        .limit(1),
    ]);

    // Generate recommendation reasons
    const reasons = await generateReasons(request.db, request.userId, contentId, locale);

    // Build cast, directors, writers
    const cast = contentPeopleRows
      .filter((p) => p.role === 'actor')
      .sort((a, b) => (a.billingOrder || 99) - (b.billingOrder || 99))
      .map((p) => ({
        id: p.personId,
        name: locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn,
        character: p.characterName,
        photoPath: p.photoPath,
        billingOrder: p.billingOrder,
      }));

    const directors = contentPeopleRows
      .filter((p) => p.role === 'director')
      .map((p) => ({
        id: p.personId,
        name: locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn,
        photoPath: p.photoPath,
      }));

    const writers = contentPeopleRows
      .filter((p) => p.role === 'writer')
      .map((p) => ({
        id: p.personId,
        name: locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn,
      }));

    return {
      id: c.id,
      tmdbId: c.tmdbId,
      contentType: c.contentType,
      title: locale === 'uk' ? (c.titleUk || c.titleEn) : c.titleEn,
      originalTitle: c.originalTitle,
      overview: locale === 'uk' ? (c.overviewUk || c.overviewEn) : c.overviewEn,
      posterPath: c.posterPath,
      backdropPath: c.backdropPath,
      releaseDate: c.releaseDate,
      runtime: c.runtime,
      certification: c.certification,
      tmdbRating: c.tmdbRating ? parseFloat(c.tmdbRating) : null,
      imdbRating: c.imdbRating ? parseFloat(c.imdbRating) : null,
      imdbId: c.imdbId,
      genres: contentGenreRows.map((g) => ({
        id: g.genreId,
        name: locale === 'uk' ? (g.nameUk || g.nameEn) : g.nameEn,
        emoji: g.emoji,
      })),
      cast,
      directors,
      writers,
      awards: contentAwardRows.map((a) => ({
        category: a.category,
        year: a.ceremonyYear,
        won: a.won,
      })),
      providers: contentProviderRows.map((p) => ({
        id: p.providerId,
        name: p.name,
        logoPath: p.logoPath,
        type: p.providerType,
      })),
      keywords: contentKeywordRows.map((k) => locale === 'uk' ? (k.nameUk || k.nameEn) : k.nameEn),
      collections: contentCollectionRows.map((col) => ({
        id: col.collectionId,
        name: locale === 'uk' ? (col.nameUk || col.nameEn) : col.nameEn,
      })),
      recommendationReasons: reasons,
      userStatus: {
        swiped: swipeRow[0]?.action || null,
        inWatchlist: watchlistRow.length > 0,
        watched: watchlistRow[0]?.watched || false,
        personalRating: watchlistRow[0]?.personalRating || null,
      },
    };
  });
}
