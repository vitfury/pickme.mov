CREATE TABLE "user_bookmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_bookmarks_user_content_unique" ON "user_bookmarks" USING btree ("user_id","content_id");--> statement-breakpoint
CREATE INDEX "idx_bookmarks_user" ON "user_bookmarks" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "public"."awards" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."award_category_type";--> statement-breakpoint
CREATE TYPE "public"."award_category_type" AS ENUM('picture', 'director', 'actor', 'actress', 'supporting_actor', 'supporting_actress', 'original_screenplay', 'adapted_screenplay', 'animated', 'international', 'documentary_feature', 'documentary_short', 'short_live_action', 'short_animated', 'score', 'song', 'sound', 'production_design', 'cinematography', 'makeup', 'costume_design', 'editing', 'visual_effects');--> statement-breakpoint
ALTER TABLE "public"."awards" ALTER COLUMN "category" SET DATA TYPE "public"."award_category_type" USING "category"::"public"."award_category_type";