/**
 * Fetch real IMDb ratings from IMDb's free dataset (title.ratings.tsv.gz)
 * and update the imdb_rating column in our content table.
 *
 * Usage: npx tsx scripts/fetch-imdb-ratings.ts
 */

import { createReadStream } from 'fs';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pickme:pickme_dev@localhost:5432/pickme';
const RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';
const TEMP_FILE = '/tmp/imdb_ratings.tsv.gz';

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download: ${res.status}`);
  const fileStream = createWriteStream(dest);
  // @ts-ignore — node fetch body is a web ReadableStream
  const reader = res.body.getReader();
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(value);
    totalBytes += value.length;
    process.stdout.write(`\r  Downloaded ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  }
  fileStream.end();
  await new Promise((resolve) => fileStream.on('finish', resolve));
  console.log(`\n  Saved to ${dest}`);
}

async function parseRatings(filePath: string): Promise<Map<string, number>> {
  console.log('Parsing IMDb ratings TSV...');
  const ratings = new Map<string, number>();

  const gunzip = createGunzip();
  const fileStream = createReadStream(filePath);
  const rl = createInterface({ input: fileStream.pipe(gunzip) });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // skip header: tconst  averageRating  numVotes

    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const tconst = parts[0]; // e.g. tt0111161
    const rating = parseFloat(parts[1]);

    if (tconst && !isNaN(rating)) {
      ratings.set(tconst, rating);
    }
  }

  console.log(`  Parsed ${ratings.size.toLocaleString()} ratings`);
  return ratings;
}

async function updateDatabase(ratings: Map<string, number>): Promise<void> {
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  console.log('Connected to database');

  // Get all content with imdb_id
  const { rows } = await client.query<{ id: number; imdb_id: string }>(
    `SELECT id, imdb_id FROM content WHERE imdb_id IS NOT NULL AND imdb_id != ''`
  );
  console.log(`  Found ${rows.length.toLocaleString()} movies with IMDb IDs`);

  let matched = 0;
  let unmatched = 0;
  const BATCH_SIZE = 500;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const values: string[] = [];
    const params: (number | string)[] = [];
    let paramIdx = 1;

    for (const row of batch) {
      const rating = ratings.get(row.imdb_id);
      if (rating !== undefined) {
        values.push(`($${paramIdx}, $${paramIdx + 1})`);
        params.push(row.id, rating);
        paramIdx += 2;
        matched++;
      } else {
        unmatched++;
      }
    }

    if (values.length > 0) {
      await client.query(
        `UPDATE content SET imdb_rating = v.rating::numeric(3,1)
         FROM (VALUES ${values.join(',')}) AS v(id, rating)
         WHERE content.id = v.id::int`,
        params,
      );
    }

    process.stdout.write(`\r  Updated ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
  }

  console.log(`\n  Matched: ${matched.toLocaleString()}, Unmatched: ${unmatched.toLocaleString()}`);

  // Verify
  const { rows: stats } = await client.query(
    `SELECT COUNT(*) AS total, COUNT(imdb_rating) AS has_rating,
            ROUND(AVG(imdb_rating::numeric), 2) AS avg_rating
     FROM content WHERE imdb_id IS NOT NULL`
  );
  console.log(`  Verification: ${stats[0].has_rating}/${stats[0].total} have IMDb ratings, avg: ${stats[0].avg_rating}`);

  await client.end();
}

async function main() {
  console.log('=== IMDb Ratings Import ===\n');

  await downloadFile(RATINGS_URL, TEMP_FILE);
  const ratings = await parseRatings(TEMP_FILE);
  await updateDatabase(ratings);

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
