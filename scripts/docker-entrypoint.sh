#!/bin/sh
set -eu

# Production entrypoint: run migrations, import seed data, start app

SEED_FILE="/app/db/seed-data/seed-data.sql.gz"

echo "Running database migrations..."
cd /app/server && node dist/db/migrate.js
cd /app

# Import seed data (additive — ON CONFLICT DO NOTHING skips existing rows)
if [ -f "$SEED_FILE" ]; then
  echo "Importing seed data (additive)..."

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
  echo "Seed data: $IMPORTED content rows total."
fi

echo "Starting application..."
exec node server/dist/server.js
