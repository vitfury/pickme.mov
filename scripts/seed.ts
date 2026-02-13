#!/usr/bin/env tsx
/**
 * pickme.mov — TMDB Data Seeding Script
 *
 * Fetches movie/series/people data from TMDB and populates PostgreSQL.
 * Run: npm run seed
 * Run specific phase: tsx scripts/seed.ts --phase discover
 */

import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, eq, and, inArray } from 'drizzle-orm';
import * as schema from '../server/src/db/schema.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Configuration ──────────────────────────────────────────────────────────

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pickme:pickme_dev@localhost:5432/pickme';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const OSCAR_CSV_URL = 'https://raw.githubusercontent.com/DLu/oscar_data/master/oscars.csv';

const PROGRESS_FILE = path.join(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '.seed-progress.json');

const RATE_LIMIT_RPS = 35;
const RATE_LIMIT_INTERVAL = 1000 / RATE_LIMIT_RPS; // ~28.5ms between requests

const GENRE_QUOTAS: Record<string, number> = {
  Action: 600, Drama: 700, Comedy: 600, Thriller: 500,
  'Science Fiction': 400, Horror: 350, Romance: 350, Crime: 350,
  Adventure: 300, Animation: 300, Mystery: 200, War: 150,
  Fantasy: 250, Family: 200, Documentary: 150, History: 150,
  Music: 100, Western: 100,
};

const TV_GENRE_QUOTAS: Record<string, number> = {
  Drama: 300, Comedy: 200, 'Action & Adventure': 150,
  'Sci-Fi & Fantasy': 150, Crime: 100, Mystery: 100,
  Animation: 200, Documentary: 100, Family: 50, War: 50,
};

const GENRE_EMOJIS: Record<string, string> = {
  Action: '💥', Adventure: '🗺️', Animation: '🎨', Comedy: '😂',
  Crime: '🔫', Documentary: '📹', Drama: '🎭', Family: '👨‍👩‍👧‍👦',
  Fantasy: '🧙', History: '📜', Horror: '🔪', Music: '🎵',
  Mystery: '🔍', Romance: '💕', 'Science Fiction': '🚀',
  'TV Movie': '📺', Thriller: '😱', War: '⚔️', Western: '🤠',
  // TV genres
  'Action & Adventure': '💥', 'Sci-Fi & Fantasy': '🚀',
  Kids: '👶', News: '📰', Reality: '📸', Soap: '🧼', Talk: '🎤',
  'War & Politics': '⚔️',
};

const OSCAR_CATEGORY_MAP: Record<string, string> = {
  'BEST PICTURE': 'picture',
  'DIRECTING': 'director',
  'ACTOR IN A LEADING ROLE': 'actor',
  'ACTRESS IN A LEADING ROLE': 'actress',
  'ACTOR IN A SUPPORTING ROLE': 'supporting_actor',
  'ACTRESS IN A SUPPORTING ROLE': 'supporting_actress',
  'CINEMATOGRAPHY': 'cinematography',
  'ANIMATED FEATURE FILM': 'animated',
  'INTERNATIONAL FEATURE FILM': 'international',
};

// Patterns for partial matching
const OSCAR_CATEGORY_PATTERNS: [RegExp, string][] = [
  [/^WRITING/i, 'screenplay'],
  [/SCREENPLAY/i, 'screenplay'],
  [/^MUSIC \(ORIGINAL SCORE\)/i, 'score'],
  [/^MUSIC \(ORIGINAL SONG\)/i, 'song'],
  [/ANIMATED FEATURE/i, 'animated'],
  [/INTERNATIONAL FEATURE/i, 'international'],
  [/BEST PICTURE/i, 'picture'],
];

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
  private refillRate: number; // tokens per ms
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

// ─── Progress Tracker ───────────────────────────────────────────────────────

interface SeedProgress {
  phases: Record<string, 'pending' | 'running' | 'complete'>;
  discoveredMovieIds: number[];
  discoveredTvIds: number[];
  detailsProcessedIds: number[];
  peopleProcessedIds: number[];
  oscarsComplete: boolean;
  scoresComplete: boolean;
  idfComplete: boolean;
}

function loadProgress(): SeedProgress {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch { /* ignore corrupt file */ }
  return {
    phases: {},
    discoveredMovieIds: [],
    discoveredTvIds: [],
    detailsProcessedIds: [],
    peopleProcessedIds: [],
    oscarsComplete: false,
    scoresComplete: false,
    idfComplete: false,
  };
}

