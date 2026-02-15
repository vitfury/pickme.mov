import { eq, and, ne, sql, notInArray, inArray, desc, asc, isNull, or, gte, lte } from 'drizzle-orm';
import { Database } from '../db/index.js';
import {
  users,
  content,
  userSwipes,
  userPreferences,
  contentGenres,
  contentPeople,
  contentKeywords,
  contentCollections,
  entityTypeWeights,
  entityIdfCache,
  awards,
  contentProviders,
  genres,
  people,
  streamingProviders,
} from '../db/schema.js';
import { generateSingleReason } from './reasons.js';
import type { FeedCard } from '../types/index.js';

interface FeedFilters {
  contentType?: string;
  limit?: number;
  offset?: number;
  genres?: number[];
  yearMin?: number;
  yearMax?: number;
  ratingMin?: number;
  ratingMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  certification?: string[];
  providers?: number[];
  countries?: string[];
  personId?: number;
  collectionId?: number;
  awards?: string;
}

interface ScoredContent {
  id: number;
  feedScore: number;
  personalizationScore: number;
  explorationBonus: number;
}

export async function generateFeed(
  db: Database,
  userId: number,
  filters: FeedFilters,
  locale: string,
): Promise<{ cards: FeedCard[]; remaining: number; maturityScore: number; offset: number }> {
  const limit = Math.min(filters.limit || 20, 50);
  const contentType = filters.contentType || 'movie';

  // Get user maturity
  const userRow = await db
    .select({ maturityScore: users.maturityScore })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const maturityScore = userRow[0]?.maturityScore || 0;
  const maturity = Math.min(maturityScore / 50, 1.0);
  const qualityWeight = 0.30 + 0.20 * (1 - maturity);
  const personalizationWeight = 0.50 * maturity;

  // Get content IDs to exclude from feed:
  // - Permanently exclude: like, dislike
  // - Exclude today's skips (they naturally reappear on future days)
  const permanentSwipes = await db
    .select({ contentId: userSwipes.contentId })
    .from(userSwipes)
    .where(and(eq(userSwipes.userId, userId), ne(userSwipes.action, 'skip')));

  const todaySkips = await db
    .select({ contentId: userSwipes.contentId })
    .from(userSwipes)
    .where(and(
      eq(userSwipes.userId, userId),
      eq(userSwipes.action, 'skip'),
      sql`${userSwipes.createdAt}::date = CURRENT_DATE`,
    ));

  const swipedIds = [
    ...permanentSwipes.map((r) => r.contentId),
    ...todaySkips.map((r) => r.contentId),
  ];

  // Build base query conditions for unseen content
  const conditions: any[] = [
    eq(content.contentType, contentType as any),
  ];
  if (swipedIds.length > 0) {
    conditions.push(notInArray(content.id, swipedIds));
  }

  // Apply filters with defaults (content-type aware)
  const isAnimation = contentType === 'animation';
  const DEFAULT_EXCLUDED_COUNTRIES = isAnimation ? ['RU', 'IN', 'JP'] : ['RU', 'IN'];
  const DEFAULT_YEAR_MIN = 1990;
  const DEFAULT_RATING_MIN = 6.5;
  const isSeries = contentType === 'series';
  const DEFAULT_RUNTIME_MIN = isSeries ? undefined : isAnimation ? 60 : 80;
  const DEFAULT_RUNTIME_MAX = isSeries ? undefined : isAnimation ? 180 : 240;

  conditions.push(sql`EXTRACT(YEAR FROM ${content.releaseDate}) >= ${filters.yearMin ?? DEFAULT_YEAR_MIN}`);
  if (filters.yearMax) {
    conditions.push(sql`EXTRACT(YEAR FROM ${content.releaseDate}) <= ${filters.yearMax}`);
  }
  conditions.push(sql`GREATEST(${content.tmdbRating}::numeric, ${content.imdbRating}::numeric) >= ${filters.ratingMin ?? DEFAULT_RATING_MIN}`);
  if (filters.ratingMax) {
    conditions.push(sql`LEAST(${content.tmdbRating}::numeric, ${content.imdbRating}::numeric) <= ${filters.ratingMax}`);
  }
  const runtimeMin = filters.runtimeMin ?? DEFAULT_RUNTIME_MIN;
  const runtimeMax = filters.runtimeMax ?? DEFAULT_RUNTIME_MAX;
  if (runtimeMin) {
    conditions.push(sql`${content.runtime} >= ${runtimeMin}`);
  }
  if (runtimeMax) {
    conditions.push(sql`${content.runtime} <= ${runtimeMax}`);
  }
  if (filters.certification && filters.certification.length > 0) {
    conditions.push(inArray(content.certification, filters.certification));
  }
  if (filters.countries && filters.countries.length > 0) {
    conditions.push(sql`${content.productionCountries} && ARRAY[${sql.join(filters.countries.map(c => sql`${c}`), sql`, `)}]::text[]`);
  } else {
    conditions.push(sql`NOT (${content.productionCountries} && ARRAY[${sql.join(DEFAULT_EXCLUDED_COUNTRIES.map(c => sql`${c}`), sql`, `)}]::text[])`);
  }

  // Fetch unseen content with base quality scores (fetch more than needed for diversity)
  const offset = filters.offset || 0;
  const fetchLimit = (limit + offset) * 5;

  let unseenQuery = db
    .select({
      id: content.id,
      baseQualityScore: content.baseQualityScore,
      releaseDate: content.releaseDate,
    })
    .from(content)
    .where(and(...conditions))
    .orderBy(desc(content.baseQualityScore))
    .limit(fetchLimit);

  // Sub-filter by genre IDs
  if (filters.genres && filters.genres.length > 0) {
    const genreContentIds = await db
      .select({ contentId: contentGenres.contentId })
      .from(contentGenres)
      .where(inArray(contentGenres.genreId, filters.genres));
    const ids = genreContentIds.map((r) => r.contentId);
    if (ids.length > 0) {
      conditions.push(inArray(content.id, ids));
    }
  }

  // Sub-filter by provider IDs
  if (filters.providers && filters.providers.length > 0) {
    const providerContentIds = await db
      .select({ contentId: contentProviders.contentId })
      .from(contentProviders)
      .where(inArray(contentProviders.providerId, filters.providers));
    const ids = providerContentIds.map((r) => r.contentId);
    if (ids.length > 0) {
      conditions.push(inArray(content.id, ids));
    }
  }

  // Sub-filter by person ID
  if (filters.personId) {
    const personContentIds = await db
      .select({ contentId: contentPeople.contentId })
      .from(contentPeople)
      .where(eq(contentPeople.personId, filters.personId));
    const ids = personContentIds.map((r) => r.contentId);
    if (ids.length > 0) {
      conditions.push(inArray(content.id, ids));
    }
  }

  // Sub-filter by collection ID
  if (filters.collectionId) {
    const collectionContentIds = await db
      .select({ contentId: contentCollections.contentId })
      .from(contentCollections)
      .where(eq(contentCollections.collectionId, filters.collectionId));
    const ids = collectionContentIds.map((r) => r.contentId);
    if (ids.length > 0) {
      conditions.push(inArray(content.id, ids));
    }
  }

  // Sub-filter by awards
  if (filters.awards) {
    let awardContentIds: { contentId: number }[];
    if (filters.awards === 'winner') {
      awardContentIds = await db.select({ contentId: awards.contentId }).from(awards).where(eq(awards.won, true));
    } else {
      awardContentIds = await db.select({ contentId: awards.contentId }).from(awards);
    }
    const ids = [...new Set(awardContentIds.map((r) => r.contentId))];
    if (ids.length > 0) {
      conditions.push(inArray(content.id, ids));
    }
  }

  // Re-run with all conditions
  const unseenContent = await db
    .select({
      id: content.id,
      baseQualityScore: content.baseQualityScore,
      releaseDate: content.releaseDate,
    })
    .from(content)
    .where(and(...conditions))
    .orderBy(desc(content.baseQualityScore))
    .limit(fetchLimit);

  if (unseenContent.length === 0) {
    return { cards: [], remaining: 0, maturityScore, offset: 0 };
  }

  // Get user preferences
  const prefs = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  const prefMap = new Map(prefs.map((p) => [`${p.entityType}:${p.entityId}`, p]));

  // Get entity type weights
  const typeWeightsRows = await db.select().from(entityTypeWeights);
  const typeWeightMap = new Map(typeWeightsRows.map((tw) => [tw.entityType, parseFloat(tw.weight)]));

  // Get IDF cache
  const idfRows = await db.select().from(entityIdfCache);
  const idfMap = new Map(idfRows.map((r) => [`${r.entityType}:${r.entityId}`, parseFloat(r.idfWeight)]));

  // Get user's top 3 genres for exploration
  const topGenrePrefs = prefs
    .filter((p) => p.entityType === 'genre')
    .sort((a, b) => parseFloat(b.rawScore || '0') - parseFloat(a.rawScore || '0'))
    .slice(0, 3)
    .map((p) => p.entityId);

  // Score each piece of unseen content
  const contentIds = unseenContent.map((c) => c.id);

  // Batch fetch all entity links for scoring
  const [genreLinks, peopleLinks, keywordLinks, collectionLinks] = await Promise.all([
    contentIds.length > 0
      ? db.select().from(contentGenres).where(inArray(contentGenres.contentId, contentIds))
      : [],
    contentIds.length > 0
      ? db.select().from(contentPeople).where(inArray(contentPeople.contentId, contentIds))
      : [],
    contentIds.length > 0
      ? db.select().from(contentKeywords).where(inArray(contentKeywords.contentId, contentIds))
      : [],
    contentIds.length > 0
      ? db.select().from(contentCollections).where(inArray(contentCollections.contentId, contentIds))
      : [],
  ]);

  // Index entity links by contentId
  const genreByContent = new Map<number, typeof genreLinks>();
  for (const gl of genreLinks) {
    const arr = genreByContent.get(gl.contentId) || [];
    arr.push(gl);
    genreByContent.set(gl.contentId, arr);
  }

  const peopleByContent = new Map<number, typeof peopleLinks>();
  for (const pl of peopleLinks) {
    const arr = peopleByContent.get(pl.contentId) || [];
    arr.push(pl);
    peopleByContent.set(pl.contentId, arr);
  }

  const keywordsByContent = new Map<number, typeof keywordLinks>();
  for (const kl of keywordLinks) {
    const arr = keywordsByContent.get(kl.contentId) || [];
    arr.push(kl);
    keywordsByContent.set(kl.contentId, arr);
  }

  const collectionsByContent = new Map<number, typeof collectionLinks>();
  for (const cl of collectionLinks) {
    const arr = collectionsByContent.get(cl.contentId) || [];
    arr.push(cl);
    collectionsByContent.set(cl.contentId, arr);
  }

  const now = Date.now();
  const scored: ScoredContent[] = [];

  for (const item of unseenContent) {
    let totalSignal = 0;
    let matchingEntities = 0;
    let explorationBonus = 0;

    // Genre signals
    const itemGenres = genreByContent.get(item.id) || [];
    for (const g of itemGenres) {
      const pref = prefMap.get(`genre:${g.genreId}`);
      if (pref) {
        const rawScore = parseFloat(pref.rawScore || '0');
        const tw = typeWeightMap.get('genre') || 1.0;
        const idf = idfMap.get(`genre:${g.genreId}`) || 1.0;
        const daysSinceUpdate = (now - new Date(pref.lastUpdated!).getTime()) / (1000 * 60 * 60 * 24);
        const timeDecay = Math.exp(-0.01 * daysSinceUpdate);
        totalSignal += rawScore * tw * idf * timeDecay;
        matchingEntities++;
      } else {
        // Underexplored genre bonus
        if (!topGenrePrefs.includes(g.genreId)) {
          explorationBonus = Math.max(explorationBonus, 0.30);
        }
      }
    }

    // People signals (directors and actors)
    const itemPeople = peopleByContent.get(item.id) || [];
    for (const p of itemPeople) {
      const entityType = p.role === 'director' ? 'director' : p.role === 'actor' ? 'actor' : null;
      if (!entityType) continue;
      const pref = prefMap.get(`${entityType}:${p.personId}`);
      if (pref) {
        const rawScore = parseFloat(pref.rawScore || '0');
        const tw = typeWeightMap.get(entityType) || 1.0;
        const idf = idfMap.get(`${entityType}:${p.personId}`) || 1.0;
        const daysSinceUpdate = (now - new Date(pref.lastUpdated!).getTime()) / (1000 * 60 * 60 * 24);
        const timeDecay = Math.exp(-0.01 * daysSinceUpdate);
        const billingFactor = (entityType === 'actor' && p.billingOrder && p.billingOrder > 3) ? 0.5 : 1.0;
        totalSignal += rawScore * tw * idf * timeDecay * billingFactor;
        matchingEntities++;
      }
    }

    // Keyword signals
    const itemKeywords = keywordsByContent.get(item.id) || [];
    for (const k of itemKeywords) {
      const pref = prefMap.get(`keyword:${k.keywordId}`);
      if (pref) {
        const rawScore = parseFloat(pref.rawScore || '0');
        const tw = typeWeightMap.get('keyword') || 0.6;
        const idf = idfMap.get(`keyword:${k.keywordId}`) || 1.0;
        const daysSinceUpdate = (now - new Date(pref.lastUpdated!).getTime()) / (1000 * 60 * 60 * 24);
        const timeDecay = Math.exp(-0.01 * daysSinceUpdate);
        totalSignal += rawScore * tw * idf * timeDecay;
        matchingEntities++;
      }
    }

    // Decade signal
    if (item.releaseDate) {
      const year = new Date(item.releaseDate).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      const pref = prefMap.get(`decade:${decade}`);
      if (pref) {
        const rawScore = parseFloat(pref.rawScore || '0');
        const tw = typeWeightMap.get('decade') || 0.3;
        const idf = idfMap.get(`decade:${decade}`) || 1.0;
        const daysSinceUpdate = (now - new Date(pref.lastUpdated!).getTime()) / (1000 * 60 * 60 * 24);
        const timeDecay = Math.exp(-0.01 * daysSinceUpdate);
        totalSignal += rawScore * tw * idf * timeDecay;
        matchingEntities++;
      }
    }

    // Collection signals
    const itemCollections = collectionsByContent.get(item.id) || [];
    for (const c of itemCollections) {
      const pref = prefMap.get(`collection:${c.collectionId}`);
      if (pref) {
        const rawScore = parseFloat(pref.rawScore || '0');
        const tw = typeWeightMap.get('collection') || 0.5;
        const idf = idfMap.get(`collection:${c.collectionId}`) || 1.0;
        const daysSinceUpdate = (now - new Date(pref.lastUpdated!).getTime()) / (1000 * 60 * 60 * 24);
        const timeDecay = Math.exp(-0.01 * daysSinceUpdate);
        totalSignal += rawScore * tw * idf * timeDecay;
        matchingEntities++;
      }
    }

    const personalizationScore = totalSignal / Math.max(1, matchingEntities);
    const baseQuality = parseFloat(item.baseQualityScore || '0');
    const randomFactor = Math.random() * 0.20 * 0.10;

    const feedScore =
      baseQuality * qualityWeight +
      personalizationScore * personalizationWeight +
      explorationBonus * 0.10 +
      randomFactor;

    scored.push({ id: item.id, feedScore, personalizationScore, explorationBonus });
  }

  // Sort by feed score descending
  scored.sort((a, b) => b.feedScore - a.feedScore);

  // Apply session diversity (no 3+ same director/franchise in a row)
  const diverseResults: ScoredContent[] = [];
  const recentDirectors: number[] = [];
  const recentCollections: number[] = [];
  let candidateIdx = 0;

  for (let pos = 0; pos < limit && candidateIdx < scored.length; pos++) {
    // Every 8th card should be an exploration card
    if (pos > 0 && pos % 8 === 7) {
      const explorationCard = scored.find(
        (s) =>
          !diverseResults.includes(s) &&
          s.explorationBonus > 0,
      );
      if (explorationCard) {
        diverseResults.push(explorationCard);
        continue;
      }
    }

    // Take next candidate, checking diversity
    let found = false;
    while (candidateIdx < scored.length) {
      const candidate = scored[candidateIdx];
      candidateIdx++;

      if (diverseResults.includes(candidate)) continue;

      // Check director diversity
      const candidateDirectors = (peopleByContent.get(candidate.id) || [])
        .filter((p) => p.role === 'director')
        .map((p) => p.personId);

      const directorConflict = candidateDirectors.some(
        (d) => recentDirectors.filter((rd) => rd === d).length >= 2,
      );

      // Check collection diversity
      const candidateColls = (collectionsByContent.get(candidate.id) || [])
        .map((c) => c.collectionId);

      const collectionConflict = candidateColls.some(
        (c) => recentCollections.filter((rc) => rc === c).length >= 2,
      );

      if (directorConflict || collectionConflict) continue;

      diverseResults.push(candidate);

      // Update recents (keep last 2)
      for (const d of candidateDirectors) recentDirectors.push(d);
      if (recentDirectors.length > 2) recentDirectors.shift();
      for (const c of candidateColls) recentCollections.push(c);
      if (recentCollections.length > 2) recentCollections.shift();

      found = true;
      break;
    }

    if (!found && candidateIdx < scored.length) {
      // Fallback: just take the next available
      const fallback = scored.find((s) => !diverseResults.includes(s));
      if (fallback) diverseResults.push(fallback);
    }
  }

  // Hydrate the cards with full data
  const finalIds = diverseResults.map((r) => r.id);
  if (finalIds.length === 0) {
    return { cards: [], remaining: 0, maturityScore, offset: 0 };
  }

  const feedScoreMap = new Map(diverseResults.map((r) => [r.id, r.feedScore]));

  // Fetch full content data
  const contentRows = await db
    .select()
    .from(content)
    .where(inArray(content.id, finalIds));

  // Fetch related data
  const [cardGenres, cardPeople, cardAwards, cardProviders] = await Promise.all([
    db
      .select({ contentId: contentGenres.contentId, genreId: genres.id, nameEn: genres.nameEn, nameUk: genres.nameUk, emoji: genres.emoji })
      .from(contentGenres)
      .innerJoin(genres, eq(contentGenres.genreId, genres.id))
      .where(inArray(contentGenres.contentId, finalIds)),
    db
      .select({
        contentId: contentPeople.contentId,
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
      .where(inArray(contentPeople.contentId, finalIds)),
    db
      .select({ contentId: awards.contentId, category: awards.category, ceremonyYear: awards.ceremonyYear, won: awards.won })
      .from(awards)
      .where(inArray(awards.contentId, finalIds)),
    db
      .select({
        contentId: contentProviders.contentId,
        providerId: streamingProviders.id,
        name: streamingProviders.name,
        logoPath: streamingProviders.logoPath,
        providerType: contentProviders.providerType,
      })
      .from(contentProviders)
      .innerJoin(streamingProviders, eq(contentProviders.providerId, streamingProviders.id))
      .where(inArray(contentProviders.contentId, finalIds)),
  ]);

  // Index related data by content ID
  const genresByCard = groupBy(cardGenres, 'contentId');
  const peopleByCard = groupBy(cardPeople, 'contentId');
  const awardsByCard = groupBy(cardAwards, 'contentId');
  const providersByCard = groupBy(cardProviders, 'contentId');

  // Build cards in the order of diverseResults
  const cards: FeedCard[] = [];
  for (const scoredItem of diverseResults) {
    const c = contentRows.find((r) => r.id === scoredItem.id);
    if (!c) continue;

    const cardGenreList = (genresByCard.get(c.id) || []).map((g: any) => ({
      id: g.genreId,
      name: locale === 'uk' ? (g.nameUk || g.nameEn) : g.nameEn,
      emoji: g.emoji,
    }));

    const cardPeopleList = peopleByCard.get(c.id) || [];
    const cast = cardPeopleList
      .filter((p: any) => p.role === 'actor')
      .sort((a: any, b: any) => (a.billingOrder || 99) - (b.billingOrder || 99))
      .slice(0, 10)
      .map((p: any) => ({
        id: p.personId,
        name: locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn,
        character: p.characterName,
        photoPath: p.photoPath,
        billingOrder: p.billingOrder,
      }));

    const directors = cardPeopleList
      .filter((p: any) => p.role === 'director')
      .map((p: any) => ({
        id: p.personId,
        name: locale === 'uk' ? (p.nameUk || p.nameEn) : p.nameEn,
        photoPath: p.photoPath,
      }));

    const cardAwardsList = (awardsByCard.get(c.id) || []).map((a: any) => ({
      category: a.category,
      year: a.ceremonyYear,
      won: a.won,
    }));

    const cardProvidersList = (providersByCard.get(c.id) || []).map((p: any) => ({
      id: p.providerId,
      name: p.name,
      logoPath: p.logoPath,
      type: p.providerType,
    }));

    const reason = await generateSingleReason(db, userId, c.id, locale);

    cards.push({
      id: c.id,
      tmdbId: c.tmdbId,
      contentType: c.contentType,
      title: locale === 'uk' ? (c.titleUk || c.titleEn) : c.titleEn,
      originalTitle: c.originalTitle,
      posterPath: c.posterPath,
      backdropPath: c.backdropPath,
      releaseDate: c.releaseDate,
      runtime: c.runtime,
      certification: c.certification,
      productionCountries: c.productionCountries || [],
      tmdbRating: c.tmdbRating ? parseFloat(c.tmdbRating) : null,
      imdbRating: c.imdbRating ? parseFloat(c.imdbRating) : null,
      overview: locale === 'uk' ? (c.overviewUk || c.overviewEn) : c.overviewEn,
      genres: cardGenreList,
      cast,
      directors,
      awards: cardAwardsList,
      providers: cardProvidersList,
      recommendationReason: reason,
      feedScore: feedScoreMap.get(c.id) || 0,
    });
  }

  // Count remaining unseen content (using same exclusion logic)
  const totalUnseen = await db
    .select({ count: sql<number>`count(*)` })
    .from(content)
    .where(and(
      eq(content.contentType, contentType as any),
      swipedIds.length > 0 ? notInArray(content.id, swipedIds) : sql`true`,
    ));

  const remaining = Number(totalUnseen[0]?.count || 0) - cards.length;

  return { cards, remaining: Math.max(0, remaining), maturityScore, offset: offset + cards.length };
}

function groupBy<T extends Record<string, any>>(arr: T[], key: string): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of arr) {
    const k = item[key];
    const existing = map.get(k) || [];
    existing.push(item);
    map.set(k, existing);
  }
  return map;
}
