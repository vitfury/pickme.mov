CREATE TYPE "public"."award_category_type" AS ENUM('picture', 'director', 'actor', 'actress', 'supporting_actor', 'supporting_actress', 'screenplay', 'cinematography', 'score', 'song', 'animated', 'international', 'other');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('movie', 'series', 'animation');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('genre', 'actor', 'director', 'keyword', 'decade', 'collection');--> statement-breakpoint
CREATE TYPE "public"."person_role" AS ENUM('actor', 'director', 'writer');--> statement-breakpoint
CREATE TYPE "public"."provider_type" AS ENUM('flatrate', 'rent', 'buy');--> statement-breakpoint
CREATE TYPE "public"."swipe_action" AS ENUM('like', 'dislike', 'superlike');--> statement-breakpoint
CREATE TABLE "awards" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_id" integer NOT NULL,
	"person_id" integer,
	"ceremony_year" smallint NOT NULL,
	"category" "award_category_type" NOT NULL,
	"category_detail" varchar(255),
	"won" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tmdb_id" integer,
	"name_en" varchar(255) NOT NULL,
	"name_uk" varchar(255),
	"description_en" text,
	"description_uk" text,
	"poster_path" varchar(255),
	"is_curated" boolean DEFAULT false,
	CONSTRAINT "collections_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "content" (
	"id" serial PRIMARY KEY NOT NULL,
	"tmdb_id" integer NOT NULL,
	"imdb_id" varchar(20),
	"content_type" "content_type" NOT NULL,
	"title_en" varchar(500) NOT NULL,
	"title_uk" varchar(500),
	"original_title" varchar(500),
	"overview_en" text,
	"overview_uk" text,
	"poster_path" varchar(255),
	"backdrop_path" varchar(255),
	"release_date" date,
	"runtime" smallint,
	"certification" varchar(10),
	"original_language" varchar(10),
	"production_countries" text[],
	"tmdb_rating" numeric(3, 1),
	"tmdb_vote_count" integer DEFAULT 0,
	"imdb_rating" numeric(3, 1),
	"popularity" numeric(10, 2),
	"revenue" bigint DEFAULT 0,
	"number_of_seasons" smallint,
	"number_of_episodes" smallint,
	"base_quality_score" numeric(5, 4) DEFAULT '0',
	"has_uk_translation" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "content_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "content_collections" (
	"content_id" integer NOT NULL,
	"collection_id" integer NOT NULL,
	"display_order" smallint,
	CONSTRAINT "content_collections_content_id_collection_id_pk" PRIMARY KEY("content_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "content_genres" (
	"content_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "content_genres_content_id_genre_id_pk" PRIMARY KEY("content_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "content_keywords" (
	"content_id" integer NOT NULL,
	"keyword_id" integer NOT NULL,
	CONSTRAINT "content_keywords_content_id_keyword_id_pk" PRIMARY KEY("content_id","keyword_id")
);
--> statement-breakpoint
CREATE TABLE "content_people" (
	"content_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"role" "person_role" NOT NULL,
	"character_name" varchar(255),
	"billing_order" smallint,
	CONSTRAINT "content_people_content_id_person_id_role_pk" PRIMARY KEY("content_id","person_id","role")
);
--> statement-breakpoint
CREATE TABLE "content_providers" (
	"content_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"provider_type" "provider_type" NOT NULL,
	"country" varchar(5) DEFAULT 'UA',
	CONSTRAINT "content_providers_content_id_provider_id_provider_type_country_pk" PRIMARY KEY("content_id","provider_id","provider_type","country")
);
--> statement-breakpoint
CREATE TABLE "entity_idf_cache" (
	"entity_type" "entity_type" NOT NULL,
	"entity_id" integer NOT NULL,
	"idf_weight" numeric(6, 4) NOT NULL,
	"content_count" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "entity_idf_cache_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "entity_type_weights" (
	"entity_type" "entity_type" PRIMARY KEY NOT NULL,
	"weight" numeric(4, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" serial PRIMARY KEY NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name_en" varchar(100) NOT NULL,
	"name_uk" varchar(100),
	"emoji" varchar(10),
	CONSTRAINT "genres_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name_en" varchar(255) NOT NULL,
	"name_uk" varchar(255),
	CONSTRAINT "keywords_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_seeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_id" integer NOT NULL,
	"display_order" smallint NOT NULL,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name_en" varchar(255) NOT NULL,
	"name_uk" varchar(255),
	"photo_path" varchar(255),
	"biography_en" text,
	"biography_uk" text,
	"known_for" "person_role",
	"popularity" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "people_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "streaming_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tmdb_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"logo_path" varchar(255),
	CONSTRAINT "streaming_providers_tmdb_id_unique" UNIQUE("tmdb_id")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" integer NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" integer NOT NULL,
	"raw_score" numeric(8, 4) DEFAULT '0',
	"interaction_count" integer DEFAULT 0,
	"last_updated" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_preferences_user_id_entity_type_entity_id_pk" PRIMARY KEY("user_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "user_swipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content_id" integer NOT NULL,
	"action" "swipe_action" NOT NULL,
	"content_type" "content_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_watchlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"content_id" integer NOT NULL,
	"watched" boolean DEFAULT false,
	"personal_rating" smallint,
	"watched_date" date,
	"notes" text,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "personal_rating_check" CHECK (personal_rating BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"avatar_url" text,
	"locale" varchar(10) DEFAULT 'uk',
	"theme" varchar(10) DEFAULT 'dark',
	"maturity_score" smallint DEFAULT 0,
	"onboarding_completed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "awards" ADD CONSTRAINT "awards_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_collections" ADD CONSTRAINT "content_collections_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_collections" ADD CONSTRAINT "content_collections_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_genres" ADD CONSTRAINT "content_genres_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_genres" ADD CONSTRAINT "content_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_keywords" ADD CONSTRAINT "content_keywords_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_keywords" ADD CONSTRAINT "content_keywords_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_people" ADD CONSTRAINT "content_people_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_people" ADD CONSTRAINT "content_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_providers" ADD CONSTRAINT "content_providers_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_providers" ADD CONSTRAINT "content_providers_provider_id_streaming_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."streaming_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_seeds" ADD CONSTRAINT "onboarding_seeds_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_swipes" ADD CONSTRAINT "user_swipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_swipes" ADD CONSTRAINT "user_swipes_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_watchlist" ADD CONSTRAINT "user_watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_watchlist" ADD CONSTRAINT "user_watchlist_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "awards_unique" ON "awards" USING btree ("content_id","person_id","ceremony_year","category");--> statement-breakpoint
CREATE INDEX "idx_awards_content" ON "awards" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_awards_person" ON "awards" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_awards_won" ON "awards" USING btree ("won");--> statement-breakpoint
CREATE INDEX "idx_content_type" ON "content" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "idx_content_quality" ON "content" USING btree ("content_type","base_quality_score");--> statement-breakpoint
CREATE INDEX "idx_content_tmdb_id" ON "content" USING btree ("tmdb_id");--> statement-breakpoint
CREATE INDEX "idx_content_imdb_id" ON "content" USING btree ("imdb_id");--> statement-breakpoint
CREATE INDEX "idx_content_release_date" ON "content" USING btree ("release_date");--> statement-breakpoint
CREATE INDEX "idx_content_popularity" ON "content" USING btree ("popularity");--> statement-breakpoint
CREATE INDEX "idx_content_collections_collection" ON "content_collections" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "idx_content_collections_content" ON "content_collections" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_content_genres_genre" ON "content_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "idx_content_genres_content" ON "content_genres" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_content_keywords_keyword" ON "content_keywords" USING btree ("keyword_id");--> statement-breakpoint
CREATE INDEX "idx_content_keywords_content" ON "content_keywords" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_content_people_person" ON "content_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_content_people_content" ON "content_people" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_content_people_role" ON "content_people" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_content_people_billing" ON "content_people" USING btree ("content_id","role","billing_order");--> statement-breakpoint
CREATE INDEX "idx_content_providers_content" ON "content_providers" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_content_providers_provider" ON "content_providers" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_people_tmdb_id" ON "people" USING btree ("tmdb_id");--> statement-breakpoint
CREATE INDEX "idx_people_popularity" ON "people" USING btree ("popularity");--> statement-breakpoint
CREATE INDEX "idx_user_prefs_user" ON "user_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_prefs_lookup" ON "user_preferences" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_swipes_user_content_unique" ON "user_swipes" USING btree ("user_id","content_id");--> statement-breakpoint
CREATE INDEX "idx_user_swipes_user_content" ON "user_swipes" USING btree ("user_id","content_id");--> statement-breakpoint
CREATE INDEX "idx_user_swipes_user_action" ON "user_swipes" USING btree ("user_id","action");--> statement-breakpoint
CREATE INDEX "idx_user_swipes_user_type" ON "user_swipes" USING btree ("user_id","content_type");--> statement-breakpoint
CREATE INDEX "idx_user_swipes_created" ON "user_swipes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_watchlist_user_content_unique" ON "user_watchlist" USING btree ("user_id","content_id");--> statement-breakpoint
CREATE INDEX "idx_watchlist_user" ON "user_watchlist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_watchlist_user_watched" ON "user_watchlist" USING btree ("user_id","watched");--> statement-breakpoint
CREATE INDEX "idx_watchlist_user_order" ON "user_watchlist" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_users_google_id" ON "users" USING btree ("google_id");