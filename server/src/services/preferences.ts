import { eq, and, sql } from 'drizzle-orm';
import { Database } from '../db/index.js';
import {
  userPreferences,
  users,
  content,
  contentGenres,
  contentPeople,
  contentKeywords,
  contentCollections,
  entityTypeWeights,
} from '../db/schema.js';

// Base action weights
const ACTION_WEIGHTS = {
  like: 1.0,
  dislike: -0.3,
  skip: 0,
} as const;

interface PreferenceUpdate {
  entityType: string;
  entityId: number;
  delta: number;
  label: string;
}

/**
 * Update user preferences based on a swipe action on a piece of content.
 * Returns a list of human-readable preference updates for debugging.
 */
export async function updatePreferencesForSwipe(
  db: Database,
  userId: number,
  contentId: number,
  action: 'like' | 'dislike' | 'skip',
): Promise<string[]> {
  if (action === 'skip') return [];
  const baseWeight = ACTION_WEIGHTS[action];

  // Fetch entity type weights from config table
  const typeWeights = await db.select().from(entityTypeWeights);
  const weightMap = new Map(typeWeights.map((tw) => [tw.entityType, parseFloat(tw.weight)]));

  const updates: PreferenceUpdate[] = [];

  // 1. Genres
  const genreRows = await db
    .select({ genreId: contentGenres.genreId })
    .from(contentGenres)
    .where(eq(contentGenres.contentId, contentId));

  for (const row of genreRows) {
    const typeWeight = weightMap.get('genre') || 1.0;
    const delta = baseWeight * typeWeight;
    updates.push({ entityType: 'genre', entityId: row.genreId, delta, label: `genre:${row.genreId}` });
  }

  // 2. Directors
  const directors = await db
    .select({ personId: contentPeople.personId })
    .from(contentPeople)
    .where(and(eq(contentPeople.contentId, contentId), eq(contentPeople.role, 'director')));

  for (const row of directors) {
    const typeWeight = weightMap.get('director') || 1.5;
    const delta = baseWeight * typeWeight;
    updates.push({ entityType: 'director', entityId: row.personId, delta, label: `director:${row.personId}` });
  }

  // 3. Actors (with billing_factor)
  const actors = await db
    .select({ personId: contentPeople.personId, billingOrder: contentPeople.billingOrder })
    .from(contentPeople)
    .where(and(eq(contentPeople.contentId, contentId), eq(contentPeople.role, 'actor')));

  for (const row of actors) {
    const order = row.billingOrder ?? 99;
    if (order > 8) continue; // Only top 8 actors matter
    const typeWeight = weightMap.get('actor') || 0.8;
    const billingFactor = order <= 3 ? 1.0 : 0.5;
    const delta = baseWeight * typeWeight * billingFactor;
    updates.push({ entityType: 'actor', entityId: row.personId, delta, label: `actor:${row.personId}` });
  }

  // 4. Keywords
  const keywordRows = await db
    .select({ keywordId: contentKeywords.keywordId })
    .from(contentKeywords)
    .where(eq(contentKeywords.contentId, contentId));

  for (const row of keywordRows) {
    const typeWeight = weightMap.get('keyword') || 0.6;
    const delta = baseWeight * typeWeight;
    updates.push({ entityType: 'keyword', entityId: row.keywordId, delta, label: `keyword:${row.keywordId}` });
  }

  // 5. Decade
  const contentRow = await db
    .select({ releaseDate: content.releaseDate })
    .from(content)
    .where(eq(content.id, contentId))
    .limit(1);

  if (contentRow[0]?.releaseDate) {
    const year = new Date(contentRow[0].releaseDate).getFullYear();
    const decade = Math.floor(year / 10) * 10;
    const typeWeight = weightMap.get('decade') || 0.3;
    const delta = baseWeight * typeWeight;
    updates.push({ entityType: 'decade', entityId: decade, delta, label: `decade:${decade}` });
  }

  // 6. Collections
  const collectionRows = await db
    .select({ collectionId: contentCollections.collectionId })
    .from(contentCollections)
    .where(eq(contentCollections.contentId, contentId));

  for (const row of collectionRows) {
    const typeWeight = weightMap.get('collection') || 0.5;
    const delta = baseWeight * typeWeight;
    updates.push({ entityType: 'collection', entityId: row.collectionId, delta, label: `collection:${row.collectionId}` });
  }

  // Batch upsert all preference updates
  for (const update of updates) {
    await db
      .insert(userPreferences)
      .values({
        userId,
        entityType: update.entityType as any,
        entityId: update.entityId,
        rawScore: String(update.delta),
        interactionCount: 1,
        lastUpdated: new Date(),
      })
      .onConflictDoUpdate({
        target: [userPreferences.userId, userPreferences.entityType, userPreferences.entityId],
        set: {
          rawScore: sql`${userPreferences.rawScore} + ${update.delta}`,
          interactionCount: sql`${userPreferences.interactionCount} + 1`,
          lastUpdated: new Date(),
        },
      });
  }

  // Increment maturity score
  await db
    .update(users)
    .set({ maturityScore: sql`${users.maturityScore} + 1` })
    .where(eq(users.id, userId));

  return updates.map((u) => `${u.label} ${u.delta > 0 ? '+' : ''}${u.delta.toFixed(2)}`);
}

