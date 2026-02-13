#!/usr/bin/env bash
set -euo pipefail

# Export seed data from the pickme-db Docker container
# Outputs compressed SQL to db/seed-data/seed-data.sql.gz

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/db/seed-data"
OUTPUT_FILE="$OUTPUT_DIR/seed-data.sql.gz"
CONTAINER="pickme-db"

# Seed tables in FK-safe order (parents before children)
TABLES=(
  genres
  people
  keywords
  collections
  streaming_providers
  content
  entity_type_weights
  entity_idf_cache
  content_genres
  content_people
  content_keywords
  content_collections
  content_providers
  awards
  onboarding_seeds
)

# Build pg_dump -t flags
TABLE_FLAGS=""
for t in "${TABLES[@]}"; do
  TABLE_FLAGS="$TABLE_FLAGS -t $t"
done

mkdir -p "$OUTPUT_DIR"

echo "Exporting seed data from $CONTAINER..."

docker exec "$CONTAINER" pg_dump \
  -U pickme \
  -d pickme \
  --data-only \
  --column-inserts \
  --disable-triggers \
  $TABLE_FLAGS \
  | gzip > "$OUTPUT_FILE"

SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
echo "Export complete: $OUTPUT_FILE ($SIZE)"
