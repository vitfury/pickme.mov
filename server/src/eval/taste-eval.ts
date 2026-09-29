/**
 * Офлайн-перевірка рекомендацій на реальній історії оцінок.
 *
 * Ховаємо п'яту частину оцінок користувача, будуємо смак з решти і дивимось,
 * куди алгоритм ставить сховані фільми серед усього каталогу того ж типу.
 * Перцентиль 0.5 — рівень монетки; для лайків хочемо ближче до 1, для
 * дизлайків — нижче, ніж для лайків.
 *
 *   DATABASE_URL=... npx tsx src/eval/taste-eval.ts me@example.com
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { buildProfile, getCatalogue, matchFilm, type Film, type Opinion } from '../services/taste.js';

const email = process.argv[2];
if (!email) {
  console.error('usage: taste-eval <email>');
  process.exit(1);
}

const films = await getCatalogue(db);
const res = await db.execute(sql`
  SELECT s.content_id, s.action::text AS kind, s.created_at AS at
  FROM user_swipes s JOIN users u ON u.id = s.user_id
  WHERE u.email = ${email} AND s.action IN ('like', 'dislike')`);
const opinions: Opinion[] = (res.rows as any[]).map((r) => ({ contentId: r.content_id, kind: r.kind, at: new Date(r.at) }));
console.log(`${opinions.length} оцінок, фільмів у каталозі: ${films.size}`);

// Стара формула — для порівняння: сума балів × вага типу × IDF
const OLD_TW: Record<string, number> = { genre: 1, director: 1.5, actor: 0.8, keyword: 0.6, collection: 0.5, decade: 0.3 };
function oldScorer(train: Opinion[]) {
  const raw = new Map<string, number>();
  for (const o of train) {
    const f = films.get(o.contentId);
    if (!f) continue;
    const base = o.kind === 'like' ? 1 : -0.3;
    for (const e of f.entities) {
      const tw = OLD_TW[e.type];
      if (!tw) continue;
      // e.weight = idf × billing; у старому коді billing теж множився при записі
      raw.set(e.key, (raw.get(e.key) ?? 0) + base * tw * (e.type === 'actor' && !e.lead ? 0.5 : 1));
    }
  }
  return (f: Film) => {
    let s = 0;
    for (const e of f.entities) {
      const r = raw.get(e.key);
      if (r !== undefined) s += r * OLD_TW[e.type] * e.weight;
    }
    return f.quality * 0.3 + s * 0.5;
  };
}

type Scorer = (f: Film) => number;
const methods: Record<string, (train: Opinion[]) => Scorer> = {
  'лише якість': () => (f) => f.quality,
  'стара формула': oldScorer,
  'новий смак': (train) => {
    const p = buildProfile(train, films);
    return (f) => matchFilm(p, f).score;
  },
};
// Змішування смаку з якістю через ранги — так само, як у стрічці
for (const alpha of [0.5, 0.7, 0.85]) {
  methods[`смак ${alpha} + якість`] = (train) => {
    const p = buildProfile(train, films);
    const all = [...films.values()];
    const rankOf = (vals: Map<number, number>) => {
      const sorted = [...vals.entries()].sort((a, b) => a[1] - b[1]);
      return new Map(sorted.map(([id], i) => [id, i / sorted.length]));
    };
    const m = rankOf(new Map(all.map((f) => [f.id, matchFilm(p, f).score])));
    const q = rankOf(new Map(all.map((f) => [f.id, f.quality])));
    return (f) => alpha * m.get(f.id)! + (1 - alpha) * q.get(f.id)!;
  };
}

// Детерміноване перемішування, щоб прогони були порівнянні
let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const shuffled = [...opinions].sort(() => rnd() - 0.5);
const FOLDS = 5;

for (const [name, make] of Object.entries(methods)) {
  const likeP: number[] = [];
  const dislikeP: number[] = [];
  let hits = 0;
  for (let k = 0; k < FOLDS; k++) {
    const test = shuffled.filter((_, i) => i % FOLDS === k);
    const train = shuffled.filter((_, i) => i % FOLDS !== k);
    const trainIds = new Set(train.map((o) => o.contentId));
    const score = make(train);
    for (const t of test) {
      const target = films.get(t.contentId);
      if (!target) continue;
      const pool = [...films.values()].filter((f) => f.contentType === target.contentType && !trainIds.has(f.id));
      const ts = score(target);
      const below = pool.filter((f) => score(f) < ts).length;
      const pct = below / (pool.length - 1);
      if (t.kind === 'like') {
        likeP.push(pct);
        const rank = pool.length - below;
        if (rank <= 100) hits++;
      } else dislikeP.push(pct);
    }
  }
  const avg = (a: number[]) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(3);
  console.log(`${name.padEnd(20)} лайки: ${avg(likeP)}  дизлайки: ${avg(dislikeP)}  лайків у топ-100: ${hits}/${likeP.length}`);
}

await pool.end();
