ALTER TYPE "public"."swipe_action" ADD VALUE IF NOT EXISTS 'watched';--> statement-breakpoint
ALTER TABLE "user_watchlist" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "user_watchlist" CASCADE;--> statement-breakpoint
ALTER TABLE "user_swipes" ADD COLUMN "is_watched" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_swipes" ADD COLUMN "watched_at" timestamp with time zone;--> statement-breakpoint
UPDATE "user_swipes" SET "is_watched" = true, "watched_at" = "created_at" WHERE "action" IN ('like', 'dislike');--> statement-breakpoint
CREATE INDEX "idx_user_swipes_user_watched" ON "user_swipes" USING btree ("user_id","is_watched");