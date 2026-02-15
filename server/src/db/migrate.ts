import crypto from 'node:crypto';
import fs from 'node:fs';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';

async function seedMigrationJournal() {
  // If the schema was applied outside of drizzle-kit (e.g. via seed import),
  // the migrations journal won't exist. Detect this and backfill the initial
  // migration record so drizzle doesn't try to re-run 0000.
  const client = await pool.connect();
  try {
    // Check if the drizzle schema + table exist
    const { rows: schemaRows } = await client.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'drizzle'`
    );
    if (schemaRows.length > 0) return; // journal exists, nothing to do

    // Check if tables from migration 0000 already exist
    const { rows: tableRows } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'`
    );
    if (tableRows.length === 0) return; // fresh DB, let drizzle handle everything

    // Schema exists but no drizzle journal — backfill
    console.log('Existing schema detected without migration journal. Backfilling 0000...');

    // Compute the same SHA-256 hash that drizzle uses
    const sqlContent = fs.readFileSync('./drizzle/0000_daffy_karnak.sql').toString();
    const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');

    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);
    // Use the timestamp from _journal.json for migration 0000_daffy_karnak
    await client.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, 1770510064478]
    );
    console.log('Migration journal backfilled.');
  } finally {
    client.release();
  }
}

async function runMigrations() {
  await seedMigrationJournal();
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await pool.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
