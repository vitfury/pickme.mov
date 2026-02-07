import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  integer,
  smallint,
  boolean,
  date,
  timestamp,
  numeric,
  bigint,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────────────────────────

export const contentTypeEnum = pgEnum('content_type', ['movie', 'series', 'animation']);
export const swipeActionEnum = pgEnum('swipe_action', ['like', 'dislike', 'superlike']);
export const personRoleEnum = pgEnum('person_role', ['actor', 'director', 'writer']);
export const providerTypeEnum = pgEnum('provider_type', ['flatrate', 'rent', 'buy']);
export const entityTypeEnum = pgEnum('entity_type', [
  'genre', 'actor', 'director', 'keyword', 'decade', 'collection',
]);
export const awardCategoryTypeEnum = pgEnum('award_category_type', [
  'picture', 'director', 'actor', 'actress', 'supporting_actor',
  'supporting_actress', 'screenplay', 'cinematography', 'score',
  'song', 'animated', 'international', 'other',
]);

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  googleId: varchar('google_id', { length: 255 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  locale: varchar('locale', { length: 10 }).default('uk'),
  theme: varchar('theme', { length: 10 }).default('dark'),
  maturityScore: smallint('maturity_score').default(0),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_users_google_id').on(table.googleId),
]);

// ─── Content ─────────────────────────────────────────────────────────────────

export const content = pgTable('content', {
  id: serial('id').primaryKey(),
  tmdbId: integer('tmdb_id').unique().notNull(),
  imdbId: varchar('imdb_id', { length: 20 }),
  contentType: contentTypeEnum('content_type').notNull(),

  titleEn: varchar('title_en', { length: 500 }).notNull(),
  titleUk: varchar('title_uk', { length: 500 }),
  originalTitle: varchar('original_title', { length: 500 }),

  overviewEn: text('overview_en'),
  overviewUk: text('overview_uk'),

  posterPath: varchar('poster_path', { length: 255 }),
  backdropPath: varchar('backdrop_path', { length: 255 }),

  releaseDate: date('release_date'),
  runtime: smallint('runtime'),
  certification: varchar('certification', { length: 10 }),
  originalLanguage: varchar('original_language', { length: 10 }),
  productionCountries: text('production_countries').array(),

  tmdbRating: numeric('tmdb_rating', { precision: 3, scale: 1 }),
  tmdbVoteCount: integer('tmdb_vote_count').default(0),
  imdbRating: numeric('imdb_rating', { precision: 3, scale: 1 }),
  popularity: numeric('popularity', { precision: 10, scale: 2 }),
  revenue: bigint('revenue', { mode: 'number' }).default(0),

  numberOfSeasons: smallint('number_of_seasons'),
  numberOfEpisodes: smallint('number_of_episodes'),

  baseQualityScore: numeric('base_quality_score', { precision: 5, scale: 4 }).default('0'),

  hasUkTranslation: boolean('has_uk_translation').default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_content_type').on(table.contentType),
  index('idx_content_quality').on(table.contentType, table.baseQualityScore),
  index('idx_content_tmdb_id').on(table.tmdbId),
  index('idx_content_imdb_id').on(table.imdbId),
  index('idx_content_release_date').on(table.releaseDate),
  index('idx_content_popularity').on(table.popularity),
]);

// ─── Genres ──────────────────────────────────────────────────────────────────

export const genres = pgTable('genres', {
  id: serial('id').primaryKey(),
  tmdbId: integer('tmdb_id').unique().notNull(),
  nameEn: varchar('name_en', { length: 100 }).notNull(),
  nameUk: varchar('name_uk', { length: 100 }),
  emoji: varchar('emoji', { length: 10 }),
});

export const contentGenres = pgTable('content_genres', {
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  genreId: integer('genre_id').notNull().references(() => genres.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.contentId, table.genreId] }),
  index('idx_content_genres_genre').on(table.genreId),
  index('idx_content_genres_content').on(table.contentId),
]);

// ─── People ──────────────────────────────────────────────────────────────────

