#!/usr/bin/env bash
set -euo pipefail

# Production entrypoint: run migrations, import seed data if needed, start app

SEED_FILE="/app/db/seed-data/seed-data.sql.gz"

echo "Running database migrations..."
cd /app/server && node dist/db/migrate.js
cd /app

# Check if content table is empty (first run)
ROW_COUNT=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM content;" 2>/dev/null || echo "0")

if [ "$ROW_COUNT" -eq 0 ] && [ -f "$SEED_FILE" ]; then
  echo "Empty database detected. Importing seed data..."

  gunzip -c "$SEED_FILE" | psql "$DATABASE_URL" --single-transaction -q

  # Reset sequences
  psql "$DATABASE_URL" -q <<'SQL'
SELECT setval('content_id_seq', COALESCE((SELECT MAX(id) FROM content), 0));
SELECT setval('genres_id_seq', COALESCE((SELECT MAX(id) FROM genres), 0));
SELECT setval('people_id_seq', COALESCE((SELECT MAX(id) FROM people), 0));
SELECT setval('keywords_id_seq', COALESCE((SELECT MAX(id) FROM keywords), 0));
SELECT setval('collections_id_seq', COALESCE((SELECT MAX(id) FROM collections), 0));
SELECT setval('streaming_providers_id_seq', COALESCE((SELECT MAX(id) FROM streaming_providers), 0));
SELECT setval('awards_id_seq', COALESCE((SELECT MAX(id) FROM awards), 0));
SELECT setval('onboarding_seeds_id_seq', COALESCE((SELECT MAX(id) FROM onboarding_seeds), 0));
SQL

  IMPORTED=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM content;")
  echo "Seed data imported: $IMPORTED content rows."
else
  echo "Database already has $ROW_COUNT content rows. Skipping seed import."
fi

echo "Starting application..."
exec node server/dist/server.js
