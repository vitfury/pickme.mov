import { and, eq, inArray, sql } from 'drizzle-orm';
import { content, userSwipes, userBookmarks } from '../db/schema.js';
import type { Database } from '../db/index.js';
import { updatePreferencesForSwipe, reversePreferencesForSwipe } from '../services/preferences.js';

export interface MarkResult {
  id: number;
  status: 'marked' | 'unmarked' | 'unchanged' | 'not_found';
  title?: string;
}

/**
 * Record (or retract) the fact that titles were watched, without touching the
 * user's opinion of them. A title with no swipe at all gets a row with the
 * neutral 'watched' action; one that already carries a like, dislike or skip
 * keeps that action and only gains the flag.
 */
export async function markWatched(
  db: Database,
  userId: number,
  ids: number[],
  watched: boolean,
  watchedDate?: string,
): Promise<MarkResult[]> {
  if (ids.length === 0) return [];

  const rows = await db
    .select({ id: content.id, title: content.titleEn, contentType: content.contentType })
    .from(content)
    .where(inArray(content.id, ids));
  const known = new Map(rows.map((r) => [r.id, r]));

  const existing = await db
    .select({ contentId: userSwipes.contentId, action: userSwipes.action, isWatched: userSwipes.isWatched })
    .from(userSwipes)
    .where(and(eq(userSwipes.userId, userId), inArray(userSwipes.contentId, ids)));
  const swipeMap = new Map(existing.map((s) => [s.contentId, s]));

  const when = watchedDate ? new Date(watchedDate) : new Date();
  const results: MarkResult[] = [];

  for (const id of ids) {
    const row = known.get(id);
    if (!row) {
      results.push({ id, status: 'not_found' });
      continue;
    }

    const swipe = swipeMap.get(id);

    if (watched) {
      if (swipe?.isWatched) {
        results.push({ id, status: 'unchanged', title: row.title });
        continue;
      }
      if (swipe) {
        await db
          .update(userSwipes)
          .set({ isWatched: true, watchedAt: when })
          .where(and(eq(userSwipes.userId, userId), eq(userSwipes.contentId, id)));
      } else {
        await db.insert(userSwipes).values({
          userId,
          contentId: id,
          action: 'watched',
          contentType: row.contentType,
          isWatched: true,
          watchedAt: when,
        });
      }
      // Nothing left to decide about a title already seen
      await db
        .delete(userBookmarks)
        .where(and(eq(userBookmarks.userId, userId), eq(userBookmarks.contentId, id)));
      results.push({ id, status: 'marked', title: row.title });
      continue;
    }

    if (!swipe?.isWatched) {
      results.push({ id, status: 'unchanged', title: row.title });
      continue;
    }
    if (swipe.action === 'watched') {
      // The row existed only to carry the viewing
      await db
        .delete(userSwipes)
        .where(and(eq(userSwipes.userId, userId), eq(userSwipes.contentId, id)));
    } else {
      await db
        .update(userSwipes)
        .set({ isWatched: false, watchedAt: null })
        .where(and(eq(userSwipes.userId, userId), eq(userSwipes.contentId, id)));
    }
    results.push({ id, status: 'unmarked', title: row.title });
  }

  return results;
}

export interface BookmarkResult {
  id: number;
  status: 'added' | 'removed' | 'unchanged' | 'not_found' | 'already_watched';
  title?: string;
}

/**
 * Put a title aside for later, or take it back off the list.
 *
 * A watched title is refused rather than silently bookmarked: the app clears
 * bookmarks the moment something is marked watched or rated, so adding one
 * would be undone by the next swipe and look like the app lost it.
 */
export async function bookmarkTitle(
  db: Database,
  userId: number,
  ids: number[],
  bookmarked: boolean,
): Promise<BookmarkResult[]> {
  if (ids.length === 0) return [];

  const rows = await db
    .select({ id: content.id, title: content.titleEn })
    .from(content)
    .where(inArray(content.id, ids));
  const known = new Map(rows.map((r) => [r.id, r]));

  const watched = await db
    .select({ contentId: userSwipes.contentId })
    .from(userSwipes)
    .where(and(
      eq(userSwipes.userId, userId),
      inArray(userSwipes.contentId, ids),
      eq(userSwipes.isWatched, true),
    ));
  const watchedSet = new Set(watched.map((w) => w.contentId));

  const existing = await db
    .select({ contentId: userBookmarks.contentId })
    .from(userBookmarks)
    .where(and(eq(userBookmarks.userId, userId), inArray(userBookmarks.contentId, ids)));
  const existingSet = new Set(existing.map((b) => b.contentId));

  const results: BookmarkResult[] = [];

  for (const id of ids) {
    const row = known.get(id);
    if (!row) {
      results.push({ id, status: 'not_found' });
      continue;
    }

    if (bookmarked) {
      if (watchedSet.has(id)) {
        results.push({ id, status: 'already_watched', title: row.title });
        continue;
      }
      if (existingSet.has(id)) {
        results.push({ id, status: 'unchanged', title: row.title });
        continue;
      }
      await db.insert(userBookmarks).values({ userId, contentId: id }).onConflictDoNothing();
      results.push({ id, status: 'added', title: row.title });
      continue;
    }

    if (!existingSet.has(id)) {
      results.push({ id, status: 'unchanged', title: row.title });
      continue;
    }
    await db
      .delete(userBookmarks)
      .where(and(eq(userBookmarks.userId, userId), eq(userBookmarks.contentId, id)));
    results.push({ id, status: 'removed', title: row.title });
  }

  return results;
}

export interface RateResult {
  id: number;
  status: 'recorded' | 'not_found';
  title?: string;
  opinion?: 'like' | 'dislike';
  previousOpinion?: string | null;
}

/**
 * Express an opinion from the chat, exactly as a swipe in the app would: it
 * trains the recommendation engine and records the title as watched.
 */
export async function rateTitle(
  db: Database,
  userId: number,
  id: number,
  opinion: 'like' | 'dislike',
): Promise<RateResult> {
  const rows = await db
    .select({ id: content.id, title: content.titleEn, contentType: content.contentType })
    .from(content)
    .where(eq(content.id, id))
    .limit(1);

  if (rows.length === 0) return { id, status: 'not_found' };
  const row = rows[0];

  const existing = await db
    .select({ action: userSwipes.action })
    .from(userSwipes)
    .where(and(eq(userSwipes.userId, userId), eq(userSwipes.contentId, id)))
    .limit(1);

  const previous = existing[0]?.action ?? null;

  // Withdraw the old signal before applying the new one, or a flip would
  // leave both counted
  if (previous === 'like' || previous === 'dislike') {
    if (previous === opinion) {
      return { id, status: 'recorded', title: row.title, opinion, previousOpinion: previous };
    }
    await reversePreferencesForSwipe(db, userId, id, previous);
  }

  await db
    .insert(userSwipes)
    .values({
      userId,
      contentId: id,
      action: opinion,
      contentType: row.contentType,
      isWatched: true,
      watchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userSwipes.userId, userSwipes.contentId],
      set: {
        action: opinion,
        isWatched: true,
        watchedAt: sql`COALESCE(${userSwipes.watchedAt}, NOW())`,
        createdAt: new Date(),
      },
    });

  await updatePreferencesForSwipe(db, userId, id, opinion);

  await db
    .delete(userBookmarks)
    .where(and(eq(userBookmarks.userId, userId), eq(userBookmarks.contentId, id)));

  return { id, status: 'recorded', title: row.title, opinion, previousOpinion: previous };
}
