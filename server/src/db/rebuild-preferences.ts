/**
 * Перебудовує user_preferences виключно з лайків і дизлайків.
 *
 * Навіщо: вподобання — це накопичувальні бали, і з часом у них потрапило те,
 * чого в історії оцінок немає — жанри, тапнуті на колишньому онбордингу, і
 * подвійні нарахування від повторних свайпів (до виправлення в feed.ts).
 * Скрипт стирає бали користувача й програє його оцінки заново тією ж
 * функцією, що й живий свайп, — після цього «улюблене» в профілі збігається
 * з тим, що людина справді лайкала.
 *
 *   node dist/db/rebuild-preferences.js                 # усі користувачі
 *   node dist/db/rebuild-preferences.js me@example.com  # один
 *   ... --dry-run                                       # лише показати, що зміниться
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, pool } from './index.js';
import { users, userSwipes, userPreferences } from './schema.js';
import { updatePreferencesForSwipe } from '../services/preferences.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const email = args.find((a) => !a.startsWith('--'));

const targets = await db
  .select({ id: users.id, email: users.email })
  .from(users)
  .where(email ? eq(users.email, email) : sql`true`);

if (targets.length === 0) {
  console.error(email ? `Користувача ${email} не знайдено` : 'Користувачів немає');
  process.exit(1);
}

for (const user of targets) {
  const opinions = await db
    .select({ contentId: userSwipes.contentId, action: userSwipes.action })
    .from(userSwipes)
    .where(and(eq(userSwipes.userId, user.id), inArray(userSwipes.action, ['like', 'dislike'])))
    .orderBy(asc(userSwipes.createdAt));

  const [{ before }] = await db
    .select({ before: sql<number>`count(*)` })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id));

  console.log(`${user.email}: ${opinions.length} оцінок, ${before} записів вподобань зараз`);
  if (dryRun) continue;

  // Транзакція: або перебудова повністю, або нічого — щоб на півдорозі
  // профіль не лишився напівпорожнім
  await db.transaction(async (tx) => {
    await tx.delete(userPreferences).where(eq(userPreferences.userId, user.id));
    // updatePreferencesForSwipe інкрементує maturity на кожну оцінку —
    // обнуляємо, щоб після програвання вона дорівнювала кількості оцінок
    await tx.update(users).set({ maturityScore: 0 }).where(eq(users.id, user.id));
    for (const o of opinions) {
      await updatePreferencesForSwipe(tx as unknown as typeof db, user.id, o.contentId, o.action as 'like' | 'dislike');
    }
  });

  const [{ after }] = await db
    .select({ after: sql<number>`count(*)` })
    .from(userPreferences)
    .where(eq(userPreferences.userId, user.id));
  console.log(`  → перебудовано: ${after} записів`);
}

await pool.end();
