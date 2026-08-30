import { and, eq, sql, inArray, desc, SQL } from 'drizzle-orm';
import {
  content,
  genres,
  contentGenres,
  keywords,
  contentKeywords,
  people,
  contentPeople,
  streamingProviders,
  contentProviders,
  awards,
  userSwipes,
  userPreferences,
} from '../db/schema.js';
import type { Database } from '../db/index.js';

export type SeenFilter = 'exclude_watched' | 'only_watched' | 'exclude_any_swipe' | 'all';

export interface SearchParams {
  query?: string;
  contentType?: 'movie' | 'series' | 'animation';
  genres?: string[];
  excludeGenres?: string[];
  keywords?: string[];
  people?: string[];
  providers?: string[];
  countries?: string[];
  excludeCountries?: string[];
  originalLanguage?: string;
  certification?: string[];
  yearFrom?: number;
  yearTo?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  minRating?: number;
  minVotes?: number;
  awarded?: 'winner' | 'nominated';
  seen?: SeenFilter;
  sort?: 'quality' | 'rating' | 'popularity' | 'year_desc' | 'year_asc' | 'random';
  limit?: number;
  includeOverview?: boolean;
}

// drizzle expands a JS array in a template into separate placeholders, so an
// array parameter has to be written out explicitly rather than passed whole.
function inList(values: string[]): SQL {
  return sql.join(values.map((v) => sql`${v}`), sql`, `);
}

function textArray(values: string[]): SQL {
  return sql`ARRAY[${inList(values)}]::text[]`;
}

// A model reasons over names, not surrogate ids, so every taxonomy filter below
// matches on the English or Ukrainian name.
function nameMatches(column: SQL | any, ukColumn: SQL | any, values: string[]): SQL {
  const lowered = inList(values.map((v) => v.trim().toLowerCase()));
  return sql`(lower(${column}) IN (${lowered}) OR lower(coalesce(${ukColumn}, '')) IN (${lowered}))`;
}

function buildConditions(userId: number, p: SearchParams): SQL[] {
  const conditions: SQL[] = [];

  conditions.push(sql`${content.contentType} = ${p.contentType || 'movie'}`);

  if (p.query) {
    const like = `%${p.query}%`;
    conditions.push(sql`(
      ${content.titleEn} ILIKE ${like}
      OR ${content.titleUk} ILIKE ${like}
      OR ${content.originalTitle} ILIKE ${like}
    )`);
  }

  if (p.genres?.length) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${contentGenres} cg JOIN ${genres} g ON g.id = cg.genre_id
      WHERE cg.content_id = ${content.id} AND ${nameMatches(sql`g.name_en`, sql`g.name_uk`, p.genres)}
    )`);
  }

  if (p.excludeGenres?.length) {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM ${contentGenres} cg JOIN ${genres} g ON g.id = cg.genre_id
      WHERE cg.content_id = ${content.id} AND ${nameMatches(sql`g.name_en`, sql`g.name_uk`, p.excludeGenres)}
    )`);
  }

  if (p.keywords?.length) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${contentKeywords} ck JOIN ${keywords} k ON k.id = ck.keyword_id
      WHERE ck.content_id = ${content.id} AND ${nameMatches(sql`k.name_en`, sql`k.name_uk`, p.keywords)}
    )`);
  }

  if (p.people?.length) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${contentPeople} cp JOIN ${people} pe ON pe.id = cp.person_id
      WHERE cp.content_id = ${content.id} AND ${nameMatches(sql`pe.name_en`, sql`pe.name_uk`, p.people)}
    )`);
  }

  if (p.providers?.length) {
    const lowered = inList(p.providers.map((v) => v.trim().toLowerCase()));
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${contentProviders} cpr JOIN ${streamingProviders} sp ON sp.id = cpr.provider_id
      WHERE cpr.content_id = ${content.id} AND lower(sp.name) IN (${lowered})
    )`);
  }

  if (p.awarded) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${awards} a WHERE a.content_id = ${content.id}
      ${p.awarded === 'winner' ? sql`AND a.won = true` : sql``}
    )`);
  }

  if (p.countries?.length) {
    conditions.push(sql`${content.productionCountries} && ${textArray(p.countries)}`);
  }
  if (p.excludeCountries?.length) {
    conditions.push(sql`(${content.productionCountries} IS NULL OR NOT (${content.productionCountries} && ${textArray(p.excludeCountries)}))`);
  }
  if (p.originalLanguage) {
    conditions.push(sql`${content.originalLanguage} = ${p.originalLanguage}`);
  }
  if (p.certification?.length) {
    conditions.push(sql`${content.certification} IN (${inList(p.certification)})`);
  }
  if (p.yearFrom !== undefined) {
    conditions.push(sql`EXTRACT(YEAR FROM ${content.releaseDate}) >= ${p.yearFrom}`);
  }
  if (p.yearTo !== undefined) {
    conditions.push(sql`EXTRACT(YEAR FROM ${content.releaseDate}) <= ${p.yearTo}`);
  }
  if (p.runtimeMin !== undefined) {
    conditions.push(sql`${content.runtime} >= ${p.runtimeMin}`);
  }
  if (p.runtimeMax !== undefined) {
    conditions.push(sql`${content.runtime} <= ${p.runtimeMax}`);
  }
  if (p.minRating !== undefined) {
    conditions.push(sql`COALESCE(${content.imdbRating}, ${content.tmdbRating}) >= ${p.minRating}`);
  }
  if (p.minVotes !== undefined) {
    conditions.push(sql`${content.tmdbVoteCount} >= ${p.minVotes}`);
  }

  const seen: SeenFilter = p.seen || 'exclude_watched';
  if (seen === 'exclude_watched') {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM ${userSwipes} s
      WHERE s.content_id = ${content.id} AND s.user_id = ${userId} AND s.is_watched = true
    )`);
  } else if (seen === 'only_watched') {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${userSwipes} s
      WHERE s.content_id = ${content.id} AND s.user_id = ${userId} AND s.is_watched = true
    )`);
  } else if (seen === 'exclude_any_swipe') {
    conditions.push(sql`NOT EXISTS (
      SELECT 1 FROM ${userSwipes} s
      WHERE s.content_id = ${content.id} AND s.user_id = ${userId}
    )`);
  }

  return conditions;
}