export const people = pgTable('people', {
  id: serial('id').primaryKey(),
  tmdbId: integer('tmdb_id').unique().notNull(),
  nameEn: varchar('name_en', { length: 255 }).notNull(),
  nameUk: varchar('name_uk', { length: 255 }),
  photoPath: varchar('photo_path', { length: 255 }),
  biographyEn: text('biography_en'),
  biographyUk: text('biography_uk'),
  knownFor: personRoleEnum('known_for'),
  popularity: numeric('popularity', { precision: 10, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_people_tmdb_id').on(table.tmdbId),
  index('idx_people_popularity').on(table.popularity),
]);

// ─── Content-People Junction ─────────────────────────────────────────────────

export const contentPeople = pgTable('content_people', {
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  personId: integer('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  role: personRoleEnum('role').notNull(),
  characterName: varchar('character_name', { length: 255 }),
  billingOrder: smallint('billing_order'),
}, (table) => [
  primaryKey({ columns: [table.contentId, table.personId, table.role] }),
  index('idx_content_people_person').on(table.personId),
  index('idx_content_people_content').on(table.contentId),
  index('idx_content_people_role').on(table.role),
  index('idx_content_people_billing').on(table.contentId, table.role, table.billingOrder),
]);

// ─── Keywords ────────────────────────────────────────────────────────────────

export const keywords = pgTable('keywords', {
  id: serial('id').primaryKey(),
  tmdbId: integer('tmdb_id').unique().notNull(),
  nameEn: varchar('name_en', { length: 255 }).notNull(),
  nameUk: varchar('name_uk', { length: 255 }),
});

export const contentKeywords = pgTable('content_keywords', {
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  keywordId: integer('keyword_id').notNull().references(() => keywords.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.contentId, table.keywordId] }),
  index('idx_content_keywords_keyword').on(table.keywordId),
  index('idx_content_keywords_content').on(table.contentId),
]);

// ─── Collections ─────────────────────────────────────────────────────────────

export const collections = pgTable('collections', {
  id: serial('id').primaryKey(),
  tmdbId: integer('tmdb_id').unique(),
  nameEn: varchar('name_en', { length: 255 }).notNull(),
  nameUk: varchar('name_uk', { length: 255 }),
  descriptionEn: text('description_en'),
  descriptionUk: text('description_uk'),
  posterPath: varchar('poster_path', { length: 255 }),
  isCurated: boolean('is_curated').default(false),
});

export const contentCollections = pgTable('content_collections', {
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  collectionId: integer('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  displayOrder: smallint('display_order'),
}, (table) => [
  primaryKey({ columns: [table.contentId, table.collectionId] }),
  index('idx_content_collections_collection').on(table.collectionId),
  index('idx_content_collections_content').on(table.contentId),
]);

// ─── Awards ──────────────────────────────────────────────────────────────────

export const awards = pgTable('awards', {
  id: serial('id').primaryKey(),
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  personId: integer('person_id').references(() => people.id, { onDelete: 'set null' }),
  ceremonyYear: smallint('ceremony_year').notNull(),
  category: awardCategoryTypeEnum('category').notNull(),
  categoryDetail: varchar('category_detail', { length: 255 }),
  won: boolean('won').default(false),
}, (table) => [
  uniqueIndex('awards_unique').on(table.contentId, table.personId, table.ceremonyYear, table.category),
  index('idx_awards_content').on(table.contentId),
  index('idx_awards_person').on(table.personId),
  index('idx_awards_won').on(table.won),
]);

// ─── Streaming Providers ─────────────────────────────────────────────────────

export const streamingProviders = pgTable('streaming_providers', {
  id: serial('id').primaryKey(),
  tmdbId: integer('tmdb_id').unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  logoPath: varchar('logo_path', { length: 255 }),
});

export const contentProviders = pgTable('content_providers', {
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  providerId: integer('provider_id').notNull().references(() => streamingProviders.id, { onDelete: 'cascade' }),
  providerType: providerTypeEnum('provider_type').notNull(),
  country: varchar('country', { length: 5 }).default('UA'),
}, (table) => [
  primaryKey({ columns: [table.contentId, table.providerId, table.providerType, table.country] }),
  index('idx_content_providers_content').on(table.contentId),
  index('idx_content_providers_provider').on(table.providerId),
]);

// ─── User Swipes ─────────────────────────────────────────────────────────────

export const userSwipes = pgTable('user_swipes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  action: swipeActionEnum('action').notNull(),
  contentType: contentTypeEnum('content_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('user_swipes_user_content_unique').on(table.userId, table.contentId),
  index('idx_user_swipes_user_content').on(table.userId, table.contentId),
  index('idx_user_swipes_user_action').on(table.userId, table.action),
  index('idx_user_swipes_user_type').on(table.userId, table.contentType),
  index('idx_user_swipes_created').on(table.userId, table.createdAt),
]);

// ─── User Preferences ────────────────────────────────────────────────────────

export const userPreferences = pgTable('user_preferences', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: entityTypeEnum('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  rawScore: numeric('raw_score', { precision: 8, scale: 4 }).default('0'),
  interactionCount: integer('interaction_count').default(0),
  lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.entityType, table.entityId] }),
  index('idx_user_prefs_user').on(table.userId),
  index('idx_user_prefs_lookup').on(table.userId, table.entityType, table.entityId),
]);

// ─── User Watchlist ──────────────────────────────────────────────────────────