function saveProgress(progress: SeedProgress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function mapOscarCategory(category: string): string {
  const upper = category.toUpperCase().trim();

  // Exact match first
  if (OSCAR_CATEGORY_MAP[upper]) return OSCAR_CATEGORY_MAP[upper];

  // Pattern match
  for (const [pattern, mapped] of OSCAR_CATEGORY_PATTERNS) {
    if (pattern.test(upper)) return mapped;
  }

  return 'other';
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
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

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
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

// ─── Phase 1: Discover ──────────────────────────────────────────────────────

async function phaseDiscover(progress: SeedProgress): Promise<void> {
  log('[Phase 1] Discovering content...');

  // Fetch genre lists (EN + UK)
  const [movieGenresEn, movieGenresUk, tvGenresEn, tvGenresUk] = await Promise.all([
    tmdbFetch<{ genres: TmdbGenre[] }>('/genre/movie/list', { language: 'en-US' }),
    tmdbFetch<{ genres: TmdbGenre[] }>('/genre/movie/list', { language: 'uk-UA' }),
    tmdbFetch<{ genres: TmdbGenre[] }>('/genre/tv/list', { language: 'en-US' }),
    tmdbFetch<{ genres: TmdbGenre[] }>('/genre/tv/list', { language: 'uk-UA' }),
  ]);

  // Merge movie + TV genres, dedup by tmdb_id
  const allGenresMap = new Map<number, { tmdbId: number; nameEn: string; nameUk: string | null; emoji: string | null }>();

  for (const g of movieGenresEn.genres) {
    const ukMatch = movieGenresUk.genres.find((u) => u.id === g.id);
    allGenresMap.set(g.id, {
      tmdbId: g.id,
      nameEn: g.name,
      nameUk: ukMatch && ukMatch.name !== g.name ? ukMatch.name : null,
      emoji: GENRE_EMOJIS[g.name] || null,
    });
  }
  for (const g of tvGenresEn.genres) {
    if (!allGenresMap.has(g.id)) {
      const ukMatch = tvGenresUk.genres.find((u) => u.id === g.id);
      allGenresMap.set(g.id, {
        tmdbId: g.id,
        nameEn: g.name,
        nameUk: ukMatch && ukMatch.name !== g.name ? ukMatch.name : null,
        emoji: GENRE_EMOJIS[g.name] || null,
      });
    }
  }

  // Upsert genres
  log(`[Phase 1] Inserting ${allGenresMap.size} genres...`);
  for (const g of allGenresMap.values()) {
    await db.insert(schema.genres).values({
      tmdbId: g.tmdbId,
      nameEn: g.nameEn,
      nameUk: g.nameUk,
      emoji: g.emoji,
    }).onConflictDoUpdate({
      target: schema.genres.tmdbId,
      set: { nameEn: g.nameEn, nameUk: g.nameUk, emoji: g.emoji },
    });
  }

  // Discover movies per genre
  const movieIdSet = new Set<number>(progress.discoveredMovieIds);
  const genreNameToId = new Map<string, number>();
  for (const g of movieGenresEn.genres) genreNameToId.set(g.name, g.id);

  for (const [genreName, quota] of Object.entries(GENRE_QUOTAS)) {
    const genreId = genreNameToId.get(genreName);
    if (!genreId) {
      log(`  Warning: Genre "${genreName}" not found in TMDB. Skipping.`);
      continue;
    }

    let collected = 0;
    let page = 1;
    const prevSize = movieIdSet.size;

    while (collected < quota && page <= 50) {
      const data = await tmdbFetch<TmdbDiscoverResult>('/discover/movie', {
        with_genres: String(genreId),
        sort_by: 'vote_count.desc',
        'vote_count.gte': '100',
        'vote_average.gte': '5.5',
        'primary_release_date.gte': '1970-01-01',
        page: String(page),
        language: 'en-US',
      });

      if (!data.results || data.results.length === 0) break;

      for (const movie of data.results) {
        if (collected >= quota) break;
        if (!movieIdSet.has(movie.id) && movie.poster_path) {
          movieIdSet.add(movie.id);
          collected++;
        }
      }

      page++;
      if (page > data.total_pages) break;
    }

    const newlyAdded = movieIdSet.size - prevSize;
    log(`[Phase 1] Genre "${genreName}": ${newlyAdded} new (${collected} in quota, ${movieIdSet.size} total unique)`);
  }

  progress.discoveredMovieIds = [...movieIdSet];
  saveProgress(progress);

  // Discover TV series per genre
  const tvIdSet = new Set<number>(progress.discoveredTvIds);
  const tvGenreNameToId = new Map<string, number>();
  for (const g of tvGenresEn.genres) tvGenreNameToId.set(g.name, g.id);

  for (const [genreName, quota] of Object.entries(TV_GENRE_QUOTAS)) {
    const genreId = tvGenreNameToId.get(genreName);
    if (!genreId) {
      log(`  Warning: TV Genre "${genreName}" not found. Skipping.`);
      continue;
    }

    let collected = 0;
    let page = 1;
    const prevSize = tvIdSet.size;

    while (collected < quota && page <= 50) {
      const data = await tmdbFetch<TmdbDiscoverResult>('/discover/tv', {
        with_genres: String(genreId),
        sort_by: 'vote_count.desc',
        'vote_count.gte': '100',
        'vote_average.gte': '5.5',
        'first_air_date.gte': '1970-01-01',
        page: String(page),
        language: 'en-US',
      });

      if (!data.results || data.results.length === 0) break;

      for (const item of data.results) {
        if (collected >= quota) break;
        if (!tvIdSet.has(item.id) && item.poster_path) {
          tvIdSet.add(item.id);
          collected++;
        }
      }

      page++;
      if (page > data.total_pages) break;
    }

    const newlyAdded = tvIdSet.size - prevSize;
    log(`[Phase 1] TV Genre "${genreName}": ${newlyAdded} new (${tvIdSet.size} total unique TV)`);
  }

  progress.discoveredTvIds = [...tvIdSet];
  progress.phases['discover'] = 'complete';
  saveProgress(progress);

  log(`[Phase 1] Discovery complete: ${movieIdSet.size} movies, ${tvIdSet.size} TV series`);
}

// ─── Phase 2: Details ───────────────────────────────────────────────────────

async function phaseDetails(progress: SeedProgress): Promise<void> {
  log('[Phase 2] Fetching content details...');

  const processedSet = new Set<string>(progress.detailsProcessedIds.map(String));
  const allPeopleIds = new Set<number>();

  // Genre tmdb_id -> internal id lookup
  const genreRows = await db.select({ id: schema.genres.id, tmdbId: schema.genres.tmdbId }).from(schema.genres);
  const genreTmdbToId = new Map<number, number>();
  for (const r of genreRows) genreTmdbToId.set(r.tmdbId, r.id);

  // Process movies
  const movieIds = progress.discoveredMovieIds;
  log(`[Phase 2] Processing ${movieIds.length} movies...`);

  for (let i = 0; i < movieIds.length; i++) {
    const tmdbId = movieIds[i];
    if (processedSet.has(`m${tmdbId}`)) continue;

    try {
      // Fetch EN details with appended sub-resources
      const en = await tmdbFetch<TmdbMovieDetail>(`/movie/${tmdbId}`, {
        append_to_response: 'credits,keywords,watch/providers,external_ids',
        language: 'en-US',
      });

      // Fetch UK translation
      const uk = await tmdbFetch<TmdbTranslation>(`/movie/${tmdbId}`, { language: 'uk-UA' });

      const hasUkTranslation = Boolean(uk.title && uk.title !== en.title);
      const imdbId = en.external_ids?.imdb_id || en.imdb_id || null;

      // Determine content type: if animation genre is present, it's 'animation'
      const isAnimation = en.genres.some((g) => g.name === 'Animation');
      const contentType = isAnimation ? 'animation' : 'movie';

      // Upsert content
      const [contentRow] = await db.insert(schema.content).values({
        tmdbId: en.id,
        imdbId,
        contentType,
        titleEn: en.title,
        titleUk: hasUkTranslation ? uk.title! : null,
        originalTitle: en.original_title,
        overviewEn: en.overview || null,
        overviewUk: hasUkTranslation ? uk.overview || null : null,
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
        hasUkTranslation,
      }).onConflictDoUpdate({
        target: schema.content.tmdbId,
        set: {
          imdbId,
          contentType,
          titleEn: en.title,
          titleUk: hasUkTranslation ? uk.title! : null,
          originalTitle: en.original_title,
          overviewEn: en.overview || null,
          overviewUk: hasUkTranslation ? uk.overview || null : null,
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
          hasUkTranslation,
        },
      }).returning({ id: schema.content.id });

      const contentId = contentRow.id;

      // Insert content_genres
      for (const g of en.genres) {
        const genreDbId = genreTmdbToId.get(g.id);
        if (!genreDbId) continue;
        await db.insert(schema.contentGenres).values({
          contentId,
          genreId: genreDbId,
        }).onConflictDoNothing();
      }

      // Insert keywords
      const kwList = en.keywords?.keywords || en.keywords?.results || [];
      for (const kw of kwList) {
        const [kwRow] = await db.insert(schema.keywords).values({
          tmdbId: kw.id,
          nameEn: kw.name,
        }).onConflictDoUpdate({
          target: schema.keywords.tmdbId,
          set: { nameEn: kw.name },
        }).returning({ id: schema.keywords.id });
        await db.insert(schema.contentKeywords).values({
          contentId,
          keywordId: kwRow.id,
        }).onConflictDoNothing();
      }

      // Insert streaming providers (UA region)
      const providers = en['watch/providers']?.results;
      if (providers) {
        const uaProviders = providers['UA'];
        if (uaProviders) {
          for (const pType of ['flatrate', 'rent', 'buy'] as const) {
            const pList = uaProviders[pType];
            if (!pList) continue;
            for (const p of pList) {
              const [provRow] = await db.insert(schema.streamingProviders).values({
                tmdbId: p.provider_id,
                name: p.provider_name,
                logoPath: p.logo_path,
              }).onConflictDoUpdate({
                target: schema.streamingProviders.tmdbId,
                set: { name: p.provider_name, logoPath: p.logo_path },
              }).returning({ id: schema.streamingProviders.id });
              await db.insert(schema.contentProviders).values({
                contentId,
                providerId: provRow.id,
                providerType: pType,
                country: 'UA',
              }).onConflictDoNothing();
            }
          }
        }
      }

      // Insert collection
      if (en.belongs_to_collection) {
        const coll = en.belongs_to_collection;
        const [collRow] = await db.insert(schema.collections).values({
          tmdbId: coll.id,
          nameEn: coll.name,
          posterPath: coll.poster_path,
        }).onConflictDoUpdate({
          target: schema.collections.tmdbId,
          set: { nameEn: coll.name, posterPath: coll.poster_path },
        }).returning({ id: schema.collections.id });
        await db.insert(schema.contentCollections).values({
          contentId,
          collectionId: collRow.id,
        }).onConflictDoNothing();
      }

      // Collect people from credits
      if (en.credits) {
        // Top 10 actors
        const topCast = en.credits.cast
          .sort((a, b) => a.order - b.order)
          .slice(0, 10);

        for (const actor of topCast) {
          allPeopleIds.add(actor.id);
          // Insert stub person for FK references, full details in Phase 3
          await db.insert(schema.people).values({
            tmdbId: actor.id,
            nameEn: actor.name,
            photoPath: actor.profile_path,
            knownFor: 'actor',
            popularity: '0',
          }).onConflictDoNothing();

          const personRows = await db.select({ id: schema.people.id }).from(schema.people)
            .where(eq(schema.people.tmdbId, actor.id));
          if (personRows.length > 0) {
            await db.insert(schema.contentPeople).values({
              contentId,
              personId: personRows[0].id,
              role: 'actor',
              characterName: actor.character || null,
              billingOrder: actor.order + 1,
            }).onConflictDoNothing();
          }
        }

        // All directors and writers
        const directors = en.credits.crew.filter((c) => c.job === 'Director');
        const writers = en.credits.crew.filter((c) =>
          c.job === 'Writer' || c.job === 'Screenplay' || c.job === 'Story'
        );

        for (const person of [...directors, ...writers]) {
          allPeopleIds.add(person.id);
          const role = directors.some((d) => d.id === person.id) ? 'director' : 'writer';
          await db.insert(schema.people).values({
            tmdbId: person.id,
            nameEn: person.name,
            photoPath: person.profile_path,
            knownFor: role as 'director' | 'writer',
            popularity: '0',
          }).onConflictDoNothing();

          const personRows = await db.select({ id: schema.people.id }).from(schema.people)
            .where(eq(schema.people.tmdbId, person.id));
          if (personRows.length > 0) {
            await db.insert(schema.contentPeople).values({
              contentId,
              personId: personRows[0].id,
              role: role as 'director' | 'writer',
              characterName: null,
              billingOrder: null,
            }).onConflictDoNothing();
          }
        }
      }

      processedSet.add(`m${tmdbId}`);

      if ((i + 1) % 100 === 0 || i === movieIds.length - 1) {
        progress.detailsProcessedIds = [...processedSet].map((s) => parseInt(s.slice(1), 10));
        saveProgress(progress);
        log(`[Phase 2] Movies: ${i + 1}/${movieIds.length} processed`);
      }
    } catch (err) {
      log(`[Phase 2] Error processing movie ${tmdbId}: ${(err as Error).message}`);
    }
  }

  // Process TV series
  const tvIds = progress.discoveredTvIds;
  log(`[Phase 2] Processing ${tvIds.length} TV series...`);

  for (let i = 0; i < tvIds.length; i++) {
    const tmdbId = tvIds[i];
    if (processedSet.has(`t${tmdbId}`)) continue;

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

      const runtime = en.episode_run_time && en.episode_run_time.length > 0
        ? en.episode_run_time[0]
        : null;

      const [contentRow] = await db.insert(schema.content).values({
        tmdbId: en.id,
        imdbId,
        contentType,
        titleEn: en.name,
        titleUk: hasUkTranslation ? uk.name! : null,
        originalTitle: en.original_name,
        overviewEn: en.overview || null,
        overviewUk: hasUkTranslation ? uk.overview || null : null,
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
        hasUkTranslation,
      }).onConflictDoUpdate({
        target: schema.content.tmdbId,
        set: {
          imdbId,
          contentType,
          titleEn: en.name,
          titleUk: hasUkTranslation ? uk.name! : null,
          originalTitle: en.original_name,
          overviewEn: en.overview || null,
          overviewUk: hasUkTranslation ? uk.overview || null : null,
          posterPath: en.poster_path,
          backdropPath: en.backdrop_path,
          releaseDate: en.first_air_date || null,
          runtime: runtime ? (runtime as number) : null,
          originalLanguage: en.original_language,
          productionCountries: en.production_countries?.map((c) => c.iso_3166_1) || [],
          tmdbRating: en.vote_average ? String(en.vote_average) : null,
          tmdbVoteCount: en.vote_count || 0,
          popularity: en.popularity ? String(en.popularity) : null,
          numberOfSeasons: en.number_of_seasons,
          numberOfEpisodes: en.number_of_episodes,
          hasUkTranslation,
        },
      }).returning({ id: schema.content.id });

      const contentId = contentRow.id;

      // content_genres
      for (const g of en.genres) {
        const genreDbId = genreTmdbToId.get(g.id);
        if (!genreDbId) continue;
        await db.insert(schema.contentGenres).values({
          contentId,
          genreId: genreDbId,
        }).onConflictDoNothing();
      }

      // keywords (TV uses "results" key)
      const kwList = en.keywords?.results || en.keywords?.keywords || [];
      for (const kw of kwList) {
        const [kwRow] = await db.insert(schema.keywords).values({
          tmdbId: kw.id,
          nameEn: kw.name,
        }).onConflictDoUpdate({
          target: schema.keywords.tmdbId,
          set: { nameEn: kw.name },
        }).returning({ id: schema.keywords.id });
        await db.insert(schema.contentKeywords).values({
          contentId,
          keywordId: kwRow.id,
        }).onConflictDoNothing();
      }

      // Streaming providers (UA)
      const tvProviders = en['watch/providers']?.results;
      if (tvProviders) {
        const uaProviders = tvProviders['UA'];
        if (uaProviders) {
          for (const pType of ['flatrate', 'rent', 'buy'] as const) {
            const pList = uaProviders[pType];
            if (!pList) continue;
            for (const p of pList) {
              const [provRow] = await db.insert(schema.streamingProviders).values({
                tmdbId: p.provider_id,
                name: p.provider_name,
                logoPath: p.logo_path,
              }).onConflictDoUpdate({
                target: schema.streamingProviders.tmdbId,
                set: { name: p.provider_name, logoPath: p.logo_path },
              }).returning({ id: schema.streamingProviders.id });
              await db.insert(schema.contentProviders).values({
                contentId,
                providerId: provRow.id,
                providerType: pType,
                country: 'UA',
              }).onConflictDoNothing();
            }
          }
        }
      }

      // Credits
      if (en.credits) {
        const topCast = en.credits.cast
          .sort((a, b) => a.order - b.order)
          .slice(0, 10);

        for (const actor of topCast) {
          allPeopleIds.add(actor.id);
          await db.insert(schema.people).values({
            tmdbId: actor.id,
            nameEn: actor.name,
            photoPath: actor.profile_path,
            knownFor: 'actor',
            popularity: '0',
          }).onConflictDoNothing();

          const personRows = await db.select({ id: schema.people.id }).from(schema.people)
            .where(eq(schema.people.tmdbId, actor.id));
          if (personRows.length > 0) {
            await db.insert(schema.contentPeople).values({
              contentId,
              personId: personRows[0].id,
              role: 'actor',
              characterName: actor.character || null,
              billingOrder: actor.order + 1,
            }).onConflictDoNothing();
          }
        }

        const directors = en.credits.crew.filter((c) => c.job === 'Director');
        const writers = en.credits.crew.filter((c) =>
          c.job === 'Writer' || c.job === 'Screenplay' || c.job === 'Story'
        );

        for (const person of [...directors, ...writers]) {
          allPeopleIds.add(person.id);
          const role = directors.some((d) => d.id === person.id) ? 'director' : 'writer';
          await db.insert(schema.people).values({
            tmdbId: person.id,
            nameEn: person.name,
            photoPath: person.profile_path,
            knownFor: role as 'director' | 'writer',
            popularity: '0',
          }).onConflictDoNothing();

          const personRows = await db.select({ id: schema.people.id }).from(schema.people)
            .where(eq(schema.people.tmdbId, person.id));
          if (personRows.length > 0) {
            await db.insert(schema.contentPeople).values({
              contentId,
              personId: personRows[0].id,
              role: role as 'director' | 'writer',
              characterName: null,
              billingOrder: null,
            }).onConflictDoNothing();
          }
        }
      }

      processedSet.add(`t${tmdbId}`);

      if ((i + 1) % 100 === 0 || i === tvIds.length - 1) {
        progress.detailsProcessedIds = [...processedSet].map((s) => parseInt(s.slice(1), 10));
        saveProgress(progress);
        log(`[Phase 2] TV: ${i + 1}/${tvIds.length} processed`);
      }
    } catch (err) {
      log(`[Phase 2] Error processing TV ${tmdbId}: ${(err as Error).message}`);
    }
  }

  // Store all discovered people IDs for phase 3
  progress.peopleProcessedIds = []; // reset — will be filled in phase 3
  progress.phases['details'] = 'complete';
  saveProgress(progress);

  log(`[Phase 2] Details complete. ${allPeopleIds.size} unique people collected.`);
}

// ─── Phase 3: People ────────────────────────────────────────────────────────

async function phasePeople(progress: SeedProgress): Promise<void> {
  log('[Phase 3] Fetching people details...');

  // Get all people tmdb IDs from the database (stubs created in Phase 2)
  const allPeopleRows = await db.select({
    id: schema.people.id,
    tmdbId: schema.people.tmdbId,
  }).from(schema.people);

  const processedSet = new Set<number>(progress.peopleProcessedIds);
  const toProcess = allPeopleRows.filter((p) => !processedSet.has(p.tmdbId));

  log(`[Phase 3] ${toProcess.length} people to fetch (${processedSet.size} already done)`);

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

      processedSet.add(tmdbId);

      if ((i + 1) % 200 === 0 || i === toProcess.length - 1) {
        progress.peopleProcessedIds = [...processedSet];
        saveProgress(progress);
        log(`[Phase 3] People: ${i + 1}/${toProcess.length} processed`);
      }
    } catch (err) {
      log(`[Phase 3] Error processing person ${tmdbId}: ${(err as Error).message}`);
    }
  }

  progress.phases['people'] = 'complete';
  saveProgress(progress);
  log(`[Phase 3] People complete.`);
}

