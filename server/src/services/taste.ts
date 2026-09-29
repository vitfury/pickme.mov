/**
 * Смак користувача і збіг фільму з ним.
 *
 * Смак не зберігається — він щоразу виводиться з історії оцінок. Так профіль
 * не може «засмітитись»: немає накопичених балів, які треба відкочувати при
 * зміні думки чи видаленні лайку. Що в історії — те й у смаку.
 *
 * Для кожної сутності (жанр, режисер, актор, ключове слово, серія, десятиліття,
 * мова, «нішевість») рахуємо не суму, а згладжене співвідношення:
 *   score = (лайки − дизлайки) / (усі оцінки + K)
 * Тож жанр із 10 лайками і 30 дизлайками — від'ємний, а один випадковий
 * лайк не робить сутність улюбленою (K тягне до нуля, поки даних мало).
 *
 * Дизлайк нішевого фільму (мало голосів на TMDB) майже не б'є по жанру чи
 * ключових словах: скоріш за все не сподобалась сама «нішевість» — її й
 * штрафуємо через окремі сутності мови та охоплення.
 */
import { sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';

export type EntityType =
  | 'genre' | 'director' | 'actor' | 'keyword' | 'collection' | 'decade' | 'lang' | 'reach';

export interface FilmEntity {
  key: string; // `${type}:${id}`
  type: EntityType;
  id: number | string;
  /** Скільки ця сутність важить у фільмі: IDF (рідкісніше — показовіше) × позиція в титрах */
  weight: number;
  /** Актор із перших трьох рядків титрів */
  lead?: boolean;
}

export interface Film {
  id: number;
  contentType: string;
  quality: number;
  votes: number;
  entities: FilmEntity[];
}

// Відносна вага типу в підсумковому збігу фільму зі смаком
const TYPE_WEIGHT: Record<EntityType, number> = {
  genre: 1.0,
  director: 1.0,
  keyword: 0.8,
  actor: 0.7,
  collection: 0.5,
  lang: 0.4,
  reach: 0.4,
  decade: 0.3,
};

// Згладжування: скільки «нейтральних» оцінок домішуємо до кожної сутності.
// Жанрів мало й вони в кожному фільмі — їм потрібно більше доказів.
const SMOOTHING: Record<EntityType, number> = {
  genre: 3,
  keyword: 2,
  decade: 3,
  lang: 3,
  reach: 3,
  actor: 1.5,
  director: 1,
  collection: 1,
};

// Типи, що описують сам фільм. Дизлайк нішевого фільму по них б'є слабше.
const CONTENT_TYPES = new Set<EntityType>(['genre', 'director', 'actor', 'keyword', 'collection', 'decade']);

const DISLIKE_WEIGHT = 0.7; // дизлайк — слабший доказ, ніж лайк
const HALF_LIFE_DAYS = 365; // оцінка річної давнини важить удвічі менше

/** Наскільки фільм «на слуху»: 0.2 для кількох сотень голосів, 1 від ~5000 */
export function familiarity(votes: number): number {
  const f = (Math.log10(Math.max(votes, 1)) - 2) / (Math.log10(5000) - 2);
  return Math.min(1, Math.max(0.2, f));
}

function reachBucket(votes: number): string {
  if (votes < 1000) return 'niche';
  if (votes < 5000) return 'mid';
  return 'mainstream';
}

// ─── Каталог ────────────────────────────────────────────────────────────────
// Каталог змінюється лише при імпорті, тож тримаємо його в пам'яті: скоринг
// усіх ~7 тис. фільмів тоді займає мілісекунди, а не десятки запитів.

const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;
let catalogue: { films: Map<number, Film>; loadedAt: number } | null = null;
let loading: Promise<Map<number, Film>> | null = null;

export async function getCatalogue(db: Database): Promise<Map<number, Film>> {
  if (catalogue && Date.now() - catalogue.loadedAt < CATALOGUE_TTL_MS) return catalogue.films;
  if (!loading) {
    loading = loadCatalogue(db)
      .then((films) => {
        catalogue = { films, loadedAt: Date.now() };
        return films;
      })
      .finally(() => { loading = null; });
  }
  return loading;
}

async function loadCatalogue(db: Database): Promise<Map<number, Film>> {
  const [contentRows, idfRows, links] = await Promise.all([
    db.execute(sql`
      SELECT id, content_type, base_quality_score, tmdb_vote_count, original_language,
             EXTRACT(YEAR FROM release_date)::int AS year
      FROM content`),
    db.execute(sql`SELECT entity_type, entity_id, idf_weight FROM entity_idf_cache`),
    db.execute(sql`
      SELECT content_id, 'genre' AS type, genre_id AS id, NULL::int AS billing FROM content_genres
      UNION ALL
      SELECT content_id, role::text, person_id, billing_order FROM content_people
        WHERE role = 'director' OR (role = 'actor' AND COALESCE(billing_order, 99) <= 8)
      UNION ALL
      SELECT content_id, 'keyword', keyword_id, NULL FROM content_keywords
      UNION ALL
      SELECT content_id, 'collection', collection_id, NULL FROM content_collections`),
  ]);

  const idf = new Map<string, number>();
  for (const r of idfRows.rows as any[]) idf.set(`${r.entity_type}:${r.entity_id}`, parseFloat(r.idf_weight));

  const films = new Map<number, Film>();
  for (const r of contentRows.rows as any[]) {
    const votes = Number(r.tmdb_vote_count) || 0;
    const entities: FilmEntity[] = [];
    if (r.year) {
      const decade = Math.floor(r.year / 10) * 10;
      entities.push({ key: `decade:${decade}`, type: 'decade', id: decade, weight: 1 });
    }
    if (r.original_language) {
      entities.push({ key: `lang:${r.original_language}`, type: 'lang', id: r.original_language, weight: 1 });
    }
    const reach = reachBucket(votes);
    entities.push({ key: `reach:${reach}`, type: 'reach', id: reach, weight: 1 });
    films.set(r.id, {
      id: r.id,
      contentType: r.content_type,
      quality: parseFloat(r.base_quality_score) || 0,
      votes,
      entities,
    });
  }

  for (const l of links.rows as any[]) {
    const film = films.get(l.content_id);
    if (!film) continue;
    const type = l.type as EntityType;
    const key = `${type}:${l.id}`;
    const lead = type === 'actor' && (l.billing ?? 99) <= 3;
    const billing = type === 'actor' && !lead ? 0.5 : 1;
    film.entities.push({ key, type, id: l.id, weight: (idf.get(key) ?? 1) * billing, ...(lead ? { lead } : {}) });
  }
  return films;
}

// ─── Профіль ────────────────────────────────────────────────────────────────

export interface Opinion {
  contentId: number;
  kind: 'like' | 'dislike';
  at: Date;
}

export interface EntityTaste {
  type: EntityType;
  id: number | string;
  likes: number; // скільки лайкнутих фільмів мають цю сутність — чесний лічильник для UI
  dislikes: number;
  score: number; // −1..1
}

export interface TasteProfile {
  entities: Map<string, EntityTaste>;
  likes: number;
  dislikes: number;
  likedIds: Set<number>;
}

export function buildProfile(opinions: Opinion[], films: Map<number, Film>, now = Date.now()): TasteProfile {
  const acc = new Map<string, { type: EntityType; id: number | string; net: number; n: number; likes: number; dislikes: number }>();
  let likes = 0;
  let dislikes = 0;
  const likedIds = new Set<number>();

  for (const o of opinions) {
    const film = films.get(o.contentId);
    if (!film) continue;
    if (o.kind === 'like') {
      likes++;
      likedIds.add(o.contentId);
    }
    if (o.kind === 'dislike') dislikes++;

    const ageDays = Math.max(0, (now - o.at.getTime()) / 86_400_000);
    const decay = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    const base = o.kind === 'like' ? 1 : DISLIKE_WEIGHT;
    const sign = o.kind === 'dislike' ? -1 : 1;
    const niche = o.kind === 'dislike' ? familiarity(film.votes) : 1;

    // Одна сутність може трапитись у фільмі двічі (актор і режисер — різні типи,
    // тож ключі різні; але дублікати посилань у даних теж бувають)
    const seen = new Set<string>();
    for (const e of film.entities) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      const w = base * decay * (CONTENT_TYPES.has(e.type) ? niche : 1);
      let a = acc.get(e.key);
      if (!a) {
        a = { type: e.type, id: e.id, net: 0, n: 0, likes: 0, dislikes: 0 };
        acc.set(e.key, a);
      }
      a.net += sign * w;
      a.n += w;
      if (o.kind === 'like') a.likes++;
      if (o.kind === 'dislike') a.dislikes++;
    }
  }

  const entities = new Map<string, EntityTaste>();
  for (const [key, a] of acc) {
    entities.set(key, {
      type: a.type,
      id: a.id,
      likes: a.likes,
      dislikes: a.dislikes,
      score: a.net / (a.n + SMOOTHING[a.type]),
    });
  }
  return { entities, likes, dislikes, likedIds };
}