function orderClause(sort: SearchParams['sort']): SQL {
  switch (sort) {
    case 'rating':
      return sql`COALESCE(${content.imdbRating}, ${content.tmdbRating}) DESC NULLS LAST`;
    case 'popularity':
      return sql`${content.popularity} DESC NULLS LAST`;
    case 'year_desc':
      return sql`${content.releaseDate} DESC NULLS LAST`;
    case 'year_asc':
      return sql`${content.releaseDate} ASC NULLS LAST`;
    case 'random':
      return sql`RANDOM()`;
    default:
      return sql`${content.baseQualityScore} DESC NULLS LAST`;
  }
}

export interface SearchResultItem {
  id: number;
  title: string;
  titleUk?: string;
  originalTitle?: string;
  year: number | null;
  runtime: number | null;
  rating: number | null;
  votes: number;
  certification?: string;
  countries?: string[];
  genres: string[];
  keywords: string[];
  overview?: string;
}

export async function searchTitles(db: Database, userId: number, p: SearchParams) {
  const limit = Math.min(Math.max(p.limit ?? 100, 1), 200);
  const conditions = buildConditions(userId, p);
  const where = sql.join(conditions, sql` AND `);

  const matchedRows = await db.execute(
    sql`SELECT count(*)::int AS count FROM ${content} WHERE ${where}`,
  );
  const matched = Number((matchedRows.rows[0] as any)?.count || 0);

  const rows = await db.execute(sql`
    SELECT
      ${content.id} AS id,
      ${content.titleEn} AS title_en,
      ${content.titleUk} AS title_uk,
      ${content.originalTitle} AS original_title,
      EXTRACT(YEAR FROM ${content.releaseDate})::int AS year,
      ${content.runtime} AS runtime,
      COALESCE(${content.imdbRating}, ${content.tmdbRating})::float AS rating,
      ${content.tmdbVoteCount} AS votes,
      ${content.certification} AS certification,
      ${content.productionCountries} AS countries,
      ${content.overviewEn} AS overview_en,
      ${content.overviewUk} AS overview_uk
    FROM ${content}
    WHERE ${where}
    ORDER BY ${orderClause(p.sort)}
    LIMIT ${limit}
  `);

  const items = rows.rows as any[];
  const ids = items.map((r) => Number(r.id));
  const [genreMap, keywordMap] = await Promise.all([
    genresForContent(db, ids),
    keywordsForContent(db, ids),
  ]);

  const includeOverview = p.includeOverview !== false;

  const results: SearchResultItem[] = items.map((r) => {
    const overview: string | undefined = r.overview_en || r.overview_uk || undefined;
    return {
      id: Number(r.id),
      title: r.title_en,
      ...(r.title_uk ? { titleUk: r.title_uk } : {}),
      ...(r.original_title && r.original_title !== r.title_en ? { originalTitle: r.original_title } : {}),
      year: r.year ?? null,
      runtime: r.runtime ?? null,
      rating: r.rating ?? null,
      votes: Number(r.votes || 0),
      ...(r.certification ? { certification: r.certification } : {}),
      ...(r.countries?.length ? { countries: r.countries } : {}),
      genres: genreMap.get(Number(r.id)) || [],
      keywords: keywordMap.get(Number(r.id)) || [],
      ...(includeOverview && overview ? { overview: truncate(overview, 260) } : {}),
    };
  });

  return { matched, returned: results.length, results };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

async function genresForContent(db: Database, ids: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ contentId: contentGenres.contentId, name: genres.nameEn })
    .from(contentGenres)
    .innerJoin(genres, eq(genres.id, contentGenres.genreId))
    .where(inArray(contentGenres.contentId, ids));
  for (const r of rows) {
    const list = map.get(r.contentId) || [];
    list.push(r.name);
    map.set(r.contentId, list);
  }
  return map;
}