// ─── Phase 4: Oscar Cross-Reference ────────────────────────────────────────

async function phaseOscars(progress: SeedProgress): Promise<void> {
  log('[Phase 4] Importing Oscar data...');

  // Fetch Oscar CSV
  log('[Phase 4] Downloading Oscar data CSV...');
  const response = await fetch(OSCAR_CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Oscar data: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();

  // Parse CSV
  const lines = csvText.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    log('[Phase 4] No Oscar data found in CSV.');
    progress.phases['oscars'] = 'complete';
    saveProgress(progress);
    return;
  }

  // Parse header to find column indices (CSV may be tab-separated or comma-separated)
  const isTabSeparated = lines[0].includes('\t');
  const parseLine = isTabSeparated ? (line: string) => line.split('\t').map((f) => f.trim()) : parseCSVLine;
  const header = parseLine(lines[0]);
  const colIndex: Record<string, number> = {};
  header.forEach((col, idx) => { colIndex[col.toLowerCase()] = idx; });

  // New CSV format: Ceremony, Year, Class, CanonicalCategory, Category, Film, FilmId, Name, Nominees, NomineeIds, Winner, ...
  const yearCol = colIndex['year_ceremony'] ?? colIndex['year'] ?? -1;
  const categoryCol = colIndex['canonicalcategory'] ?? colIndex['category'] ?? -1;
  const filmCol = colIndex['film'] ?? colIndex['name'] ?? -1;
  const filmIdCol = colIndex['filmid'] ?? -1;
  const nomineeCol = colIndex['name'] ?? colIndex['nominee'] ?? -1;
  const winnerCol = colIndex['winner'] ?? colIndex['won'] ?? -1;

  if (categoryCol === -1 || filmCol === -1) {
    log('[Phase 4] Could not parse Oscar CSV columns. Header: ' + header.join(', '));
    progress.phases['oscars'] = 'complete';
    saveProgress(progress);
    return;
  }

  // Build imdb_id -> content_id lookup
  const contentRows = await db.select({
    id: schema.content.id,
    imdbId: schema.content.imdbId,
    titleEn: schema.content.titleEn,
  }).from(schema.content);

  const imdbToContentId = new Map<string, number>();
  const titleToContentId = new Map<string, number>();
  for (const row of contentRows) {
    if (row.imdbId) imdbToContentId.set(row.imdbId, row.id);
    titleToContentId.set(row.titleEn.toLowerCase(), row.id);
  }

  // Build person name -> id lookup
  const peopleRows = await db.select({
    id: schema.people.id,
    nameEn: schema.people.nameEn,
  }).from(schema.people);

  const personNameToId = new Map<string, number>();
  for (const row of peopleRows) {
    personNameToId.set(row.nameEn.toLowerCase(), row.id);
  }

  let inserted = 0;
  let skipped = 0;

  for (let li = 1; li < lines.length; li++) {
    const fields = parseLine(lines[li]);
    if (fields.length <= Math.max(yearCol, categoryCol, filmCol)) continue;

    const yearStr = yearCol >= 0 ? (fields[yearCol] || '') : '';
    // Handle "1927/28" format — extract first 4-digit year
    const yearMatch = yearStr.match(/(\d{4})/);
    const yearRaw = yearMatch ? parseInt(yearMatch[1], 10) : 0;
    if (yearRaw < 1970) continue; // Only 1970+

    const category = fields[categoryCol] || '';
    const film = fields[filmCol] || '';
    const filmIds = filmIdCol >= 0 ? (fields[filmIdCol] || '') : '';
    const nominee = nomineeCol >= 0 ? (fields[nomineeCol] || '') : '';
    const won = winnerCol >= 0 ? (fields[winnerCol]?.toLowerCase() === 'true' || fields[winnerCol] === '1') : false;

    const mappedCategory = mapOscarCategory(category);

    // Match film to content
    let contentId: number | undefined;

    // Try IMDB ID match first (pipe-separated in new format)
    if (!contentId && filmIds) {
      for (const fid of filmIds.split('|')) {
        const trimmed = fid.trim();
        if (trimmed && imdbToContentId.has(trimmed)) {
          contentId = imdbToContentId.get(trimmed);
          break;
        }
      }
    }

    // Try title match (pipe-separated films in new format)
    if (!contentId && film) {
      for (const f of film.split('|')) {
        const trimmed = f.trim().toLowerCase();
        if (trimmed && titleToContentId.has(trimmed)) {
          contentId = titleToContentId.get(trimmed);
          break;
        }
      }
    }

    if (!contentId) {
      skipped++;
      continue;
    }

    // Match person if applicable
    let personId: number | null = null;
    if (nominee && ['actor', 'actress', 'supporting_actor', 'supporting_actress', 'director'].includes(mappedCategory)) {
      personId = personNameToId.get(nominee.toLowerCase()) ?? null;
    }

    try {
      await db.insert(schema.awards).values({
        contentId,
        personId,
        ceremonyYear: yearRaw,
        category: mappedCategory as any,
        categoryDetail: category,
        won,
      }).onConflictDoNothing();
      inserted++;
    } catch (err) {
      // skip duplicate or FK errors
    }
  }

  log(`[Phase 4] Oscar data: ${inserted} awards inserted, ${skipped} unmatched films skipped.`);
  progress.oscarsComplete = true;
  progress.phases['oscars'] = 'complete';
  saveProgress(progress);
}