/**
 * Reverse preference updates for an undo operation.
 */
export async function reversePreferencesForSwipe(
  db: Database,
  userId: number,
  contentId: number,
  action: 'like' | 'dislike' | 'skip',
): Promise<void> {
  if (action === 'skip') return;
  const baseWeight = ACTION_WEIGHTS[action];

  const typeWeights = await db.select().from(entityTypeWeights);
  const weightMap = new Map(typeWeights.map((tw) => [tw.entityType, parseFloat(tw.weight)]));

  interface ReverseUpdate { entityType: string; entityId: number; delta: number }
  const updates: ReverseUpdate[] = [];

  // Same entity collection as forward pass
  const genreRows = await db.select({ genreId: contentGenres.genreId }).from(contentGenres).where(eq(contentGenres.contentId, contentId));
  for (const row of genreRows) {
    updates.push({ entityType: 'genre', entityId: row.genreId, delta: -(baseWeight * (weightMap.get('genre') || 1.0)) });
  }

  const directors = await db.select({ personId: contentPeople.personId }).from(contentPeople).where(and(eq(contentPeople.contentId, contentId), eq(contentPeople.role, 'director')));
  for (const row of directors) {
    updates.push({ entityType: 'director', entityId: row.personId, delta: -(baseWeight * (weightMap.get('director') || 1.5)) });
  }

  const actors = await db.select({ personId: contentPeople.personId, billingOrder: contentPeople.billingOrder }).from(contentPeople).where(and(eq(contentPeople.contentId, contentId), eq(contentPeople.role, 'actor')));
  for (const row of actors) {
    const order = row.billingOrder ?? 99;
    if (order > 8) continue;
    const billingFactor = order <= 3 ? 1.0 : 0.5;
    updates.push({ entityType: 'actor', entityId: row.personId, delta: -(baseWeight * (weightMap.get('actor') || 0.8) * billingFactor) });
  }

  const keywordRows = await db.select({ keywordId: contentKeywords.keywordId }).from(contentKeywords).where(eq(contentKeywords.contentId, contentId));
  for (const row of keywordRows) {
    updates.push({ entityType: 'keyword', entityId: row.keywordId, delta: -(baseWeight * (weightMap.get('keyword') || 0.6)) });
  }

  const contentRow = await db.select({ releaseDate: content.releaseDate }).from(content).where(eq(content.id, contentId)).limit(1);
  if (contentRow[0]?.releaseDate) {
    const year = new Date(contentRow[0].releaseDate).getFullYear();
    const decade = Math.floor(year / 10) * 10;
    updates.push({ entityType: 'decade', entityId: decade, delta: -(baseWeight * (weightMap.get('decade') || 0.3)) });
  }

  const collectionRows = await db.select({ collectionId: contentCollections.collectionId }).from(contentCollections).where(eq(contentCollections.contentId, contentId));
  for (const row of collectionRows) {
    updates.push({ entityType: 'collection', entityId: row.collectionId, delta: -(baseWeight * (weightMap.get('collection') || 0.5)) });
  }

  // Apply reverse deltas
  for (const update of updates) {
    await db
      .update(userPreferences)
      .set({
        rawScore: sql`${userPreferences.rawScore} + ${update.delta}`,
        interactionCount: sql`GREATEST(${userPreferences.interactionCount} - 1, 0)`,
        lastUpdated: new Date(),
      })
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.entityType, update.entityType as any),
          eq(userPreferences.entityId, update.entityId),
        ),
      );
  }

  // Decrement maturity score
  await db
    .update(users)
    .set({ maturityScore: sql`GREATEST(${users.maturityScore} - 1, 0)` })
    .where(eq(users.id, userId));
}