// Keywords are the strongest signal a model has for judgements the database
// cannot express — "spectacular", "large-scale battles" — so they ship with
// every search hit rather than only in the details call.
async function keywordsForContent(db: Database, ids: number[], perTitle = 10): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ contentId: contentKeywords.contentId, name: keywords.nameEn })
    .from(contentKeywords)
    .innerJoin(keywords, eq(keywords.id, contentKeywords.keywordId))
    .where(inArray(contentKeywords.contentId, ids));
  for (const r of rows) {
    const list = map.get(r.contentId) || [];
    if (list.length < perTitle) list.push(r.name);
    map.set(r.contentId, list);
  }
  return map;
}

export async function getTitleDetails(db: Database, userId: number, ids: number[]) {
  if (ids.length === 0) return [];

  const rows = await db
    .select({
      id: content.id,
      titleEn: content.titleEn,
      titleUk: content.titleUk,
      originalTitle: content.originalTitle,
      contentType: content.contentType,
      releaseDate: content.releaseDate,
      runtime: content.runtime,
      certification: content.certification,
      originalLanguage: content.originalLanguage,
      countries: content.productionCountries,
      overviewEn: content.overviewEn,
      overviewUk: content.overviewUk,
      imdbRating: content.imdbRating,
      tmdbRating: content.tmdbRating,
      votes: content.tmdbVoteCount,
      numberOfSeasons: content.numberOfSeasons,
      numberOfEpisodes: content.numberOfEpisodes,
    })
    .from(content)
    .where(inArray(content.id, ids));

  const [genreMap, keywordMap, peopleRows, awardRows, providerRows, swipeRows] = await Promise.all([
    genresForContent(db, ids),
    keywordsForContent(db, ids, 40),
    db
      .select({
        contentId: contentPeople.contentId,
        name: people.nameEn,
        role: contentPeople.role,
        character: contentPeople.characterName,
        billing: contentPeople.billingOrder,
      })
      .from(contentPeople)
      .innerJoin(people, eq(people.id, contentPeople.personId))
      .where(inArray(contentPeople.contentId, ids)),
    db
      .select({ contentId: awards.contentId, category: awards.category, year: awards.ceremonyYear, won: awards.won })
      .from(awards)
      .where(inArray(awards.contentId, ids)),
    db
      .select({ contentId: contentProviders.contentId, name: streamingProviders.name, type: contentProviders.providerType })
      .from(contentProviders)
      .innerJoin(streamingProviders, eq(streamingProviders.id, contentProviders.providerId))
      .where(inArray(contentProviders.contentId, ids)),
    db
      .select({ contentId: userSwipes.contentId, action: userSwipes.action, isWatched: userSwipes.isWatched })
      .from(userSwipes)
      .where(and(eq(userSwipes.userId, userId), inArray(userSwipes.contentId, ids))),
  ]);

  const swipeMap = new Map(swipeRows.map((s) => [s.contentId, s]));

  return rows.map((r) => {
    const cast = peopleRows
      .filter((p) => p.contentId === r.id && p.role === 'actor')
      .sort((a, b) => (a.billing ?? 99) - (b.billing ?? 99))
      .slice(0, 10)
      .map((p) => (p.character ? `${p.name} (${p.character})` : p.name));

    const swipe = swipeMap.get(r.id);

    return {
      id: r.id,
      title: r.titleEn,
      titleUk: r.titleUk || undefined,
      originalTitle: r.originalTitle || undefined,
      contentType: r.contentType,
      releaseDate: r.releaseDate,
      runtime: r.runtime,
      certification: r.certification || undefined,
      originalLanguage: r.originalLanguage || undefined,
      countries: r.countries || undefined,
      rating: r.imdbRating ? parseFloat(r.imdbRating) : r.tmdbRating ? parseFloat(r.tmdbRating) : null,
      votes: r.votes || 0,
      seasons: r.numberOfSeasons || undefined,
      episodes: r.numberOfEpisodes || undefined,
      overview: r.overviewEn || r.overviewUk || undefined,
      overviewUk: r.overviewUk || undefined,
      genres: genreMap.get(r.id) || [],
      keywords: keywordMap.get(r.id) || [],
      cast,
      directors: peopleRows.filter((p) => p.contentId === r.id && p.role === 'director').map((p) => p.name),
      writers: peopleRows.filter((p) => p.contentId === r.id && p.role === 'writer').map((p) => p.name),
      awards: awardRows
        .filter((a) => a.contentId === r.id)
        .map((a) => ({ category: a.category, year: a.year, won: a.won })),
      providers: [...new Set(providerRows.filter((p) => p.contentId === r.id).map((p) => p.name))],
      userStatus: {
        watched: swipe?.isWatched || false,
        opinion: swipe && (swipe.action === 'like' || swipe.action === 'dislike') ? swipe.action : null,
      },
    };
  });
}