// ─── Phase 5: Compute Quality Scores ────────────────────────────────────────

async function phaseScores(progress: SeedProgress): Promise<void> {
  log('[Phase 5] Computing base quality scores...');

  // Run the quality score computation as raw SQL for efficiency
  await db.execute(sql`
    UPDATE content SET base_quality_score = (
      -- TMDB rating (0-1) * 0.25
      COALESCE(tmdb_rating / 10.0, 0) * 0.25
      -- IMDB rating (0-1) * 0.25
      + COALESCE(imdb_rating / 10.0, 0) * 0.25
      -- Popularity (log-normalized) * 0.15
      + LEAST(
          LN(GREATEST(COALESCE(popularity, 0)::numeric, 1)) /
          NULLIF(LN(GREATEST((SELECT MAX(popularity) FROM content)::numeric, 2)), 0),
          1.0
        ) * 0.15
      -- Revenue (log-normalized) * 0.10
      + LEAST(
          LN(GREATEST(COALESCE(revenue, 0)::numeric + 1, 1)) /
          NULLIF(LN(GREATEST((SELECT MAX(revenue) FROM content)::numeric + 1, 2)), 0),
          1.0
        ) * 0.10
      -- Oscar bonus * 0.15
      + COALESCE((
          SELECT CASE
            WHEN bool_or(won) THEN 1.0
            WHEN COUNT(*) > 0 THEN 0.6
            ELSE 0.0
          END
          FROM awards WHERE awards.content_id = content.id
        ), 0) * 0.15
      -- Vote count confidence * 0.10
      + LEAST(COALESCE(tmdb_vote_count, 0)::numeric / 1000.0, 1.0) * 0.10
    )
  `);

  progress.scoresComplete = true;
  progress.phases['scores'] = 'complete';
  saveProgress(progress);
  log('[Phase 5] Quality scores computed.');
}