export async function loadOpinions(db: Database, userId: number): Promise<Opinion[]> {
  // Лише лайки й дизлайки: закладка — це намір подивитись, а не враження
  const res = await db.execute(sql`
    SELECT content_id, action::text AS kind, created_at AS at FROM user_swipes
    WHERE user_id = ${userId} AND action IN ('like', 'dislike')`);
  return (res.rows as any[]).map((r) => ({ contentId: r.content_id, kind: r.kind, at: new Date(r.at) }));
}

export async function getTasteProfile(db: Database, userId: number): Promise<TasteProfile> {
  const [films, opinions] = await Promise.all([getCatalogue(db), loadOpinions(db, userId)]);
  return buildProfile(opinions, films);
}

/** 0..1 — наскільки профіль уже щось знає. Повна довіра від 30 оцінок. */
export function maturity(profile: TasteProfile): number {
  return Math.min((profile.likes + profile.dislikes) / 30, 1);
}

// ─── Збіг фільму зі смаком ──────────────────────────────────────────────────

export interface Match {
  /** −1..1: зважене середнє смаку по сутностях фільму */
  score: number;
  /** 0..1: яка частка фільму профілю ще незнайома */
  novelty: number;
}

export function matchFilm(profile: TasteProfile, film: Film): Match {
  // Спершу середнє в межах кожного типу, потім зважене між типами — щоб фільм
  // із сорока ключовими словами не переважував фільм із п'ятьма лише кількістю
  const perType = new Map<EntityType, { sum: number; weight: number; known: number }>();
  for (const e of film.entities) {
    let t = perType.get(e.type);
    if (!t) {
      t = { sum: 0, weight: 0, known: 0 };
      perType.set(e.type, t);
    }
    const taste = profile.entities.get(e.key);
    t.weight += e.weight;
    if (taste) {
      t.sum += taste.score * e.weight;
      t.known += e.weight;
    }
  }

  let score = 0;
  let known = 0;
  let total = 0;
  for (const [type, t] of perType) {
    if (t.weight === 0) continue;
    const w = TYPE_WEIGHT[type];
    score += w * (t.sum / t.weight);
    known += w * (t.known / t.weight);
    total += w;
  }
  if (total === 0) return { score: 0, novelty: 1 };
  return { score: score / total, novelty: 1 - known / total };
}

/**
 * Найулюбленіші сутності типу — для профілю й бота. Лише з додатним смаком і
 * щонайменше `minLikes` лайками: одна випадкова оцінка ще не «улюблене».
 */
export function topEntities(profile: TasteProfile, type: EntityType, limit: number, minLikes = 1): EntityTaste[] {
  return [...profile.entities.values()]
    .filter((t) => t.type === type && t.score > 0 && t.likes >= minLikes)
    .sort((a, b) => b.score - a.score || b.likes - a.likes)
    .slice(0, limit);
}
