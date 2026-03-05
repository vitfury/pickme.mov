-- Enum values are added via drop+recreate in migration 0004
-- ALTER TYPE ADD VALUE cannot run inside a transaction
SELECT 1;