// ─── Phase 6: IDF Cache ────────────────────────────────────────────────────

async function phaseIdf(progress: SeedProgress): Promise<void> {
  log('[Phase 6] Computing IDF cache...');

  // Genre IDF
  await db.execute(sql`
    INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
    SELECT
      'genre'::entity_type,
      cg.genre_id,
      LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT cg.content_id), 1)),
      COUNT(DISTINCT cg.content_id)::int
    FROM content_genres cg
    GROUP BY cg.genre_id
    ON CONFLICT (entity_type, entity_id) DO UPDATE
      SET idf_weight = EXCLUDED.idf_weight,
          content_count = EXCLUDED.content_count,
          updated_at = NOW()
  `);
  log('[Phase 6] Genre IDF done.');

  // Director IDF
  await db.execute(sql`
    INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
    SELECT
      'director'::entity_type,
      cp.person_id,
      LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT cp.content_id), 1)),
      COUNT(DISTINCT cp.content_id)::int
    FROM content_people cp
    WHERE cp.role = 'director'
    GROUP BY cp.person_id
    ON CONFLICT (entity_type, entity_id) DO UPDATE
      SET idf_weight = EXCLUDED.idf_weight,
          content_count = EXCLUDED.content_count,
          updated_at = NOW()
  `);
  log('[Phase 6] Director IDF done.');

  // Actor IDF
  await db.execute(sql`
    INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
    SELECT
      'actor'::entity_type,
      cp.person_id,
      LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT cp.content_id), 1)),
      COUNT(DISTINCT cp.content_id)::int
    FROM content_people cp
    WHERE cp.role = 'actor'
    GROUP BY cp.person_id
    ON CONFLICT (entity_type, entity_id) DO UPDATE
      SET idf_weight = EXCLUDED.idf_weight,
          content_count = EXCLUDED.content_count,
          updated_at = NOW()
  `);
  log('[Phase 6] Actor IDF done.');

  // Keyword IDF
  await db.execute(sql`
    INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
    SELECT
      'keyword'::entity_type,
      ck.keyword_id,
      LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT ck.content_id), 1)),
      COUNT(DISTINCT ck.content_id)::int
    FROM content_keywords ck
    GROUP BY ck.keyword_id
    ON CONFLICT (entity_type, entity_id) DO UPDATE
      SET idf_weight = EXCLUDED.idf_weight,
          content_count = EXCLUDED.content_count,
          updated_at = NOW()
  `);
  log('[Phase 6] Keyword IDF done.');

  // Decade IDF
  await db.execute(sql`
    INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
    SELECT
      'decade'::entity_type,
      (EXTRACT(YEAR FROM c.release_date)::int / 10 * 10),
      LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(*), 1)),
      COUNT(*)::int
    FROM content c
    WHERE c.release_date IS NOT NULL
    GROUP BY (EXTRACT(YEAR FROM c.release_date)::int / 10 * 10)
    ON CONFLICT (entity_type, entity_id) DO UPDATE
      SET idf_weight = EXCLUDED.idf_weight,
          content_count = EXCLUDED.content_count,
          updated_at = NOW()
  `);
  log('[Phase 6] Decade IDF done.');

  // Collection IDF
  await db.execute(sql`
    INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
    SELECT
      'collection'::entity_type,
      cc.collection_id,
      LN(GREATEST((SELECT COUNT(*) FROM content)::numeric, 1) / GREATEST(COUNT(DISTINCT cc.content_id), 1)),
      COUNT(DISTINCT cc.content_id)::int
    FROM content_collections cc
    GROUP BY cc.collection_id
    ON CONFLICT (entity_type, entity_id) DO UPDATE
      SET idf_weight = EXCLUDED.idf_weight,
          content_count = EXCLUDED.content_count,
          updated_at = NOW()
  `);
  log('[Phase 6] Collection IDF done.');

  // Seed entity_type_weights
  log('[Phase 6] Seeding entity_type_weights...');
  const weights: Array<{ entityType: any; weight: string }> = [
    { entityType: 'director', weight: '1.50' },
    { entityType: 'genre', weight: '1.00' },
    { entityType: 'actor', weight: '0.80' },
    { entityType: 'keyword', weight: '0.60' },
    { entityType: 'collection', weight: '0.50' },
    { entityType: 'decade', weight: '0.30' },
  ];

  for (const w of weights) {
    await db.insert(schema.entityTypeWeights).values({
      entityType: w.entityType,
      weight: w.weight,
    }).onConflictDoUpdate({
      target: schema.entityTypeWeights.entityType,
      set: { weight: w.weight },
    });
  }

  // Seed onboarding movies
  log('[Phase 6] Seeding onboarding movies...');
  const onboardingTitles = [
    'The Shawshank Redemption', 'The Dark Knight', 'Inception',
    'Forrest Gump', 'Titanic', 'The Matrix',
    'Pulp Fiction', 'Interstellar', 'Parasite',
    'Get Out', 'The Notebook', 'Toy Story',
  ];

  for (let idx = 0; idx < onboardingTitles.length; idx++) {
    const title = onboardingTitles[idx];
    const rows = await db.select({ id: schema.content.id }).from(schema.content)
      .where(eq(schema.content.titleEn, title))
      .limit(1);
    if (rows.length > 0) {
      await db.insert(schema.onboardingSeeds).values({
        contentId: rows[0].id,
        displayOrder: idx + 1,
        isActive: true,
      }).onConflictDoNothing();
    }
  }

  progress.idfComplete = true;
  progress.phases['idf'] = 'complete';
  saveProgress(progress);
  log('[Phase 6] IDF cache and seed data complete.');
}

