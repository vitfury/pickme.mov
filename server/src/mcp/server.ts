import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from '../db/index.js';
import { searchTitles, getTitleDetails, listFilters, getTaste } from './queries.js';
import { markWatched, rateTitle, bookmarkTitle } from './mutations.js';

// Compact, not pretty-printed: indentation on a 150-title result set costs
// thousands of tokens and buys the model nothing.
const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }],
});

const SERVER_INSTRUCTIONS = `pickme.mov is the user's personal film and series catalogue.

Work in two stages. This server does the deterministic half — filtering by the
facts a database can hold (genre, year, runtime, rating, cast, keywords, whether
the user has already seen it). You do the judgement half: qualities like
"spectacular", "slow-burn" or "has large-scale battles" are not columns here, so
search wide on the hard filters and then read the returned overviews and
keywords to pick what actually fits.

A typical request: call search_titles with the objective filters and a limit of
100-200, judge the results yourself, then call get_title_details on the handful
you shortlisted before recommending them.

Watched titles are excluded by default, because the usual question is what to
watch next. When the user mentions having seen something, record it with
mark_watched — most of their viewing history predates this app and is not in the
database yet.`;

export function buildMcpServer(db: Database, userId: number): McpServer {
  const server = new McpServer(
    { name: 'pickme.mov', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    'search_titles',
    {
      title: 'Search the catalogue',
      description:
        'Filter the catalogue on objective criteria and return a broad candidate set to choose from. ' +
        'Every hit carries its genres, TMDB keywords and a short overview — those are what you judge ' +
        'subjective qualities from, since the database cannot express them. Prefer a wide net (limit ' +
        '100-200) plus your own selection over a narrow query. Titles the user has already watched are ' +
        'excluded unless `seen` says otherwise. Use list_filters to learn the valid genre and provider names.',
      inputSchema: {
        query: z.string().optional().describe('Fuzzy match against the title'),
        contentType: z.enum(['movie', 'series', 'animation']).optional().describe('Defaults to movie'),
        genres: z.array(z.string()).optional().describe('Include titles in ANY of these genres, by name'),
        excludeGenres: z.array(z.string()).optional(),
        keywords: z.array(z.string()).optional().describe('TMDB keywords, e.g. "superhero", "heist", "time travel"'),
        people: z.array(z.string()).optional().describe('Actor, director or writer names'),
        providers: z.array(z.string()).optional().describe('Streaming services the title is available on'),
        countries: z.array(z.string()).optional().describe('ISO country codes of production'),
        excludeCountries: z.array(z.string()).optional(),
        originalLanguage: z.string().optional().describe('ISO 639-1 code'),
        certification: z.array(z.string()).optional(),
        yearFrom: z.number().int().optional(),
        yearTo: z.number().int().optional(),
        runtimeMin: z.number().int().optional().describe('Minutes'),
        runtimeMax: z.number().int().optional(),
        minRating: z.number().optional().describe('IMDb rating, falling back to TMDB, 0-10'),
        minVotes: z.number().int().optional().describe('Filters out obscure titles with unreliable ratings'),
        awarded: z.enum(['winner', 'nominated']).optional().describe('Oscar winners or nominees only'),
        seen: z
          .enum(['exclude_watched', 'only_watched', 'exclude_any_swipe', 'all'])
          .optional()
          .describe('Default exclude_watched. Use only_watched to search the user\'s viewing history'),
        sort: z.enum(['quality', 'rating', 'popularity', 'year_desc', 'year_asc', 'random']).optional(),
        limit: z.number().int().min(1).max(200).optional().describe('Default 100, max 200'),
        includeOverview: z.boolean().optional().describe('Set false to save tokens when overviews are not needed'),
      },
    },
    async (args) => json(await searchTitles(db, userId, args)),
  );

  server.registerTool(
    'get_title_details',
    {
      title: 'Get full details',
      description:
        'Full record for up to 20 titles: complete overview, cast with characters, directors, writers, ' +
        'every keyword, Oscar history, streaming availability, and whether the user has seen it. ' +
        'Call this on your shortlist after search_titles, not on the whole result set.',
      inputSchema: {
        ids: z.array(z.number().int()).min(1).max(20).describe('Title ids from search_titles'),
      },
    },
    async ({ ids }) => json(await getTitleDetails(db, userId, ids)),
  );

  server.registerTool(
    'mark_watched',
    {
      title: 'Mark titles as watched',
      description:
        'Record that the user has seen these titles, with no opinion attached. Watched titles stop ' +
        'appearing in the app\'s swipe feed and in future searches. Accepts several ids at once, so ' +
        'when checking a list with the user ("which of these have you seen?"), mark them in one call. ' +
        'Set watched=false to undo a mistake. To record an opinion as well, use rate_title instead.',
      inputSchema: {
        ids: z.array(z.number().int()).min(1).max(100),
        watched: z.boolean().optional().describe('Default true; false retracts the record'),
        watchedDate: z.string().optional().describe('ISO date, if the user says when they saw it'),
      },
    },
    async ({ ids, watched, watchedDate }) =>
      json(await markWatched(db, userId, ids, watched !== false, watchedDate)),
  );

  server.registerTool(
    'rate_title',
    {
      title: 'Like or dislike a title',
      description:
        'Record the user\'s opinion, exactly as swiping in the app would: it trains their recommendation ' +
        'profile and marks the title watched. Only use this when the user actually expresses an opinion ' +
        'about something they have seen — never infer it from interest in a recommendation.',
      inputSchema: {
        id: z.number().int(),
        opinion: z.enum(['like', 'dislike']),
      },
    },
    async ({ id, opinion }) => json(await rateTitle(db, userId, id, opinion)),
  );

  server.registerTool(
    'bookmark_title',
    {
      title: 'Save titles for later',
      description:
        'Put titles on the user\'s saved list, the same list the bookmark button in the app writes to. ' +
        'Use this when they want to keep something for later rather than decide on it now — "sounds good, ' +
        'remind me", "save that one". Set bookmarked=false to take a title back off the list. A title the ' +
        'user has already watched cannot be bookmarked, because the app clears bookmarks once something is seen.',
      inputSchema: {
        ids: z.array(z.number().int()).min(1).max(50),
        bookmarked: z.boolean().optional().describe('Default true; false removes them from the list'),
      },
    },
    async ({ ids, bookmarked }) => json(await bookmarkTitle(db, userId, ids, bookmarked !== false)),
  );

  server.registerTool(
    'get_my_taste',
    {
      title: 'Get the user\'s taste profile',
      description:
        'What the app has learned from the user\'s swipes: highest-scoring genres, people and keywords, ' +
        'counts of likes, dislikes and titles watched, plus their 30 most recent opinions. Read this ' +
        'before recommending, to ground your picks in what they actually like.',
      inputSchema: {},
    },
    async () => json(await getTaste(db, userId)),
  );

  server.registerTool(
    'list_filters',
    {
      title: 'List valid filter values',
      description:
        'The genre names, streaming providers, certifications and year range the catalogue actually ' +
        'contains. Call this once before a first search so filters match real values instead of guesses.',
      inputSchema: {},
    },
    async () => json(await listFilters(db)),
  );

  return server;
}
