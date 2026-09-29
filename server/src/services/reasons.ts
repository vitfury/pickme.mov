import { eq } from 'drizzle-orm';
import { Database } from '../db/index.js';
import { awards, collections, genres, people } from '../db/schema.js';
import { getCatalogue, getTasteProfile, type FilmEntity, type TasteProfile } from './taste.js';

const MAX_REASONS = 2;

// 1 лайк, 2 лайки, 5 лайків
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const likesUk = (n: number) => `${n} ${plural(n, 'ваш лайк', 'ваші лайки', 'ваших лайків')}`;
const likesEn = (n: number) => `${n} of your like${n === 1 ? '' : 's'}`;

/**
 * Чому цей фільм може сподобатись — до двох причин, у порядку пріоритету.
 *
 * Кожна «персональна» причина спирається на реальні лайки з профілю смаку, і
 * числа в тексті — це кількість лайкнутих фільмів, без цього самого фільму.
 */
export async function generateReasons(
  db: Database,
  userId: number,
  contentId: number,
  locale: string,
  profile?: TasteProfile,
): Promise<string[]> {
  const uk = locale === 'uk';
  const [films, taste] = await Promise.all([
    getCatalogue(db),
    profile ? Promise.resolve(profile) : getTasteProfile(db, userId),
  ]);
  const film = films.get(contentId);
  if (!film) return [];

  // Якщо фільм уже лайкнуто, він сам сидить у профілі — не рахуємо його
  const selfLiked = taste.likedIds.has(contentId) ? 1 : 0;
  const liked = (key: string) => {
    const t = taste.entities.get(key);
    return t && t.score > 0 ? { likes: t.likes - selfLiked, score: t.score } : null;
  };
  const best = (type: string, minLikes: number, filter: (e: FilmEntity) => boolean = () => true) => {
    let top: { id: number | string; likes: number; score: number } | null = null;
    for (const e of film.entities) {
      if (e.type !== type || !filter(e)) continue;
      const l = liked(e.key);
      if (l && l.likes >= minLikes && (!top || l.score > top.score)) top = { id: e.id, ...l };
    }
    return top;
  };
  const personName = async (id: number) => {
    const [p] = await db.select({ nameEn: people.nameEn, nameUk: people.nameUk }).from(people).where(eq(people.id, id));
    return p ? (uk ? p.nameUk || p.nameEn : p.nameEn) : null;
  };

  const reasons: string[] = [];

  // 1. Режисер, чиї фільми лайкали щонайменше двічі
  const director = best('director', 2);
  if (director) {
    const name = await personName(director.id as number);
    if (name) {
      reasons.push(uk
        ? `Режисер ${name} — ${likesUk(director.likes)}`
        : `Directed by ${name} — ${likesEn(director.likes)}`);
    }
  }

  // 2. Актор головної ролі (перші три в титрах), теж щонайменше два лайки
  if (reasons.length < MAX_REASONS) {
    const actor = best('actor', 2, (e) => e.lead === true);
    if (actor) {
      const name = await personName(actor.id as number);
      if (name) {
        reasons.push(uk
          ? `У головній ролі ${name} — ${likesUk(actor.likes)}`
          : `Starring ${name} — ${likesEn(actor.likes)}`);
      }
    }
  }

  // 3. Один із трьох найулюбленіших жанрів (з помітною кількістю лайків)
  if (reasons.length < MAX_REASONS) {
    const topGenres = [...taste.entities.entries()]
      .filter(([, t]) => t.type === 'genre' && t.score > 0 && t.likes >= 3)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([key]) => key);
    const match = film.entities.find((e) => e.type === 'genre' && topGenres.includes(e.key));
    if (match) {
      const [g] = await db.select({ nameEn: genres.nameEn, nameUk: genres.nameUk }).from(genres).where(eq(genres.id, match.id as number));
      if (g) {
        const name = uk ? g.nameUk || g.nameEn : g.nameEn;
        reasons.push(uk ? `Відповідає вашій любові до жанру «${name}»` : `Matches your love of "${name}" genre`);
      }
    }
  }

  // 4. Оскар
  if (reasons.length < MAX_REASONS) {
    const awardRows = await db.select({ won: awards.won }).from(awards).where(eq(awards.contentId, contentId)).limit(5);
    if (awardRows.length > 0) {
      const hasWon = awardRows.some((a) => a.won);
      reasons.push(uk
        ? (hasWon ? 'Лауреат премії Оскар' : 'Номінант на Оскар')
        : (hasWon ? 'Academy Award Winner' : 'Oscar-nominated'));
    }
  }

  // 5. Серія, з якої вже щось лайкали
  if (reasons.length < MAX_REASONS) {
    const coll = best('collection', 1);
    if (coll) {
      const [c] = await db.select({ nameEn: collections.nameEn, nameUk: collections.nameUk }).from(collections).where(eq(collections.id, coll.id as number));
      if (c) {
        const name = uk ? c.nameUk || c.nameEn : c.nameEn;
        reasons.push(uk ? `З колекції ${name} — ${likesUk(coll.likes)}` : `From the ${name} collection — ${likesEn(coll.likes)}`);
      }
    }
  }

  // 6. Кілька спільних тем із лайкнутими фільмами
  if (reasons.length < MAX_REASONS) {
    const shared = film.entities.filter((e) => {
      if (e.type !== 'keyword') return false;
      const l = liked(e.key);
      return l !== null && l.likes >= 2;
    });
    if (shared.length >= 2) {
      reasons.push(uk ? 'Схожі теми з фільмами, які вам сподобались' : 'Similar themes to movies you\'ve liked');
    }
  }

  // 7. Просто дуже добре оцінений (приблизно верхні 10% каталогу)
  if (reasons.length < MAX_REASONS && film.quality > 0.5) {
    reasons.push(uk ? 'Високий рейтинг на TMDB та IMDb' : 'Highly rated on TMDB & IMDb');
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
  profile?: TasteProfile,
): Promise<string | null> {
  const reasons = await generateReasons(db, userId, contentId, locale, profile);
  return reasons[0] || null;
}