// ─── Main ───────────────────────────────────────────────────────────────────

const PHASES: Record<string, (progress: SeedProgress) => Promise<void>> = {
  discover: phaseDiscover,
  details: phaseDetails,
  people: phasePeople,
  oscars: phaseOscars,
  scores: phaseScores,
  idf: phaseIdf,
};

const PHASE_ORDER = ['discover', 'details', 'people', 'oscars', 'scores', 'idf'];

async function main(): Promise<void> {
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY is not set. Add it to .env file.');
    process.exit(1);
  }

  // Parse CLI args
  const args = process.argv.slice(2);
  let targetPhase: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phase' && args[i + 1]) {
      targetPhase = args[i + 1];
      i++;
    }
  }

  if (targetPhase && !PHASES[targetPhase]) {
    console.error(`Unknown phase: "${targetPhase}". Available: ${PHASE_ORDER.join(', ')}`);
    process.exit(1);
  }

  const progress = loadProgress();

  log('=== pickme.mov Data Seeder ===');
  log(`Database: ${DATABASE_URL.replace(/\/\/.*@/, '//<credentials>@')}`);

  const phasesToRun = targetPhase ? [targetPhase] : PHASE_ORDER;

  for (const phase of phasesToRun) {
    if (!targetPhase && progress.phases[phase] === 'complete') {
      log(`[${phase}] Already complete. Skipping. (Use --phase ${phase} to force re-run)`);
      continue;
    }

    progress.phases[phase] = 'running';
    saveProgress(progress);

    const startTime = Date.now();
    log(`\n--- Starting phase: ${phase} ---`);

    await PHASES[phase](progress);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`--- Phase ${phase} completed in ${elapsed}s ---\n`);
  }

  log('=== Seeding complete! ===');

  // Print summary
  const contentCount = await db.select({ count: sql<number>`count(*)` }).from(schema.content);
  const peopleCount = await db.select({ count: sql<number>`count(*)` }).from(schema.people);
  const genreCount = await db.select({ count: sql<number>`count(*)` }).from(schema.genres);
  const keywordCount = await db.select({ count: sql<number>`count(*)` }).from(schema.keywords);
  const awardCount = await db.select({ count: sql<number>`count(*)` }).from(schema.awards);
  const idfCount = await db.select({ count: sql<number>`count(*)` }).from(schema.entityIdfCache);

  log('--- Summary ---');
  log(`Content:    ${contentCount[0].count}`);
  log(`People:     ${peopleCount[0].count}`);
  log(`Genres:     ${genreCount[0].count}`);
  log(`Keywords:   ${keywordCount[0].count}`);
  log(`Awards:     ${awardCount[0].count}`);
  log(`IDF Cache:  ${idfCount[0].count}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  pool.end();
  process.exit(1);
});
