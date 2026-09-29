import { eq, and, ne, sql, notInArray, inArray, desc, asc, isNull, or, gte, lte } from 'drizzle-orm';
import { Database } from '../db/index.js';
import {
  users,
  content,
  userSwipes,
  userBookmarks,
  contentGenres,
  contentPeople,
  contentKeywords,
  contentCollections,
  awards,
  contentProviders,
  genres,
  people,
  streamingProviders,
} from '../db/schema.js';
import { generateSingleReason } from './reasons.js';
import { getCatalogue, getTasteProfile, matchFilm, maturity, type Film } from './taste.js';
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
  tasteScore: number;
  novelty: number;
  qualityRank: number;
  isDiscovery?: boolean;
}

/** Перцентиль кожного елемента за значенням: 0 — найгірший, 1 — найкращий */
function percentileRanks<T extends { id: number }>(items: T[], value: (item: T) => number): Map<number, number> {
  const sorted = [...items].sort((a, b) => value(a) - value(b));
  const n = Math.max(sorted.length - 1, 1);
  return new Map(sorted.map((item, i) => [item.id, i / n]));
}

/** Детермінований псевдовипадковий шум 0..1 для пари (користувач, день, фільм) */
function hashNoise(userId: number, day: number, contentId: number): number {
  let h = (userId * 73856093) ^ (day * 19349663) ^ (contentId * 83492791);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

export async function generateFeed(
  db: Database,
  userId: number,
  filters: FeedFilters,
  locale: string,
): Promise<{ cards: FeedCard[]; remaining: number; maturityScore: number; offset: number }> {
  const limit = Math.min(filters.limit || 20, 50);
  const contentType = filters.contentType || 'movie';

  // Get content IDs to exclude from feed:
  // - Permanently exclude: anything with an opinion, and anything watched
  //   (a title can be marked watched while still sitting on an old skip)
  // - Exclude skips for 30 days (they reappear after cooldown)
  const permanentSwipes = await db
    .select({ contentId: userSwipes.contentId })
    .from(userSwipes)
    .where(and(
      eq(userSwipes.userId, userId),
      or(ne(userSwipes.action, 'skip'), eq(userSwipes.isWatched, true)),
    ));

  const recentSkips = await db
    .select({ contentId: userSwipes.contentId })
    .from(userSwipes)
    .where(and(
      eq(userSwipes.userId, userId),
      eq(userSwipes.action, 'skip'),
      eq(userSwipes.isWatched, false),
      sql`${userSwipes.createdAt} >= NOW() - INTERVAL '30 days'`,
    ));

  // Збережене «подивитись пізніше» вже знайдене — стрічці нема чого його пропонувати
  const bookmarked = await db
    .select({ contentId: userBookmarks.contentId })
    .from(userBookmarks)
    .where(eq(userBookmarks.userId, userId));

  const swipedIds = [
    ...permanentSwipes.map((r) => r.contentId),
    ...recentSkips.map((r) => r.contentId),
    ...bookmarked.map((r) => r.contentId),
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
  conditions.push(sql`COALESCE(${content.imdbRating}::numeric, ${content.tmdbRating}::numeric, 0) >= ${filters.ratingMin ?? DEFAULT_RATING_MIN}`);
  if (filters.ratingMax) {
    conditions.push(sql`COALESCE(${content.imdbRating}::numeric, ${content.tmdbRating}::numeric, 10) <= ${filters.ratingMax}`);
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
  let countryCondition: any;
  if (filters.countries && filters.countries.length > 0) {
    countryCondition = sql`${content.productionCountries} && ARRAY[${sql.join(filters.countries.map(c => sql`${c}`), sql`, `)}]::text[]`;
  } else {
    countryCondition = sql`NOT (${content.productionCountries} && ARRAY[${sql.join(DEFAULT_EXCLUDED_COUNTRIES.map(c => sql`${c}`), sql`, `)}]::text[])`;
  }
  conditions.push(countryCondition);

  // Спершу всі фільми, що проходять фільтри, — ранжуємо весь каталог, а не
  // топ за якістю: інакше смак лише переставляв би ту саму сотню фільмів
  const offset = filters.offset || 0;

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


  const eligible = await db
    .select({ id: content.id })
    .from(content)
    .where(and(...conditions));

  // Українські фільми — окремим пулом: за популярністю й касою вони майже ніколи
  // не вигравали б у загальному рейтингу, тож кожна 10-та картка — з цього пулу
  const uaConditions = conditions
    .filter((c) => c !== countryCondition)
    .concat(sql`${content.productionCountries} && ARRAY['UA']::text[]`);
  const uaEligible = await db
    .select({ id: content.id })
    .from(content)
    .where(and(...uaConditions));

  if (eligible.length === 0 && uaEligible.length === 0) {
    return { cards: [], remaining: 0, maturityScore: 0, offset: 0 };
  }

  const [films, profile] = await Promise.all([getCatalogue(db), getTasteProfile(db, userId)]);
  const maturityScore = profile.likes + profile.dislikes;
  // Поки оцінок мало, покладаємось на якість; з 30 оцінок смак важить 70%
  const tasteWeight = 0.7 * maturity(profile);

  const uaIds = new Set(uaEligible.map((r) => r.id));
  const candidates = [...new Set([...eligible.map((r) => r.id), ...uaIds])]
    .map((id) => films.get(id))
    .filter((f): f is Film => f !== undefined);

  // Смак і якість мають різні шкали, тож змішуємо їхні ранги (0..1) серед кандидатів
  const matches = new Map(candidates.map((f) => [f.id, matchFilm(profile, f)]));
  const tasteRank = percentileRanks(candidates, (f) => matches.get(f.id)!.score);
  const qualityRank = percentileRanks(candidates, (f) => f.quality);

  // Шум стабільний протягом дня: повторний запит сторінки дає той самий порядок,
  // а назавтра стрічка трохи перетасовується
  const day = Math.floor(Date.now() / 86_400_000);
  const scored: ScoredContent[] = candidates.map((f) => ({
    id: f.id,
    feedScore:
      tasteWeight * tasteRank.get(f.id)! +
      (1 - tasteWeight) * qualityRank.get(f.id)! +
      0.05 * hashNoise(userId, day, f.id),
    tasteScore: matches.get(f.id)!.score,
    novelty: matches.get(f.id)!.novelty,
    qualityRank: qualityRank.get(f.id)!,
  }));
  scored.sort((a, b) => b.feedScore - a.feedScore);

  // «Відкриття»: сильні фільми з того, чого профіль ще не знає, — але не те,
  // що суперечить смаку (інакше «нове» зводилось би до нелюбих жанрів)
  const eligibleIds = new Set(eligible.map((r) => r.id));
  const discoveryPool = scored
    .filter((s) => eligibleIds.has(s.id) && s.qualityRank >= 0.7 && s.tasteScore >= 0 && s.novelty >= 0.5)
    .sort((a, b) => b.novelty - a.novelty || b.qualityRank - a.qualityRank);
  let discoveryIdx = 0;

  const uaScoredPool = scored.filter((s) => uaIds.has(s.id));
  let uaPoolIdx = 0;

  const mainPool = scored.filter((s) => eligibleIds.has(s.id));

  const directorsOf = (id: number) =>
    (films.get(id)?.entities ?? []).filter((e) => e.type === 'director').map((e) => e.id as number);
  const collectionsOf = (id: number) =>
    (films.get(id)?.entities ?? []).filter((e) => e.type === 'collection').map((e) => e.id as number);

  // Різноманіття: не більше двох фільмів одного режисера чи серії поспіль
  const diverseResults: ScoredContent[] = [];
  const taken = new Set<number>();
  const recentDirectors: number[] = [];
  const recentCollections: number[] = [];
  let candidateIdx = 0;

  const take = (s: ScoredContent) => {
    diverseResults.push(s);
    taken.add(s.id);
  };

  for (let pos = 0; diverseResults.length < limit && pos < limit * 3; pos++) {
    if (pos % 10 === 9) {
      while (uaPoolIdx < uaScoredPool.length && taken.has(uaScoredPool[uaPoolIdx].id)) uaPoolIdx++;
      if (uaPoolIdx < uaScoredPool.length) {
        take(uaScoredPool[uaPoolIdx++]);
        continue;
      }
    }

    if (pos % 5 === 4 && profile.likes + profile.dislikes > 0) {
      while (discoveryIdx < discoveryPool.length && taken.has(discoveryPool[discoveryIdx].id)) discoveryIdx++;
      if (discoveryIdx < discoveryPool.length) {
        const d = discoveryPool[discoveryIdx++];
        d.isDiscovery = true;
        take(d);
        continue;
      }
    }

    let picked: ScoredContent | null = null;
    let fallback: ScoredContent | null = null;
    while (candidateIdx < mainPool.length) {
      const c = mainPool[candidateIdx++];
      if (taken.has(c.id)) continue;
      const conflict =
        directorsOf(c.id).some((d) => recentDirectors.filter((rd) => rd === d).length >= 2) ||
        collectionsOf(c.id).some((k) => recentCollections.filter((rc) => rc === k).length >= 2);
      if (!conflict) {
        picked = c;
        break;
      }
      fallback ??= c;
    }
    picked ??= fallback;
    if (!picked) break;
    take(picked);

    recentDirectors.push(...directorsOf(picked.id));
    while (recentDirectors.length > 2) recentDirectors.shift();
    recentCollections.push(...collectionsOf(picked.id));
    while (recentCollections.length > 2) recentCollections.shift();
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

  // Fetch user bookmarks for these cards
  const bookmarkRows = await db
    .select({ contentId: userBookmarks.contentId })
    .from(userBookmarks)
    .where(and(eq(userBookmarks.userId, userId), inArray(userBookmarks.contentId, finalIds)));
  const bookmarkedIds = new Set(bookmarkRows.map((r) => r.contentId));

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

    // Discovery cards get a special reason; personalized cards get the normal reason
    let reason: string | null;
    if (scoredItem.isDiscovery) {
      reason = locale === 'uk'
        ? 'Популярний фільм, який може вам сподобатись'
        : 'Popular pick you might enjoy';
    } else {
      reason = await generateSingleReason(db, userId, c.id, locale, profile);
    }

    cards.push({
      id: c.id,
      tmdbId: c.tmdbId,
      contentType: c.contentType,
      title: locale === 'uk' ? (c.titleUk || c.titleEn) : c.titleEn,
      titleEn: c.titleEn,
      originalTitle: c.originalTitle,
      posterPath: c.posterPath,
      backdropPath: c.backdropPath,
      releaseDate: c.releaseDate,
      runtime: c.runtime,
      certification: c.certification,
      productionCountries: c.productionCountries || [],
      imdbRating: c.imdbRating ? parseFloat(c.imdbRating) : c.tmdbRating ? parseFloat(c.tmdbRating) : null,
      overview: locale === 'uk' ? (c.overviewUk || c.overviewEn) : c.overviewEn,
      genres: cardGenreList,
      cast,
      directors,
      awards: cardAwardsList,
      providers: cardProvidersList,
      recommendationReason: reason,
      feedScore: feedScoreMap.get(c.id) || 0,
      isBookmarked: bookmarkedIds.has(c.id),
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
