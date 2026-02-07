import { eq, and, desc, sql } from 'drizzle-orm';
import { Database } from '../db/index.js';
import {
  userPreferences,
  contentGenres,
  contentPeople,
  contentKeywords,
  contentCollections,
  awards,
  content,
  genres,
  people,
  collections,
} from '../db/schema.js';

const MAX_REASONS = 2;

/**
 * Generate priority-ordered recommendation reasons for a content item.
 * Returns up to 2 reasons.
 */
export async function generateReasons(
  db: Database,
  userId: number,
  contentId: number,
  locale: string,
): Promise<string[]> {
  const reasons: string[] = [];

  // 1. Director match (raw_score > 2.0)
  const directorPrefs = await db
    .select({
      personId: contentPeople.personId,
      nameEn: people.nameEn,
      nameUk: people.nameUk,
      rawScore: userPreferences.rawScore,
      interactions: userPreferences.interactionCount,
    })
    .from(contentPeople)
    .innerJoin(people, eq(contentPeople.personId, people.id))
    .innerJoin(
      userPreferences,
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.entityType, 'director'),
        eq(userPreferences.entityId, contentPeople.personId),
      ),
    )
    .where(and(eq(contentPeople.contentId, contentId), eq(contentPeople.role, 'director')))
    .orderBy(desc(userPreferences.rawScore))
    .limit(1);

  if (directorPrefs.length > 0 && parseFloat(directorPrefs[0].rawScore || '0') > 2.0) {
    const name = locale === 'uk' ? (directorPrefs[0].nameUk || directorPrefs[0].nameEn) : directorPrefs[0].nameEn;
    const count = directorPrefs[0].interactions || 0;
    reasons.push(`You liked ${count} other films by ${name}`);
  }
  if (reasons.length >= MAX_REASONS) return reasons;

  // 2. Actor match (raw_score > 2.0)
  const actorPrefs = await db
    .select({
      personId: contentPeople.personId,
      nameEn: people.nameEn,
      nameUk: people.nameUk,
      rawScore: userPreferences.rawScore,
    })
    .from(contentPeople)
    .innerJoin(people, eq(contentPeople.personId, people.id))
    .innerJoin(
      userPreferences,
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.entityType, 'actor'),
        eq(userPreferences.entityId, contentPeople.personId),
      ),
    )
    .where(and(eq(contentPeople.contentId, contentId), eq(contentPeople.role, 'actor')))
    .orderBy(desc(userPreferences.rawScore))
    .limit(1);

  if (actorPrefs.length > 0 && parseFloat(actorPrefs[0].rawScore || '0') > 2.0) {
    const name = locale === 'uk' ? (actorPrefs[0].nameUk || actorPrefs[0].nameEn) : actorPrefs[0].nameEn;
    reasons.push(`Stars ${name}, who you enjoy`);
  }
  if (reasons.length >= MAX_REASONS) return reasons;

  // 3. Genre match (top 3 genres by raw_score)
  const topGenres = await db
    .select({ entityId: userPreferences.entityId })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.entityType, 'genre')))
    .orderBy(desc(userPreferences.rawScore))
    .limit(3);

  const topGenreIds = topGenres.map((g) => g.entityId);
  if (topGenreIds.length > 0) {
    const contentGenreRows = await db
      .select({ genreId: contentGenres.genreId, nameEn: genres.nameEn, nameUk: genres.nameUk })
      .from(contentGenres)
      .innerJoin(genres, eq(contentGenres.genreId, genres.id))
      .where(eq(contentGenres.contentId, contentId));

    for (const g of contentGenreRows) {
      if (topGenreIds.includes(g.genreId)) {
        const name = locale === 'uk' ? (g.nameUk || g.nameEn) : g.nameEn;
        reasons.push(`Matches your love of ${name}`);
        break;
      }
    }
  }
  if (reasons.length >= MAX_REASONS) return reasons;

  // 4. Award signal
  const awardRows = await db
    .select({ won: awards.won })
    .from(awards)
    .where(eq(awards.contentId, contentId))
    .limit(5);

  if (awardRows.length > 0) {
    const hasWon = awardRows.some((a) => a.won);
    reasons.push(hasWon ? 'Academy Award Winner' : 'Oscar-nominated');
  }
  if (reasons.length >= MAX_REASONS) return reasons;

  // 5. Collection match (raw_score > 1.0)
  const collectionPrefs = await db
    .select({
      collectionId: contentCollections.collectionId,
      nameEn: collections.nameEn,
      nameUk: collections.nameUk,
      rawScore: userPreferences.rawScore,
    })
    .from(contentCollections)
    .innerJoin(collections, eq(contentCollections.collectionId, collections.id))
    .innerJoin(
      userPreferences,
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.entityType, 'collection'),
        eq(userPreferences.entityId, contentCollections.collectionId),
      ),
    )
    .where(eq(contentCollections.contentId, contentId))
    .orderBy(desc(userPreferences.rawScore))
    .limit(1);

  if (collectionPrefs.length > 0 && parseFloat(collectionPrefs[0].rawScore || '0') > 1.0) {
    const name = locale === 'uk' ? (collectionPrefs[0].nameUk || collectionPrefs[0].nameEn) : collectionPrefs[0].nameEn;
    reasons.push(`From the ${name} collection`);
  }
  if (reasons.length >= MAX_REASONS) return reasons;

  // 6. Keyword match (2+ keyword matches)
  const keywordMatches = await db
    .select({ count: sql<number>`count(*)` })
    .from(contentKeywords)
    .innerJoin(
      userPreferences,
      and(
        eq(userPreferences.userId, userId),
        eq(userPreferences.entityType, 'keyword'),
        eq(userPreferences.entityId, contentKeywords.keywordId),
      ),
    )
    .where(eq(contentKeywords.contentId, contentId));

  if (keywordMatches[0] && Number(keywordMatches[0].count) >= 2) {
    reasons.push('Similar themes to movies you\'ve liked');
  }
  if (reasons.length >= MAX_REASONS) return reasons;

  // 7. High quality fallback
  const contentRow = await db
    .select({ baseQualityScore: content.baseQualityScore })
    .from(content)
    .where(eq(content.id, contentId))
    .limit(1);

  if (contentRow[0] && parseFloat(contentRow[0].baseQualityScore || '0') > 0.7) {
    reasons.push('Highly rated on TMDB & IMDb');
  }

  return reasons;
}

/**
 * Generate a single reason for a feed card (first priority match).
 */
export async function generateSingleReason(
  db: Database,
  userId: number,
  contentId: number,
  locale: string,
): Promise<string | null> {
  const reasons = await generateReasons(db, userId, contentId, locale);
  return reasons[0] || null;
}
