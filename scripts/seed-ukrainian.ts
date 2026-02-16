#!/usr/bin/env tsx
/**
 * pickme.mov — Ukrainian Content Seeder
 *
 * Fetches Ukrainian-language movies/TV from TMDB and adds them to the DB.
 * Criteria: vote_count >= 10 AND vote_average >= 5.0
 *
 * Run: npx tsx scripts/seed-ukrainian.ts
 */

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, eq } from 'drizzle-orm';
import * as schema from '../server/src/db/schema.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pickme:pickme_dev@localhost:5432/pickme';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const RATE_LIMIT_RPS = 35;

// ─── Database Setup ─────────────────────────────────────────────────────────

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
const db = drizzle(pool, { schema });

// ─── Rate Limiter ───────────────────────────────────────────────────────────

class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;

  constructor(rps: number) {
    this.maxTokens = rps;
    this.tokens = rps;
    this.refillRate = rps / 1000;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
    await sleep(waitMs);
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

const rateLimiter = new RateLimiter(RATE_LIMIT_RPS);

// ─── TMDB API Client ────────────────────────────────────────────────────────

async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  await rateLimiter.acquire();

  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set('api_key', TMDB_API_KEY!);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url.toString());

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
        log(`  Rate limited (429). Waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (res.status >= 500) {
        const waitMs = Math.pow(2, attempt) * 1000;
        log(`  Server error (${res.status}). Retry in ${waitMs}ms...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        throw new Error(`TMDB ${res.status}: ${res.statusText} for ${endpoint}`);
      }

      return await res.json() as T;
    } catch (err) {
      lastError = err as Error;
      if (attempt < 4) {
        const waitMs = Math.pow(2, attempt) * 1000;
        await sleep(waitMs);
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${endpoint} after 5 attempts`);
}

const EXCLUDED_GENRES = new Set(['TV Movie', 'Soap', 'Talk', 'News', 'Reality']);
const EXCLUDED_GENRE_TMDB_IDS = '10770,10766,10767,10763,10764'; // TV Movie, Soap, Talk, News, Reality

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ─── TMDB Types ─────────────────────────────────────────────────────────────

interface TmdbGenre { id: number; name: string; }
interface TmdbDiscoverResult {
  page: number;
  total_pages: number;
  total_results: number;
  results: Array<{
    id: number;
    title?: string;
    name?: string;
    poster_path: string | null;
    genre_ids: number[];
  }>;
}

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface TmdbMovieDetail {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  original_language: string;
  production_countries: Array<{ iso_3166_1: string }>;
  vote_average: number;
  vote_count: number;
  popularity: number;
  revenue: number;
  genres: TmdbGenre[];
  belongs_to_collection: { id: number; name: string; poster_path: string | null } | null;
  credits?: {
    cast: Array<{ id: number; name: string; character: string; order: number; profile_path: string | null; known_for_department: string }>;
    crew: Array<{ id: number; name: string; job: string; department: string; profile_path: string | null }>;
  };
  keywords?: { keywords?: Array<{ id: number; name: string }>; results?: Array<{ id: number; name: string }> };
  'watch/providers'?: { results?: Record<string, { flatrate?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] }> };
  external_ids?: { imdb_id: string | null };
}

interface TmdbTvDetail {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  episode_run_time: number[];
  original_language: string;
  production_countries: Array<{ iso_3166_1: string }>;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genres: TmdbGenre[];
  number_of_seasons: number;
  number_of_episodes: number;
  credits?: {
    cast: Array<{ id: number; name: string; character: string; order: number; profile_path: string | null; known_for_department: string }>;
    crew: Array<{ id: number; name: string; job: string; department: string; profile_path: string | null }>;
  };
  keywords?: { keywords?: Array<{ id: number; name: string }>; results?: Array<{ id: number; name: string }> };
  'watch/providers'?: { results?: Record<string, { flatrate?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] }> };
  external_ids?: { imdb_id: string | null };
}

interface TmdbTranslation {
  id: number;
  title?: string;
  name?: string;
  overview: string;
}

interface TmdbPersonDetail {
  id: number;
  name: string;
  biography: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
}

// ─── Phase 1: Discover Ukrainian Content ─────────────────────────────────────

async function discoverUkrainianContent(): Promise<{ movieIds: number[]; tvIds: number[] }> {
  log('[Discover] Finding Ukrainian movies (vote_count>=10, vote_average>=5)...');

  const movieIds: number[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await tmdbFetch<TmdbDiscoverResult>('/discover/movie', {
      with_original_language: 'uk',
      without_genres: EXCLUDED_GENRE_TMDB_IDS,
      'vote_count.gte': '10',
      'vote_average.gte': '5',
      sort_by: 'vote_average.desc',
      page: String(page),
      language: 'en-US',
    });

    totalPages = data.total_pages;
    for (const movie of data.results) {
      movieIds.push(movie.id);
    }
    log(`[Discover] Movies page ${page}/${totalPages}: ${data.results.length} found (${movieIds.length} total)`);
    page++;
  }

  log('[Discover] Finding Ukrainian TV series (vote_count>=10, vote_average>=5)...');

  const tvIds: number[] = [];
  page = 1;
  totalPages = 1;

  while (page <= totalPages) {
    const data = await tmdbFetch<TmdbDiscoverResult>('/discover/tv', {
      with_original_language: 'uk',
      without_genres: EXCLUDED_GENRE_TMDB_IDS,
      'vote_count.gte': '10',
      'vote_average.gte': '5',
      sort_by: 'vote_average.desc',
      page: String(page),
      language: 'en-US',
    });

    totalPages = data.total_pages;
    for (const item of data.results) {
      tvIds.push(item.id);
    }
    log(`[Discover] TV page ${page}/${totalPages}: ${data.results.length} found (${tvIds.length} total)`);
    page++;
  }

  log(`[Discover] Total: ${movieIds.length} movies + ${tvIds.length} TV = ${movieIds.length + tvIds.length} items`);
  return { movieIds, tvIds };
}

// ─── Phase 2: Fetch Details & Insert ─────────────────────────────────────────

async function fetchAndInsertContent(movieIds: number[], tvIds: number[]): Promise<Set<number>> {
  log('[Details] Fetching content details and inserting...');

  // Genre tmdb_id -> internal id lookup
  const genreRows = await db.select({ id: schema.genres.id, tmdbId: schema.genres.tmdbId }).from(schema.genres);
  const genreTmdbToId = new Map<number, number>();
  for (const r of genreRows) genreTmdbToId.set(r.tmdbId, r.id);

  // Check which tmdb_ids already exist
  const existingContent = await db.select({ tmdbId: schema.content.tmdbId }).from(schema.content);
  const existingTmdbIds = new Set(existingContent.map(r => r.tmdbId));

  const allNewPeopleIds = new Set<number>();
  let inserted = 0;
  let skipped = 0;

  // Process movies
  for (let i = 0; i < movieIds.length; i++) {
    const tmdbId = movieIds[i];

    if (existingTmdbIds.has(tmdbId)) {
      skipped++;
      if ((i + 1) % 20 === 0) log(`[Details] Movies: ${i + 1}/${movieIds.length} (${inserted} new, ${skipped} existed)`);
      continue;
    }

    try {
      const en = await tmdbFetch<TmdbMovieDetail>(`/movie/${tmdbId}`, {
        append_to_response: 'credits,keywords,watch/providers,external_ids',
        language: 'en-US',
      });

      // For Ukrainian movies, fetch uk-UA translation (should have good data)
      const uk = await tmdbFetch<TmdbTranslation>(`/movie/${tmdbId}`, { language: 'uk-UA' });

      const hasUkTranslation = Boolean(uk.title && uk.title !== en.title);
      const imdbId = en.external_ids?.imdb_id || en.imdb_id || null;
      const isAnimation = en.genres.some((g) => g.name === 'Animation');
      const contentType = isAnimation ? 'animation' : 'movie';

      const [contentRow] = await db.insert(schema.content).values({
        tmdbId: en.id,
        imdbId,
        contentType,
        titleEn: en.title,
        titleUk: hasUkTranslation ? uk.title! : en.original_title, // Ukrainian movies — use original title as fallback
        originalTitle: en.original_title,
        overviewEn: en.overview || null,
        overviewUk: uk.overview || null,
        posterPath: en.poster_path,
        backdropPath: en.backdrop_path,
        releaseDate: en.release_date || null,
        runtime: en.runtime ? (en.runtime as number) : null,
        originalLanguage: en.original_language,
        productionCountries: en.production_countries?.map((c) => c.iso_3166_1) || [],
        tmdbRating: en.vote_average ? String(en.vote_average) : null,
        tmdbVoteCount: en.vote_count || 0,
        popularity: en.popularity ? String(en.popularity) : null,
        revenue: en.revenue || 0,
        hasUkTranslation: true, // Ukrainian content always has UK
      }).onConflictDoUpdate({
        target: schema.content.tmdbId,
        set: {
          titleUk: hasUkTranslation ? uk.title! : en.original_title,
          overviewUk: uk.overview || null,
          hasUkTranslation: true,
        },
      }).returning({ id: schema.content.id });

      const contentId = contentRow.id;

      // Genres (skip excluded)
      for (const g of en.genres) {
        if (EXCLUDED_GENRES.has(g.name)) continue;
        const genreDbId = genreTmdbToId.get(g.id);
        if (!genreDbId) continue;
        await db.insert(schema.contentGenres).values({ contentId, genreId: genreDbId }).onConflictDoNothing();
      }

      // Keywords
      const kwList = en.keywords?.keywords || en.keywords?.results || [];
      for (const kw of kwList) {
        const [kwRow] = await db.insert(schema.keywords).values({
          tmdbId: kw.id, nameEn: kw.name,
        }).onConflictDoUpdate({
          target: schema.keywords.tmdbId, set: { nameEn: kw.name },
        }).returning({ id: schema.keywords.id });
        await db.insert(schema.contentKeywords).values({ contentId, keywordId: kwRow.id }).onConflictDoNothing();
      }

      // Streaming providers (UA)
      const providers = en['watch/providers']?.results;
      if (providers?.['UA']) {
        for (const pType of ['flatrate', 'rent', 'buy'] as const) {
          const pList = providers['UA'][pType];
          if (!pList) continue;
          for (const p of pList) {
            const [provRow] = await db.insert(schema.streamingProviders).values({
              tmdbId: p.provider_id, name: p.provider_name, logoPath: p.logo_path,
            }).onConflictDoUpdate({
              target: schema.streamingProviders.tmdbId,
              set: { name: p.provider_name, logoPath: p.logo_path },
            }).returning({ id: schema.streamingProviders.id });
            await db.insert(schema.contentProviders).values({
              contentId, providerId: provRow.id, providerType: pType, country: 'UA',
            }).onConflictDoNothing();
          }
        }
      }

      // Collection
      if (en.belongs_to_collection) {
        const coll = en.belongs_to_collection;
        const [collRow] = await db.insert(schema.collections).values({
          tmdbId: coll.id, nameEn: coll.name, posterPath: coll.poster_path,
        }).onConflictDoUpdate({
          target: schema.collections.tmdbId, set: { nameEn: coll.name, posterPath: coll.poster_path },
        }).returning({ id: schema.collections.id });
        await db.insert(schema.contentCollections).values({ contentId, collectionId: collRow.id }).onConflictDoNothing();
      }

      // Credits
      if (en.credits) {
        const topCast = en.credits.cast.sort((a, b) => a.order - b.order).slice(0, 10);
        for (const actor of topCast) {
          allNewPeopleIds.add(actor.id);
          await db.insert(schema.people).values({
            tmdbId: actor.id, nameEn: actor.name, photoPath: actor.profile_path,
            knownFor: 'actor', popularity: '0',
          }).onConflictDoNothing();

          const personRows = await db.select({ id: schema.people.id }).from(schema.people)
            .where(eq(schema.people.tmdbId, actor.id));
          if (personRows.length > 0) {
            await db.insert(schema.contentPeople).values({
              contentId, personId: personRows[0].id, role: 'actor',
              characterName: actor.character || null, billingOrder: actor.order + 1,
            }).onConflictDoNothing();
          }
        }

        const directors = en.credits.crew.filter((c) => c.job === 'Director');
        const writers = en.credits.crew.filter((c) =>
          c.job === 'Writer' || c.job === 'Screenplay' || c.job === 'Story'
        );

        for (const person of [...directors, ...writers]) {
          allNewPeopleIds.add(person.id);
          const role = directors.some((d) => d.id === person.id) ? 'director' : 'writer';
          await db.insert(schema.people).values({
            tmdbId: person.id, nameEn: person.name, photoPath: person.profile_path,
            knownFor: role as 'director' | 'writer', popularity: '0',
          }).onConflictDoNothing();

          const personRows = await db.select({ id: schema.people.id }).from(schema.people)
            .where(eq(schema.people.tmdbId, person.id));
          if (personRows.length > 0) {
            await db.insert(schema.contentPeople).values({
              contentId, personId: personRows[0].id, role: role as 'director' | 'writer',
              characterName: null, billingOrder: null,
            }).onConflictDoNothing();
          }
        }
      }

      inserted++;
      existingTmdbIds.add(tmdbId);

      if ((i + 1) % 10 === 0 || i === movieIds.length - 1) {
        log(`[Details] Movies: ${i + 1}/${movieIds.length} (${inserted} new, ${skipped} existed)`);
      }
    } catch (err) {
      log(`[Details] Error movie ${tmdbId}: ${(err as Error).message}`);
    }
  }

  // Process TV series
  let tvInserted = 0;
  let tvSkipped = 0;

  for (let i = 0; i < tvIds.length; i++) {
    const tmdbId = tvIds[i];

    if (existingTmdbIds.has(tmdbId)) {
      tvSkipped++;
      continue;
    }

    try {
      const en = await tmdbFetch<TmdbTvDetail>(`/tv/${tmdbId}`, {
        append_to_response: 'credits,keywords,watch/providers,external_ids',
        language: 'en-US',
      });

      const uk = await tmdbFetch<TmdbTranslation>(`/tv/${tmdbId}`, { language: 'uk-UA' });

      const hasUkTranslation = Boolean(uk.name && uk.name !== en.name);
      const imdbId = en.external_ids?.imdb_id || null;
      const isAnimation = en.genres.some((g) => g.name === 'Animation');
      const contentType = isAnimation ? 'animation' : 'series';
      const runtime = en.episode_run_time?.length > 0 ? en.episode_run_time[0] : null;

      const [contentRow] = await db.insert(schema.content).values({
        tmdbId: en.id,
        imdbId,
        contentType,
        titleEn: en.name,
        titleUk: hasUkTranslation ? uk.name! : en.original_name,
        originalTitle: en.original_name,
        overviewEn: en.overview || null,
        overviewUk: uk.overview || null,
        posterPath: en.poster_path,
        backdropPath: en.backdrop_path,
        releaseDate: en.first_air_date || null,
        runtime: runtime ? (runtime as number) : null,
        originalLanguage: en.original_language,
        productionCountries: en.production_countries?.map((c) => c.iso_3166_1) || [],
        tmdbRating: en.vote_average ? String(en.vote_average) : null,
        tmdbVoteCount: en.vote_count || 0,
        popularity: en.popularity ? String(en.popularity) : null,
        revenue: 0,
        numberOfSeasons: en.number_of_seasons,
        numberOfEpisodes: en.number_of_episodes,
        hasUkTranslation: true,
      }).onConflictDoUpdate({
        target: schema.content.tmdbId,
        set: {
          titleUk: hasUkTranslation ? uk.name! : en.original_name,
          overviewUk: uk.overview || null,
          hasUkTranslation: true,
        },
      }).returning({ id: schema.content.id });

      const contentId = contentRow.id;

      // Genres (skip excluded)
      for (const g of en.genres) {
        if (EXCLUDED_GENRES.has(g.name)) continue;
        const genreDbId = genreTmdbToId.get(g.id);
        if (!genreDbId) continue;
        await db.insert(schema.contentGenres).values({ contentId, genreId: genreDbId }).onConflictDoNothing();
      }

      // Keywords
      const kwList = en.keywords?.results || en.keywords?.keywords || [];
      for (const kw of kwList) {
        const [kwRow] = await db.insert(schema.keywords).values({
          tmdbId: kw.id, nameEn: kw.name,
        }).onConflictDoUpdate({
          target: schema.keywords.tmdbId, set: { nameEn: kw.name },
        }).returning({ id: schema.keywords.id });
        await db.insert(schema.contentKeywords).values({ contentId, keywordId: kwRow.id }).onConflictDoNothing();
      }

      // Streaming providers (UA)
      const tvProviders = en['watch/providers']?.results;
      if (tvProviders?.['UA']) {
        for (const pType of ['flatrate', 'rent', 'buy'] as const) {
          const pList = tvProviders['UA'][pType];
          if (!pList) continue;
          for (const p of pList) {
            const [provRow] = await db.insert(schema.streamingProviders).values({
              tmdbId: p.provider_id, name: p.provider_name, logoPath: p.logo_path,
            }).onConflictDoUpdate({
              target: schema.streamingProviders.tmdbId,
              set: { name: p.provider_name, logoPath: p.logo_path },
            }).returning({ id: schema.streamingProviders.id });
            await db.insert(schema.contentProviders).values({
              contentId, providerId: provRow.id, providerType: pType, country: 'UA',
            }).onConflictDoNothing();
          }
        }
      }

      // Credits
      if (en.credits) {
        const topCast = en.credits.cast.sort((a, b) => a.order - b.order).slice(0, 10);
        for (const actor of topCast) {
          allNewPeopleIds.add(actor.id);
          await db.insert(schema.people).values({
            tmdbId: actor.id, nameEn: actor.name, photoPath: actor.profile_path,
            knownFor: 'actor', popularity: '0',
          }).onConflictDoNothing();

          const personRows = await db.select({ id: schema.people.id }).from(schema.people)
            .where(eq(schema.people.tmdbId, actor.id));
          if (personRows.length > 0) {
            await db.insert(schema.contentPeople).values({
              contentId, personId: personRows[0].id, role: 'actor',
              characterName: actor.character || null, billingOrder: actor.order + 1,
            }).onConflictDoNothing();
          }
        }

        const directors = en.credits.crew.filter((c) => c.job === 'Director');
        const writers = en.credits.crew.filter((c) =>
          c.job === 'Writer' || c.job === 'Screenplay' || c.job === 'Story'
        );

        for (const person of [...directors, ...writers]) {
          allNewPeopleIds.add(person.id);
          const role = directors.some((d) => d.id === person.id) ? 'director' : 'writer';
          await db.insert(schema.people).values({
            tmdbId: person.id, nameEn: person.name, photoPath: person.profile_path,
            knownFor: role as 'director' | 'writer', popularity: '0',
          }).onConflictDoNothing();

          const personRows = await db.select({ id: schema.people.id }).from(schema.people)
            .where(eq(schema.people.tmdbId, person.id));
          if (personRows.length > 0) {
            await db.insert(schema.contentPeople).values({
              contentId, personId: personRows[0].id, role: role as 'director' | 'writer',
              characterName: null, billingOrder: null,
            }).onConflictDoNothing();
          }
        }
      }

      tvInserted++;
      existingTmdbIds.add(tmdbId);
      log(`[Details] TV: ${i + 1}/${tvIds.length} (${tvInserted} new, ${tvSkipped} existed)`);
    } catch (err) {
      log(`[Details] Error TV ${tmdbId}: ${(err as Error).message}`);
    }
  }

  log(`[Details] Done: ${inserted} movies + ${tvInserted} TV inserted (${skipped + tvSkipped} already existed)`);
  return allNewPeopleIds;
}

// ─── Phase 3: People Details ─────────────────────────────────────────────────

async function fetchPeopleDetails(newPeopleIds: Set<number>): Promise<void> {
  // Get all new people that need detail updates (popularity = 0 means stub)
  const stubPeople = await db.select({
    id: schema.people.id,
    tmdbId: schema.people.tmdbId,
  }).from(schema.people)
    .where(eq(schema.people.popularity, '0'));

  // Filter to only people referenced by our new content
  const toProcess = stubPeople.filter(p => newPeopleIds.has(p.tmdbId));

  log(`[People] ${toProcess.length} new people to fetch details for...`);

  for (let i = 0; i < toProcess.length; i++) {
    const { id: dbId, tmdbId } = toProcess[i];

    try {
      const en = await tmdbFetch<TmdbPersonDetail>(`/person/${tmdbId}`, { language: 'en-US' });
      const uk = await tmdbFetch<TmdbPersonDetail>(`/person/${tmdbId}`, { language: 'uk-UA' });

      const hasUkName = uk.name && uk.name !== en.name;
      const hasUkBio = uk.biography && uk.biography !== en.biography && uk.biography.length > 0;

      let knownFor: 'actor' | 'director' | 'writer' = 'actor';
      if (en.known_for_department === 'Directing') knownFor = 'director';
      else if (en.known_for_department === 'Writing') knownFor = 'writer';

      await db.update(schema.people).set({
        nameEn: en.name,
        nameUk: hasUkName ? uk.name : null,
        photoPath: en.profile_path,
        biographyEn: en.biography || null,
        biographyUk: hasUkBio ? uk.biography : null,
        knownFor,
        popularity: String(en.popularity || 0),
      }).where(eq(schema.people.id, dbId));

      if ((i + 1) % 50 === 0 || i === toProcess.length - 1) {
        log(`[People] ${i + 1}/${toProcess.length} processed`);
      }
    } catch (err) {
      log(`[People] Error person ${tmdbId}: ${(err as Error).message}`);
    }
  }

  log(`[People] Done.`);
}

// ─── Phase 4: Recompute Scores & IDF ────────────────────────────────────────

async function recomputeScoresAndIdf(): Promise<void> {
  log('[Scores] Recomputing quality scores...');

  await db.execute(sql`
    UPDATE content SET base_quality_score = (
      COALESCE(tmdb_rating / 10.0, 0) * 0.25
      + COALESCE(imdb_rating / 10.0, 0) * 0.25
      + LEAST(
          LN(GREATEST(COALESCE(popularity, 0)::numeric, 1)) /
          NULLIF(LN(GREATEST((SELECT MAX(popularity) FROM content)::numeric, 2)), 0),
          1.0
        ) * 0.15
      + LEAST(
          LN(GREATEST(COALESCE(revenue, 0)::numeric + 1, 1)) /
          NULLIF(LN(GREATEST((SELECT MAX(revenue) FROM content)::numeric + 1, 2)), 0),
          1.0
        ) * 0.10
      + COALESCE((
          SELECT CASE
            WHEN bool_or(won) THEN 1.0
            WHEN COUNT(*) > 0 THEN 0.6
            ELSE 0.0
          END
          FROM awards WHERE awards.content_id = content.id
        ), 0) * 0.15
      + LEAST(COALESCE(tmdb_vote_count, 0)::numeric / 1000.0, 1.0) * 0.10
    )
  `);

  log('[Scores] Done. Recomputing IDF cache...');

  // Recompute all IDF entries
  for (const [entityType, subquery] of [
    ['genre', sql`
      SELECT 'genre'::entity_type, cg.genre_id,
        LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT cg.content_id), 1)),
        COUNT(DISTINCT cg.content_id)::int
      FROM content_genres cg GROUP BY cg.genre_id
    `],
    ['director', sql`
      SELECT 'director'::entity_type, cp.person_id,
        LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT cp.content_id), 1)),
        COUNT(DISTINCT cp.content_id)::int
      FROM content_people cp WHERE cp.role = 'director' GROUP BY cp.person_id
    `],
    ['actor', sql`
      SELECT 'actor'::entity_type, cp.person_id,
        LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT cp.content_id), 1)),
        COUNT(DISTINCT cp.content_id)::int
      FROM content_people cp WHERE cp.role = 'actor' GROUP BY cp.person_id
    `],
    ['keyword', sql`
      SELECT 'keyword'::entity_type, ck.keyword_id,
        LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT ck.content_id), 1)),
        COUNT(DISTINCT ck.content_id)::int
      FROM content_keywords ck GROUP BY ck.keyword_id
    `],
    ['decade', sql`
      SELECT 'decade'::entity_type, (EXTRACT(YEAR FROM c.release_date)::int / 10 * 10),
        LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(*), 1)),
        COUNT(*)::int
      FROM content c WHERE c.release_date IS NOT NULL
      GROUP BY (EXTRACT(YEAR FROM c.release_date)::int / 10 * 10)
    `],
    ['collection', sql`
      SELECT 'collection'::entity_type, cc.collection_id,
        LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT cc.content_id), 1)),
        COUNT(DISTINCT cc.content_id)::int
      FROM content_collections cc GROUP BY cc.collection_id
    `],
  ] as const) {
    await db.execute(sql`
      INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
      ${subquery}
      ON CONFLICT (entity_type, entity_id) DO UPDATE
        SET idf_weight = EXCLUDED.idf_weight,
            content_count = EXCLUDED.content_count,
            updated_at = NOW()
    `);
    log(`[IDF] ${entityType} done.`);
  }

  log('[IDF] All IDF caches recomputed.');
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY is not set.');
    process.exit(1);
  }

  log('=== Ukrainian Content Seeder ===');

  // Phase 1: Discover
  const { movieIds, tvIds } = await discoverUkrainianContent();

  // Phase 2: Fetch details & insert
  const newPeopleIds = await fetchAndInsertContent(movieIds, tvIds);

  // Phase 3: People details
  await fetchPeopleDetails(newPeopleIds);

  // Phase 4: Recompute scores & IDF
  await recomputeScoresAndIdf();

  // Summary
  const contentCount = await db.select({ count: sql<number>`count(*)` }).from(schema.content);
  const ukCount = await db.execute(sql`SELECT count(*) as c FROM content WHERE original_language = 'uk'`);
  const peopleCount = await db.select({ count: sql<number>`count(*)` }).from(schema.people);

  log('=== Summary ===');
  log(`Total content: ${contentCount[0].count}`);
  log(`Ukrainian content: ${(ukCount.rows[0] as any).c}`);
  log(`Total people: ${peopleCount[0].count}`);
  log('=== Done! ===');

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  pool.end();
  process.exit(1);
});