export const userWatchlist = pgTable('user_watchlist', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  watched: boolean('watched').default(false),
  personalRating: smallint('personal_rating'),
  watchedDate: date('watched_date'),
  notes: text('notes'),
  sortOrder: integer('sort_order'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('user_watchlist_user_content_unique').on(table.userId, table.contentId),
  index('idx_watchlist_user').on(table.userId),
  index('idx_watchlist_user_watched').on(table.userId, table.watched),
  index('idx_watchlist_user_order').on(table.userId, table.sortOrder),
  check('personal_rating_check', sql`personal_rating BETWEEN 1 AND 10`),
]);

// ─── Entity IDF Cache ────────────────────────────────────────────────────────

export const entityIdfCache = pgTable('entity_idf_cache', {
  entityType: entityTypeEnum('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  idfWeight: numeric('idf_weight', { precision: 6, scale: 4 }).notNull(),
  contentCount: integer('content_count').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.entityType, table.entityId] }),
]);

// ─── Onboarding Seeds ────────────────────────────────────────────────────────

export const onboardingSeeds = pgTable('onboarding_seeds', {
  id: serial('id').primaryKey(),
  contentId: integer('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  displayOrder: smallint('display_order').notNull(),
  isActive: boolean('is_active').default(true),
});

// ─── Entity Type Weights ─────────────────────────────────────────────────────

export const entityTypeWeights = pgTable('entity_type_weights', {
  entityType: entityTypeEnum('entity_type').primaryKey(),
  weight: numeric('weight', { precision: 4, scale: 2 }).notNull(),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  swipes: many(userSwipes),
  preferences: many(userPreferences),
  watchlist: many(userWatchlist),
}));

export const contentRelations = relations(content, ({ many }) => ({
  genres: many(contentGenres),
  people: many(contentPeople),
  keywords: many(contentKeywords),
  collections: many(contentCollections),
  providers: many(contentProviders),
  awards: many(awards),
  swipes: many(userSwipes),
  watchlistEntries: many(userWatchlist),
  onboardingSeeds: many(onboardingSeeds),
}));

export const genresRelations = relations(genres, ({ many }) => ({
  content: many(contentGenres),
}));

export const contentGenresRelations = relations(contentGenres, ({ one }) => ({
  content: one(content, { fields: [contentGenres.contentId], references: [content.id] }),
  genre: one(genres, { fields: [contentGenres.genreId], references: [genres.id] }),
}));

export const peopleRelations = relations(people, ({ many }) => ({
  content: many(contentPeople),
  awards: many(awards),
}));

export const contentPeopleRelations = relations(contentPeople, ({ one }) => ({
  content: one(content, { fields: [contentPeople.contentId], references: [content.id] }),
  person: one(people, { fields: [contentPeople.personId], references: [people.id] }),
}));

export const keywordsRelations = relations(keywords, ({ many }) => ({
  content: many(contentKeywords),
}));

export const contentKeywordsRelations = relations(contentKeywords, ({ one }) => ({
  content: one(content, { fields: [contentKeywords.contentId], references: [content.id] }),
  keyword: one(keywords, { fields: [contentKeywords.keywordId], references: [keywords.id] }),
}));

export const collectionsRelations = relations(collections, ({ many }) => ({
  content: many(contentCollections),
}));

export const contentCollectionsRelations = relations(contentCollections, ({ one }) => ({
  content: one(content, { fields: [contentCollections.contentId], references: [content.id] }),
  collection: one(collections, { fields: [contentCollections.collectionId], references: [collections.id] }),
}));

export const awardsRelations = relations(awards, ({ one }) => ({
  content: one(content, { fields: [awards.contentId], references: [content.id] }),
  person: one(people, { fields: [awards.personId], references: [people.id] }),
}));

export const streamingProvidersRelations = relations(streamingProviders, ({ many }) => ({
  content: many(contentProviders),
}));

export const contentProvidersRelations = relations(contentProviders, ({ one }) => ({
  content: one(content, { fields: [contentProviders.contentId], references: [content.id] }),
  provider: one(streamingProviders, { fields: [contentProviders.providerId], references: [streamingProviders.id] }),
}));

export const userSwipesRelations = relations(userSwipes, ({ one }) => ({
  user: one(users, { fields: [userSwipes.userId], references: [users.id] }),
  content: one(content, { fields: [userSwipes.contentId], references: [content.id] }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, { fields: [userPreferences.userId], references: [users.id] }),
}));

export const userWatchlistRelations = relations(userWatchlist, ({ one }) => ({
  user: one(users, { fields: [userWatchlist.userId], references: [users.id] }),
  content: one(content, { fields: [userWatchlist.contentId], references: [content.id] }),
}));

export const onboardingSeedsRelations = relations(onboardingSeeds, ({ one }) => ({
  content: one(content, { fields: [onboardingSeeds.contentId], references: [content.id] }),
}));
