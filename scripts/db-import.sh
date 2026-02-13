#!/usr/bin/env bash
set -euo pipefail

# Import seed data into the pickme-db Docker container
# Truncates existing seed data, loads from db/seed-data/seed-data.sql.gz

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SEED_FILE="$PROJECT_DIR/db/seed-data/seed-data.sql.gz"
CONTAINER="pickme-db"

if [ ! -f "$SEED_FILE" ]; then
  echo "Error: $SEED_FILE not found. Run 'npm run db:export' first."
  exit 1
fi

echo "Truncating seed tables..."

docker exec -i "$CONTAINER" psql -U pickme -d pickme <<'SQL'
TRUNCATE
  onboarding_seeds,
  awards,
  content_providers,
  content_collections,
  content_keywords,
  content_people,
  content_genres,
  entity_idf_cache,
  entity_type_weights,
  content,
  streaming_providers,
  collections,
  keywords,
  people,
  genres
CASCADE;
SQL

echo "Importing seed data..."

gunzip -c "$SEED_FILE" | docker exec -i "$CONTAINER" psql \
  -U pickme \
  -d pickme \
  --single-transaction \
  -q

echo "Resetting sequences..."

docker exec -i "$CONTAINER" psql -U pickme -d pickme <<'SQL'
SELECT setval('content_id_seq', COALESCE((SELECT MAX(id) FROM content), 0));
SELECT setval('genres_id_seq', COALESCE((SELECT MAX(id) FROM genres), 0));
SELECT setval('people_id_seq', COALESCE((SELECT MAX(id) FROM people), 0));
SELECT setval('keywords_id_seq', COALESCE((SELECT MAX(id) FROM keywords), 0));
SELECT setval('collections_id_seq', COALESCE((SELECT MAX(id) FROM collections), 0));
SELECT setval('streaming_providers_id_seq', COALESCE((SELECT MAX(id) FROM streaming_providers), 0));
SELECT setval('awards_id_seq', COALESCE((SELECT MAX(id) FROM awards), 0));
SELECT setval('onboarding_seeds_id_seq', COALESCE((SELECT MAX(id) FROM onboarding_seeds), 0));
SQL

echo "Import complete. Row counts:"

docker exec -i "$CONTAINER" psql -U pickme -d pickme <<'SQL'
SELECT 'content' AS tbl, COUNT(*) FROM content
UNION ALL SELECT 'genres', COUNT(*) FROM genres
UNION ALL SELECT 'people', COUNT(*) FROM people
UNION ALL SELECT 'keywords', COUNT(*) FROM keywords
UNION ALL SELECT 'collections', COUNT(*) FROM collections
UNION ALL SELECT 'streaming_providers', COUNT(*) FROM streaming_providers
UNION ALL SELECT 'awards', COUNT(*) FROM awards
UNION ALL SELECT 'content_genres', COUNT(*) FROM content_genres
UNION ALL SELECT 'content_people', COUNT(*) FROM content_people
UNION ALL SELECT 'content_keywords', COUNT(*) FROM content_keywords
UNION ALL SELECT 'content_collections', COUNT(*) FROM content_collections
UNION ALL SELECT 'content_providers', COUNT(*) FROM content_providers
UNION ALL SELECT 'entity_type_weights', COUNT(*) FROM entity_type_weights
UNION ALL SELECT 'entity_idf_cache', COUNT(*) FROM entity_idf_cache
UNION ALL SELECT 'onboarding_seeds', COUNT(*) FROM onboarding_seeds
ORDER BY tbl;
SQL