export async function listFilters(db: Database) {
  const [genreRows, providerRows, certRows, yearRow] = await Promise.all([
    db
      .select({ name: genres.nameEn, nameUk: genres.nameUk, count: sql<number>`count(${contentGenres.contentId})::int` })
      .from(genres)
      .leftJoin(contentGenres, eq(genres.id, contentGenres.genreId))
      .groupBy(genres.id)
      .orderBy(desc(sql`count(${contentGenres.contentId})`)),
    db.select({ name: streamingProviders.name }).from(streamingProviders).orderBy(streamingProviders.name),
    db.execute(sql`SELECT DISTINCT ${content.certification} AS c FROM ${content} WHERE ${content.certification} IS NOT NULL ORDER BY c`),
    db.execute(sql`SELECT MIN(EXTRACT(YEAR FROM ${content.releaseDate}))::int AS min_year, MAX(EXTRACT(YEAR FROM ${content.releaseDate}))::int AS max_year FROM ${content}`),
  ]);

  return {
    genres: genreRows.filter((g) => g.count > 0).map((g) => ({ name: g.name, nameUk: g.nameUk || undefined, titles: g.count })),
    providers: providerRows.map((p) => p.name),
    certifications: (certRows.rows as any[]).map((r) => r.c),
    yearRange: {
      from: Number((yearRow.rows[0] as any)?.min_year || 0),
      to: Number((yearRow.rows[0] as any)?.max_year || 0),
    },
    contentTypes: ['movie', 'series', 'animation'],
  };
}

export async function getTaste(db: Database, userId: number) {
  // entity_type distinguishes actors from directors, so people are two lists
  const topFor = async (entityType: 'genre' | 'actor' | 'director' | 'keyword', limit: number) => {
    const table = entityType === 'genre' ? genres : entityType === 'keyword' ? keywords : people;
    const rows = await db.execute(sql`
      SELECT e.name_en AS name, p.raw_score::float AS score, p.interaction_count AS interactions
      FROM ${userPreferences} p
      JOIN ${table} e ON e.id = p.entity_id
      WHERE p.user_id = ${userId} AND p.entity_type = ${entityType}
      ORDER BY p.raw_score DESC
      LIMIT ${limit}
    `);
    return (rows.rows as any[]).map((r) => ({
      name: r.name,
      score: Number(Number(r.score).toFixed(3)),
      interactions: r.interactions,
    }));
  };

  const counts = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE action = 'like')::int AS likes,
      count(*) FILTER (WHERE action = 'dislike')::int AS dislikes,
      count(*) FILTER (WHERE action = 'skip')::int AS skips,
      count(*) FILTER (WHERE is_watched)::int AS watched
    FROM ${userSwipes} WHERE user_id = ${userId}
  `);

  const recent = await db
    .select({ title: content.titleEn, year: sql<number>`EXTRACT(YEAR FROM ${content.releaseDate})::int`, action: userSwipes.action })
    .from(userSwipes)
    .innerJoin(content, eq(content.id, userSwipes.contentId))
    .where(and(eq(userSwipes.userId, userId), sql`${userSwipes.action} IN ('like', 'dislike')`))
    .orderBy(desc(userSwipes.createdAt))
    .limit(30);

  const [topGenres, topActors, topDirectors, topKeywords] = await Promise.all([
    topFor('genre', 12),
    topFor('actor', 15),
    topFor('director', 10),
    topFor('keyword', 20),
  ]);

  return {
    counts: counts.rows[0],
    topGenres,
    topActors,
    topDirectors,
    topKeywords,
    recentOpinions: recent.map((r) => ({ title: r.title, year: r.year, opinion: r.action })),
  };
}
