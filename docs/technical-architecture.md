# pickme.mov — Technical Architecture

## Table of Contents

1. [PostgreSQL Database Schema](#1-postgresql-database-schema)
2. [API Architecture](#2-api-architecture)
3. [Recommendation Engine Detail](#3-recommendation-engine-detail)
4. [Data Seeding Strategy](#4-data-seeding-strategy)
5. [Docker Compose Setup](#5-docker-compose-setup)

---

## 1. PostgreSQL Database Schema

### 1.1 Enums

```sql
CREATE TYPE content_type AS ENUM ('movie', 'series', 'animation');
CREATE TYPE swipe_action AS ENUM ('like', 'dislike', 'superlike');
CREATE TYPE person_role AS ENUM ('actor', 'director', 'writer');
CREATE TYPE provider_type AS ENUM ('flatrate', 'rent', 'buy');
CREATE TYPE entity_type AS ENUM ('genre', 'actor', 'director', 'keyword', 'decade', 'collection');
CREATE TYPE award_category_type AS ENUM ('picture', 'director', 'actor', 'actress', 'supporting_actor', 'supporting_actress', 'screenplay', 'cinematography', 'score', 'song', 'animated', 'international', 'other');
```

### 1.2 Users

```sql
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    google_id       VARCHAR(255) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    locale          VARCHAR(10) DEFAULT 'uk',       -- 'uk' or 'en'
    theme           VARCHAR(10) DEFAULT 'dark',     -- 'dark' or 'light'
    maturity_score  SMALLINT DEFAULT 0,             -- 0..50+ total swipes (caps influence at 50)
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_google_id ON users (google_id);
```

### 1.3 Content (Movies / Series / Animation)

Single table for all content types, discriminated by `content_type` enum.

```sql
CREATE TABLE content (
    id                  SERIAL PRIMARY KEY,
    tmdb_id             INT UNIQUE NOT NULL,
    imdb_id             VARCHAR(20),                -- e.g. 'tt1375666'
    content_type        content_type NOT NULL,

    -- Titles (bilingual)
    title_en            VARCHAR(500) NOT NULL,
    title_uk            VARCHAR(500),               -- NULL if no Ukrainian translation
    original_title      VARCHAR(500),

    -- Descriptions (bilingual)
    overview_en         TEXT,
    overview_uk         TEXT,

    -- Media
    poster_path         VARCHAR(255),               -- TMDB path, e.g. '/qJ2tW6WMUDux911p7NkQ...'
    backdrop_path       VARCHAR(255),

    -- Metadata
    release_date        DATE,
    runtime             SMALLINT,                   -- minutes (NULL for series)
    certification       VARCHAR(10),                -- 'PG', 'PG-13', 'R', etc.
    original_language   VARCHAR(10),
    production_countries TEXT[],                     -- array of ISO 3166-1 codes

    -- Ratings
    tmdb_rating         NUMERIC(3,1),               -- 0.0 – 10.0
    tmdb_vote_count     INT DEFAULT 0,
    imdb_rating         NUMERIC(3,1),
    popularity          NUMERIC(10,2),              -- TMDB popularity score
    revenue             BIGINT DEFAULT 0,

    -- Series-specific
    number_of_seasons   SMALLINT,
    number_of_episodes  SMALLINT,

    -- Pre-computed quality score (0.0 – 1.0), recalculated during seeding
    base_quality_score  NUMERIC(5,4) DEFAULT 0,

    -- Translation tracking
    has_uk_translation  BOOLEAN DEFAULT FALSE,

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Critical indexes for feed generation
CREATE INDEX idx_content_type ON content (content_type);
CREATE INDEX idx_content_quality ON content (content_type, base_quality_score DESC);
CREATE INDEX idx_content_tmdb_id ON content (tmdb_id);
CREATE INDEX idx_content_imdb_id ON content (imdb_id);
CREATE INDEX idx_content_release_date ON content (release_date);
CREATE INDEX idx_content_popularity ON content (popularity DESC);
```

### 1.4 Genres

```sql
CREATE TABLE genres (
    id          SERIAL PRIMARY KEY,
    tmdb_id     INT UNIQUE NOT NULL,
    name_en     VARCHAR(100) NOT NULL,
    name_uk     VARCHAR(100),
    emoji       VARCHAR(10)                         -- '🔪' for Horror, '😂' for Comedy, etc.
);

CREATE TABLE content_genres (
    content_id  INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    genre_id    INT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, genre_id)
);

CREATE INDEX idx_content_genres_genre ON content_genres (genre_id);
CREATE INDEX idx_content_genres_content ON content_genres (content_id);
```

### 1.5 People (Actors, Directors, Writers)

```sql
CREATE TABLE people (
    id              SERIAL PRIMARY KEY,
    tmdb_id         INT UNIQUE NOT NULL,
    name_en         VARCHAR(255) NOT NULL,
    name_uk         VARCHAR(255),
    photo_path      VARCHAR(255),                   -- TMDB profile path
    biography_en    TEXT,
    biography_uk    TEXT,
    known_for       person_role,                    -- primary known-for role
    popularity      NUMERIC(10,2),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_people_tmdb_id ON people (tmdb_id);
CREATE INDEX idx_people_popularity ON people (popularity DESC);
CREATE INDEX idx_people_name_en ON people USING gin (to_tsvector('english', name_en));
```

### 1.6 Content-Person Junction

```sql
CREATE TABLE content_people (
    content_id      INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    person_id       INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role            person_role NOT NULL,
    character_name  VARCHAR(255),                   -- for actors: character they played
    billing_order   SMALLINT,                       -- 1 = top-billed, NULL for directors/writers
    PRIMARY KEY (content_id, person_id, role)
);

CREATE INDEX idx_content_people_person ON content_people (person_id);
CREATE INDEX idx_content_people_content ON content_people (content_id);
CREATE INDEX idx_content_people_role ON content_people (role);
CREATE INDEX idx_content_people_billing ON content_people (content_id, role, billing_order)
    WHERE role = 'actor';
```

### 1.7 Keywords

```sql
CREATE TABLE keywords (
    id          SERIAL PRIMARY KEY,
    tmdb_id     INT UNIQUE NOT NULL,
    name_en     VARCHAR(255) NOT NULL,
    name_uk     VARCHAR(255)
);

CREATE TABLE content_keywords (
    content_id  INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    keyword_id  INT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, keyword_id)
);

CREATE INDEX idx_content_keywords_keyword ON content_keywords (keyword_id);
CREATE INDEX idx_content_keywords_content ON content_keywords (content_id);
```

### 1.8 Collections

Covers both TMDB collections (e.g. "The Dark Knight Collection") and custom curated lists (e.g. "Oscar Best Picture Winners").

```sql
CREATE TABLE collections (
    id              SERIAL PRIMARY KEY,
    tmdb_id         INT UNIQUE,                     -- NULL for custom/curated lists
    name_en         VARCHAR(255) NOT NULL,
    name_uk         VARCHAR(255),
    description_en  TEXT,
    description_uk  TEXT,
    poster_path     VARCHAR(255),
    is_curated      BOOLEAN DEFAULT FALSE           -- TRUE for manually curated lists
);

CREATE TABLE content_collections (
    content_id      INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    collection_id   INT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    display_order   SMALLINT,                       -- order within collection
    PRIMARY KEY (content_id, collection_id)
);

CREATE INDEX idx_content_collections_collection ON content_collections (collection_id);
CREATE INDEX idx_content_collections_content ON content_collections (content_id);
```

### 1.9 Awards (Oscars)

```sql
CREATE TABLE awards (
    id              SERIAL PRIMARY KEY,
    content_id      INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    person_id       INT REFERENCES people(id) ON DELETE SET NULL,   -- NULL for Best Picture, etc.
    ceremony_year   SMALLINT NOT NULL,              -- e.g. 2024
    category        award_category_type NOT NULL,
    category_detail VARCHAR(255),                   -- full category name: "Best Performance by an Actor in a Leading Role"
    won             BOOLEAN DEFAULT FALSE,
    UNIQUE (content_id, person_id, ceremony_year, category)
);

CREATE INDEX idx_awards_content ON awards (content_id);
CREATE INDEX idx_awards_person ON awards (person_id);
CREATE INDEX idx_awards_won ON awards (won) WHERE won = TRUE;
```

### 1.10 Streaming Providers

```sql
CREATE TABLE streaming_providers (
    id              SERIAL PRIMARY KEY,
    tmdb_id         INT UNIQUE NOT NULL,
    name            VARCHAR(255) NOT NULL,
    logo_path       VARCHAR(255)                    -- TMDB logo path
);

CREATE TABLE content_providers (
    content_id      INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    provider_id     INT NOT NULL REFERENCES streaming_providers(id) ON DELETE CASCADE,
    provider_type   provider_type NOT NULL,         -- flatrate/rent/buy
    country         VARCHAR(5) DEFAULT 'UA',        -- ISO 3166-1 code
    PRIMARY KEY (content_id, provider_id, provider_type, country)
);

CREATE INDEX idx_content_providers_content ON content_providers (content_id);
CREATE INDEX idx_content_providers_provider ON content_providers (provider_id);
```

### 1.11 User Swipes

```sql
CREATE TABLE user_swipes (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id      INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    action          swipe_action NOT NULL,
    content_type    content_type NOT NULL,           -- denormalized for fast filtering
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, content_id)
);

-- THE most critical index: used to exclude already-seen content from feed
CREATE INDEX idx_user_swipes_user_content ON user_swipes (user_id, content_id);
CREATE INDEX idx_user_swipes_user_action ON user_swipes (user_id, action);
CREATE INDEX idx_user_swipes_user_type ON user_swipes (user_id, content_type);
CREATE INDEX idx_user_swipes_created ON user_swipes (user_id, created_at DESC);
```

### 1.12 User Preferences

Stores the learned preference weights per entity for each user.

```sql
CREATE TABLE user_preferences (
    user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type         entity_type NOT NULL,
    entity_id           INT NOT NULL,               -- genre.id, people.id, keyword.id, decade int, collection.id
    raw_score           NUMERIC(8,4) DEFAULT 0,     -- accumulated from swipes
    interaction_count   INT DEFAULT 0,
    last_updated        TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, entity_type, entity_id)
);

-- Critical for feed personalization score calculation
CREATE INDEX idx_user_prefs_user ON user_preferences (user_id);
CREATE INDEX idx_user_prefs_lookup ON user_preferences (user_id, entity_type, entity_id);
```

### 1.13 User Watchlist

Extended from likes — users can track watched status and rate content.

```sql
CREATE TABLE user_watchlist (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id      INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    watched         BOOLEAN DEFAULT FALSE,
    personal_rating SMALLINT CHECK (personal_rating BETWEEN 1 AND 10),
    watched_date    DATE,
    notes           TEXT,
    sort_order      INT,                            -- for manual reordering
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, content_id)
);

CREATE INDEX idx_watchlist_user ON user_watchlist (user_id);
CREATE INDEX idx_watchlist_user_watched ON user_watchlist (user_id, watched);
CREATE INDEX idx_watchlist_user_order ON user_watchlist (user_id, sort_order);
```

### 1.14 Entity IDF Cache

Pre-computed IDF (Inverse Document Frequency) weights for recommendation scoring. Recalculated during data seeding or nightly.

```sql
CREATE TABLE entity_idf_cache (
    entity_type     entity_type NOT NULL,
    entity_id       INT NOT NULL,
    idf_weight      NUMERIC(6,4) NOT NULL,          -- LOG(total_content / content_with_entity)
    content_count   INT NOT NULL,                   -- how many content items have this entity
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (entity_type, entity_id)
);
```

### 1.15 Onboarding Seed Movies

The 8-12 famous movies shown during the "Quick Rate" onboarding step.

```sql
CREATE TABLE onboarding_seeds (
    id              SERIAL PRIMARY KEY,
    content_id      INT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
    display_order   SMALLINT NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE            -- can deactivate without deleting
);

-- Seed data: well-known movies across genres for onboarding
-- These are inserted during data seeding once content table is populated.
-- Target: 12 movies covering Action, Comedy, Drama, Sci-Fi, Horror, Thriller, Romance, Animation
-- Examples: The Dark Knight, Inception, Forrest Gump, Titanic, The Matrix,
--           Pulp Fiction, The Shawshank Redemption, Interstellar,
--           Parasite, Get Out, The Notebook, Toy Story
```

### 1.16 Entity Type Weights (Configuration Table)

Static configuration for the entity weight multipliers used in scoring.

```sql
CREATE TABLE entity_type_weights (
    entity_type     entity_type PRIMARY KEY,
    weight          NUMERIC(4,2) NOT NULL
);

INSERT INTO entity_type_weights (entity_type, weight) VALUES
    ('director',   1.50),
    ('genre',      1.00),
    ('actor',      0.80),  -- top 3 billed; supporting actors get 0.40 via billing_order logic
    ('keyword',    0.60),
    ('collection', 0.50),
    ('decade',     0.30);
```

### 1.17 Full Schema Diagram (Relationships)

```
users ──┬── user_swipes ──── content
        ├── user_preferences
        ├── user_watchlist ── content
        │
content ──┬── content_genres ──── genres
          ├── content_people ──── people
          ├── content_keywords ── keywords
          ├── content_collections ── collections
          ├── content_providers ── streaming_providers
          ├── awards (→ people)
          │
entity_idf_cache (standalone lookup)
entity_type_weights (static config)
onboarding_seeds → content
```

### 1.18 Updated Timestamps Trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_content_updated_at
    BEFORE UPDATE ON content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_watchlist_updated_at
    BEFORE UPDATE ON user_watchlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 2. API Architecture

Base URL: `/api/v1`

All endpoints return JSON. Authenticated endpoints require `Authorization: Bearer <jwt>` header.

### 2.1 Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/auth/google` | No | Redirect to Google OAuth consent screen |
| GET | `/auth/google/callback` | No | Handle OAuth callback, issue JWT |
| POST | `/auth/refresh` | No | Refresh expired JWT using refresh token |
| POST | `/auth/logout` | Yes | Invalidate refresh token |

#### `GET /auth/google`
Redirects browser to Google OAuth consent URL. Sets `state` parameter for CSRF protection.

#### `GET /auth/google/callback`
**Query params:** `code`, `state`
**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": 1,
    "displayName": "John Doe",
    "email": "john@gmail.com",
    "avatarUrl": "https://...",
    "locale": "uk",
    "onboardingCompleted": false
  }
}
```

#### `POST /auth/refresh`
**Request body:** `{ "refreshToken": "eyJ..." }`
**Response:** `{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }`

#### `POST /auth/logout`
**Response:** `204 No Content`

---

### 2.2 Feed Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/feed` | Yes | Get next batch of content cards |
| POST | `/feed/swipe` | Yes | Record a swipe action |
| POST | `/feed/undo` | Yes | Undo last swipe |

#### `GET /feed`
**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `contentType` | string | `movie` | `movie`, `series`, or `animation` |
| `limit` | int | `20` | Number of cards to fetch (max 50) |
| `genres` | int[] | — | Filter by genre IDs (comma-separated) |
| `yearMin` | int | — | Minimum release year |
| `yearMax` | int | — | Maximum release year |
| `ratingMin` | float | — | Minimum TMDB/IMDB rating |
| `ratingMax` | float | — | Maximum rating |
| `certification` | string[] | — | Age certifications (comma-separated) |
| `providers` | int[] | — | Streaming provider IDs |
| `personId` | int | — | Filter by actor/director |
| `collectionId` | int | — | Filter by collection |
| `awards` | string | — | `winner`, `nominated`, or omit |

**Response:**
```json
{
  "cards": [
    {
      "id": 42,
      "tmdbId": 27205,
      "contentType": "movie",
      "title": "Inception",          // localized based on user locale
      "originalTitle": "Inception",
      "posterPath": "/qJ2tW6WMUDux911p7NkQ...",
      "backdropPath": "/s3TBrRGB1iav7gFOCNx3H31...",
      "releaseDate": "2010-07-16",
      "runtime": 148,
      "certification": "PG-13",
      "tmdbRating": 8.4,
      "imdbRating": 8.8,
      "overview": "A thief who steals corporate secrets...",
      "genres": [
        { "id": 1, "name": "Sci-Fi", "emoji": "🚀" }
      ],
      "cast": [
        {
          "id": 5,
          "name": "Leonardo DiCaprio",
          "character": "Dom Cobb",
          "photoPath": "/wo2hJpn04vbtmh0B9...",
          "billingOrder": 1
        }
      ],
      "directors": [
        { "id": 3, "name": "Christopher Nolan", "photoPath": "/xuAIuYSmsUzKlQ..." }
      ],
      "awards": [
        { "category": "cinematography", "year": 2011, "won": true },
        { "category": "picture", "year": 2011, "won": false }
      ],
      "providers": [
        { "id": 8, "name": "Netflix", "logoPath": "/t2yyOv40HZeVl...", "type": "flatrate" }
      ],
      "recommendationReason": "You liked 3 other Christopher Nolan films",
      "feedScore": 0.847
    }
  ],
  "remaining": 4283,
  "maturityScore": 35
}
```

#### `POST /feed/swipe`
**Request body:**
```json
{
  "contentId": 42,
  "action": "like"
}
```
**Response:**
```json
{
  "success": true,
  "addedToWatchlist": true,
  "maturityScore": 36,
  "preferencesUpdated": ["genre:sci-fi +1.0", "director:nolan +1.5"]
}
```
The `preferencesUpdated` field is for debugging/transparency — shows which entities were updated.

#### `POST /feed/undo`
**Response:**
```json
{
  "success": true,
  "restoredContent": {
    "id": 41,
    "title": "The Matrix",
    "posterPath": "/f89U3ADr1oiB1s9GkdPOEpXUk.jpg"
  }
}
```

---

### 2.3 Watchlist Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/watchlist` | Yes | Get user's watchlist |
| PATCH | `/watchlist/:contentId` | Yes | Update watchlist entry (mark watched, rate) |
| DELETE | `/watchlist/:contentId` | Yes | Remove from watchlist |

#### `GET /watchlist`
**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `filter` | string | `all` | `all`, `watched`, `unwatched` |
| `sort` | string | `added` | `added`, `rating`, `year`, `personal_rating`, `title` |
| `order` | string | `desc` | `asc` or `desc` |
| `contentType` | string | — | Filter by content type |
| `page` | int | 1 | Pagination |
| `limit` | int | 30 | Items per page |

**Response:**
```json
{
  "items": [
    {
      "contentId": 42,
      "title": "Inception",
      "posterPath": "/qJ2tW6...",
      "releaseDate": "2010-07-16",
      "tmdbRating": 8.4,
      "contentType": "movie",
      "watched": false,
      "personalRating": null,
      "watchedDate": null,
      "notes": null,
      "addedAt": "2026-02-07T10:30:00Z"
    }
  ],
  "total": 47,
  "counts": {
    "all": 47,
    "watched": 12,
    "unwatched": 35
  }
}
```

#### `PATCH /watchlist/:contentId`
**Request body:**
```json
{
  "watched": true,
  "personalRating": 9,
  "watchedDate": "2026-02-07",
  "notes": "Incredible movie, loved the ending"
}
```
**Response:** `200` with updated watchlist entry.

When `personalRating` is provided and `watched` is true, the backend also updates user preferences:
- Rating 8-10: equivalent to an additional like (+1.0 to entities)
- Rating 5-7: no preference update
- Rating 1-4: equivalent to a dislike (-0.3 to entities)

#### `DELETE /watchlist/:contentId`
Also records a dislike in `user_swipes` (replaces the previous like).
**Response:** `204 No Content`

---

### 2.4 Search Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search` | Yes | Search movies, series, and people |

#### `GET /search`
**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Search query (min 2 chars) |
| `type` | string | Optional: `content`, `person`, or omit for all |
| `limit` | int | Max results per type (default 10) |

**Response:**
```json
{
  "content": [
    {
      "id": 42,
      "title": "Inception",
      "posterPath": "/qJ2tW6...",
      "releaseDate": "2010-07-16",
      "contentType": "movie",
      "tmdbRating": 8.4
    }
  ],
  "people": [
    {
      "id": 3,
      "name": "Christopher Nolan",
      "photoPath": "/xuAIuYS...",
      "knownFor": "director"
    }
  ]
}
```

Search uses PostgreSQL full-text search (`to_tsvector`/`to_tsquery`) on `title_en`, `title_uk`, `name_en`, `name_uk`.

---

### 2.5 Filter Data Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/filters/genres` | Yes | Get all genres |
| GET | `/filters/providers` | Yes | Get streaming providers for a country |
| GET | `/filters/collections` | Yes | Get browseable collections |
| GET | `/filters/certifications` | Yes | Get available certifications |

#### `GET /filters/genres`
**Response:**
```json
{
  "genres": [
    { "id": 1, "name": "Action", "emoji": "💥", "contentCount": 1230 },
    { "id": 2, "name": "Comedy", "emoji": "😂", "contentCount": 987 }
  ]
}
```

#### `GET /filters/providers`
**Query params:** `country` (default: `UA`)
**Response:**
```json
{
  "providers": [
    { "id": 8, "name": "Netflix", "logoPath": "/t2yyOv..." },
    { "id": 337, "name": "Disney+", "logoPath": "/7rwgEs..." }
  ]
}
```

#### `GET /filters/collections`
**Response:**
```json
{
  "collections": [
    { "id": 1, "name": "Oscar Best Picture Winners", "posterPath": null, "contentCount": 54 }
  ]
}
```

#### `GET /filters/certifications`
**Response:**
```json
{
  "certifications": ["G", "PG", "PG-13", "R"]
}
```

---

### 2.6 Person Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/people/:id` | Yes | Get person details |
| GET | `/people/:id/filmography` | Yes | Get person's filmography |

#### `GET /people/:id`
**Response:**
```json
{
  "id": 3,
  "name": "Christopher Nolan",
  "photoPath": "/xuAIuYS...",
  "biography": "Christopher Edward Nolan is a British-American...",
  "knownFor": "director",
  "awards": [
    { "category": "director", "year": 2024, "won": true, "contentTitle": "Oppenheimer" }
  ],
  "filmographyCount": 12
}
```

#### `GET /people/:id/filmography`
**Query params:** `role` (optional: `actor`, `director`, `writer`), `sort` (default: `year`)
**Response:**
```json
{
  "items": [
    {
      "contentId": 99,
      "title": "Oppenheimer",
      "posterPath": "/8Gxv8gSF...",
      "releaseDate": "2023-07-21",
      "tmdbRating": 8.1,
      "role": "director",
      "inWatchlist": true,
      "swiped": "like"
    }
  ]
}
```

---

### 2.7 User / Profile Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | Yes | Get current user profile |
| PATCH | `/users/me` | Yes | Update locale, theme |
| GET | `/users/me/stats` | Yes | Get user statistics |
| GET | `/users/me/preferences` | Yes | Get preference breakdown |
| POST | `/users/me/reset-preferences` | Yes | Reset all preference data |
| GET | `/users/me/export` | Yes | Export watchlist as JSON/CSV |

#### `GET /users/me/stats`
**Response:**
```json
{
  "totalSwiped": 234,
  "likes": 87,
  "dislikes": 142,
  "superlikes": 5,
  "watchlistSize": 87,
  "watched": 23,
  "topGenres": [
    { "genre": "Sci-Fi", "score": 12.4 },
    { "genre": "Thriller", "score": 9.8 }
  ],
  "topDirectors": [
    { "name": "Christopher Nolan", "score": 8.7 }
  ],
  "topActors": [
    { "name": "Leonardo DiCaprio", "score": 6.2 }
  ]
}
```

#### `GET /users/me/preferences`
**Response:**
```json
{
  "maturityScore": 42,
  "preferences": {
    "genre": [
      { "entityId": 878, "name": "Sci-Fi", "score": 12.4, "interactions": 18 }
    ],
    "director": [
      { "entityId": 525, "name": "Christopher Nolan", "score": 8.7, "interactions": 6 }
    ],
    "actor": [],
    "keyword": [],
    "decade": [],
    "collection": []
  }
}
```

#### `POST /users/me/reset-preferences`
Deletes all `user_preferences` rows, resets `maturity_score` to 0 on `users` table. Does NOT delete swipe history or watchlist.
**Response:** `204 No Content`

#### `GET /users/me/export`
**Query params:** `format` (`json` or `csv`, default `json`)
**Response:** Downloadable file with watchlist data.

---

### 2.8 Onboarding Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/onboarding/genres` | Yes | Get genre chips for selection |
| GET | `/onboarding/seeds` | Yes | Get seed movies for quick-rate |
| POST | `/onboarding/complete` | Yes | Submit onboarding selections |

#### `GET /onboarding/genres`
Returns all genres with representative poster thumbnails.
**Response:**
```json
{
  "genres": [
    { "id": 28, "name": "Action", "emoji": "💥", "posterPath": "/sampleAction.jpg" }
  ]
}
```

#### `GET /onboarding/seeds`
Returns the 8-12 seed movies for quick-rating step.
**Response:**
```json
{
  "seeds": [
    {
      "id": 42,
      "title": "Inception",
      "posterPath": "/qJ2tW6...",
      "releaseDate": "2010-07-16",
      "genres": ["Sci-Fi", "Action"]
    }
  ]
}
```

#### `POST /onboarding/complete`
**Request body:**
```json
{
  "selectedGenres": [28, 878, 53],
  "movieRatings": [
    { "contentId": 42, "action": "like" },
    { "contentId": 15, "action": "dislike" },
    { "contentId": 77, "action": "like" }
  ]
}
```
**Processing:** Seeds `user_preferences` with genre scores from selected genres, processes each movie rating as a swipe (updating all entity preferences), sets `onboarding_completed = true`.
**Response:**
```json
{
  "success": true,
  "maturityScore": 8,
  "message": "Your feed is ready!"
}
```

---

### 2.9 Content Detail Endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/content/:id` | Yes | Get full content detail |

#### `GET /content/:id`
**Response:**
```json
{
  "id": 42,
  "tmdbId": 27205,
  "contentType": "movie",
  "title": "Inception",
  "originalTitle": "Inception",
  "overview": "A thief who steals corporate secrets through dream-sharing...",
  "posterPath": "/qJ2tW6...",
  "backdropPath": "/s3TBrR...",
  "releaseDate": "2010-07-16",
  "runtime": 148,
  "certification": "PG-13",
  "tmdbRating": 8.4,
  "imdbRating": 8.8,
  "imdbId": "tt1375666",
  "genres": [
    { "id": 1, "name": "Sci-Fi", "emoji": "🚀" }
  ],
  "cast": [
    { "id": 5, "name": "Leonardo DiCaprio", "character": "Dom Cobb", "photoPath": "/wo2hJpn...", "billingOrder": 1 }
  ],
  "directors": [
    { "id": 3, "name": "Christopher Nolan", "photoPath": "/xuAIuYS..." }
  ],
  "writers": [
    { "id": 3, "name": "Christopher Nolan" }
  ],
  "awards": [
    { "category": "picture", "year": 2011, "won": false },
    { "category": "cinematography", "year": 2011, "won": true }
  ],
  "providers": [
    { "id": 8, "name": "Netflix", "logoPath": "/t2yyOv...", "type": "flatrate" }
  ],
  "keywords": ["dream", "heist", "subconscious"],
  "collections": [
    { "id": 1, "name": "Christopher Nolan Collection" }
  ],
  "recommendationReasons": [
    "You liked 3 other films by Christopher Nolan",
    "Matches your love of Sci-Fi Thrillers",
    "Academy Award Winner"
  ],
  "userStatus": {
    "swiped": "like",
    "inWatchlist": true,
    "watched": false,
    "personalRating": null
  }
}
```

---

## 3. Recommendation Engine Detail

### 3.1 Complete Scoring Formula

```
feed_score = (base_quality_score × quality_weight)
           + (personalization_score × personalization_weight)
           + (exploration_bonus × 0.10)
           + (random() × 0.20 × 0.10)
```

Where `quality_weight` and `personalization_weight` depend on user maturity:

```
maturity = MIN(total_swipes / 50, 1.0)
personalization_weight = 0.50 × maturity
quality_weight = 0.30 + (0.20 × (1 - maturity))
```

| Maturity Stage | Swipes | Quality Weight | Personalization Weight | Exploration | Random |
|---------------|--------|----------------|----------------------|-------------|--------|
| Brand new | 0 | 0.50 | 0.00 | 0.10 | 0.10 |
| Early | 10 | 0.46 | 0.10 | 0.10 | 0.10 |
| Learning | 25 | 0.40 | 0.25 | 0.10 | 0.10 |
| Mature | 50+ | 0.30 | 0.50 | 0.10 | 0.10 |

### 3.2 Base Quality Score Computation

Pre-computed during data seeding and stored on `content.base_quality_score`. Range: 0.0 – 1.0.

```sql
UPDATE content SET base_quality_score = (
    -- TMDB rating (0-1)
    COALESCE(tmdb_rating / 10.0, 0) * 0.25
    -- IMDB rating (0-1)
  + COALESCE(imdb_rating / 10.0, 0) * 0.25
    -- Popularity (log-normalized, 0-1)
  + LEAST(LN(GREATEST(popularity, 1)) / LN((SELECT MAX(popularity) FROM content)), 1.0) * 0.15
    -- Revenue (log-normalized, 0-1)
  + LEAST(LN(GREATEST(revenue + 1, 1)) / LN((SELECT MAX(revenue) + 1 FROM content)), 1.0) * 0.10
    -- Oscar bonus: 1.0 if won, 0.6 if nominated, 0.0 otherwise
  + COALESCE((
      SELECT CASE WHEN bool_or(won) THEN 1.0 WHEN COUNT(*) > 0 THEN 0.6 ELSE 0.0 END
      FROM awards WHERE awards.content_id = content.id
    ), 0) * 0.15
    -- Vote count confidence (0-1)
  + LEAST(COALESCE(tmdb_vote_count, 0)::NUMERIC / 1000.0, 1.0) * 0.10
);
```

### 3.3 Personalization Score Computation

The personalization score for a given movie is the sum of weighted preference signals across all matching entities.

For each entity (genre, actor, director, keyword, decade, collection) linked to the movie:

```
entity_signal = raw_score × type_weight × idf_weight × time_decay × billing_factor
```

Where:
- `raw_score`: from `user_preferences.raw_score` (accumulated likes/dislikes)
- `type_weight`: from `entity_type_weights` table (director=1.5, genre=1.0, etc.)
- `idf_weight`: from `entity_idf_cache` — `LOG(total_content / content_with_entity)`
- `time_decay`: `EXP(-0.01 × days_since_last_update)` (half-life ~69 days)
- `billing_factor`: for actors only — `1.0` for top 3 billed, `0.5` for positions 4-8 (applied on top of actor weight)

```
personalization_score = SUM(entity_signal) / normalizing_denominator
```

The `normalizing_denominator` is `MAX(1, COUNT(matching_entities))` to prevent movies with many entities from having unfairly high scores.

### 3.4 Preference Update on Swipe

When a user swipes, the backend updates preferences for all entities linked to that content:

```sql
-- On LIKE (action = 'like')
INSERT INTO user_preferences (user_id, entity_type, entity_id, raw_score, interaction_count, last_updated)
VALUES ($user_id, $entity_type, $entity_id, $score_delta, 1, NOW())
ON CONFLICT (user_id, entity_type, entity_id)
DO UPDATE SET
    raw_score = user_preferences.raw_score + $score_delta,
    interaction_count = user_preferences.interaction_count + 1,
    last_updated = NOW();
```

Score deltas per action and entity type:

| Action | Director | Genre | Top 3 Actor | Actor 4-8 | Keyword | Decade | Collection |
|--------|----------|-------|-------------|-----------|---------|--------|------------|
| Like | +1.50 | +1.00 | +0.80 | +0.40 | +0.60 | +0.30 | +0.50 |
| Superlike | +3.00 | +2.00 | +1.60 | +0.80 | +1.20 | +0.60 | +1.00 |
| Dislike | -0.45 | -0.30 | -0.24 | -0.12 | -0.18 | -0.09 | -0.15 |

The score delta = `base_action_weight × entity_type_weight`.
- Like base = +1.0
- Superlike base = +2.0
- Dislike base = -0.3

After each swipe, also increment `users.maturity_score` by 1 (capped display at 50 but keeps counting).

### 3.5 Feed Generation Query (Optimized)

```sql
WITH user_maturity AS (
    SELECT
        LEAST(maturity_score / 50.0, 1.0) AS maturity,
        0.30 + (0.20 * (1.0 - LEAST(maturity_score / 50.0, 1.0))) AS quality_w,
        0.50 * LEAST(maturity_score / 50.0, 1.0) AS personal_w
    FROM users
    WHERE id = $user_id
),

-- Pre-filter: exclude already-swiped content
unseen AS (
    SELECT c.*
    FROM content c
    WHERE c.content_type = $content_type
      AND c.id NOT IN (
          SELECT content_id FROM user_swipes WHERE user_id = $user_id
      )
      -- Apply optional filters
      AND ($genre_ids IS NULL OR c.id IN (
          SELECT content_id FROM content_genres WHERE genre_id = ANY($genre_ids)
      ))
      AND ($year_min IS NULL OR EXTRACT(YEAR FROM c.release_date) >= $year_min)
      AND ($year_max IS NULL OR EXTRACT(YEAR FROM c.release_date) <= $year_max)
      AND ($rating_min IS NULL OR GREATEST(c.tmdb_rating, c.imdb_rating) >= $rating_min)
      AND ($rating_max IS NULL OR LEAST(c.tmdb_rating, c.imdb_rating) <= $rating_max)
      AND ($certification IS NULL OR c.certification = ANY($certification))
      AND ($provider_ids IS NULL OR c.id IN (
          SELECT content_id FROM content_providers WHERE provider_id = ANY($provider_ids)
      ))
      AND ($person_id IS NULL OR c.id IN (
          SELECT content_id FROM content_people WHERE person_id = $person_id
      ))
      AND ($collection_id IS NULL OR c.id IN (
          SELECT content_id FROM content_collections WHERE collection_id = $collection_id
      ))
      AND ($awards_filter IS NULL
          OR ($awards_filter = 'winner' AND c.id IN (SELECT content_id FROM awards WHERE won = TRUE))
          OR ($awards_filter = 'nominated' AND c.id IN (SELECT content_id FROM awards))
      )
),

-- Personalization: aggregate preference signals per movie
pref_scores AS (
    SELECT
        u.id AS content_id,
        COALESCE(SUM(
            up.raw_score
            * etw.weight
            * eidf.idf_weight
            * EXP(-0.01 * EXTRACT(EPOCH FROM (NOW() - up.last_updated)) / 86400.0)
            * CASE
                WHEN cp.role = 'actor' AND cp.billing_order > 3 THEN 0.5
                ELSE 1.0
              END
        ), 0) / GREATEST(COUNT(up.raw_score), 1) AS personalization_score,

        -- Exploration: boost underexplored genres
        MAX(CASE
            WHEN gup.interaction_count IS NULL OR gup.interaction_count < 3 THEN 0.30
            WHEN gup.interaction_count < 10 THEN 0.15
            ELSE 0.0
        END) AS exploration_bonus

    FROM unseen u

    -- Join genres
    LEFT JOIN content_genres cg ON u.id = cg.content_id
    LEFT JOIN user_preferences gup ON gup.user_id = $user_id
        AND gup.entity_type = 'genre' AND gup.entity_id = cg.genre_id

    -- Join all entity-preference lookups
    LEFT JOIN content_people cp ON u.id = cp.content_id
    LEFT JOIN content_keywords ck ON u.id = ck.content_id
    LEFT JOIN content_collections cc ON u.id = cc.content_id

    -- Cross-reference with user preferences (multi-entity union approach)
    LEFT JOIN user_preferences up ON up.user_id = $user_id AND (
        (up.entity_type = 'genre' AND up.entity_id = cg.genre_id)
        OR (up.entity_type = 'director' AND cp.role = 'director' AND up.entity_id = cp.person_id)
        OR (up.entity_type = 'actor' AND cp.role = 'actor' AND up.entity_id = cp.person_id)
        OR (up.entity_type = 'keyword' AND up.entity_id = ck.keyword_id)
        OR (up.entity_type = 'collection' AND up.entity_id = cc.collection_id)
        OR (up.entity_type = 'decade' AND up.entity_id = (EXTRACT(YEAR FROM u.release_date)::INT / 10 * 10))
    )
    LEFT JOIN entity_type_weights etw ON etw.entity_type = up.entity_type
    LEFT JOIN entity_idf_cache eidf ON eidf.entity_type = up.entity_type
        AND eidf.entity_id = up.entity_id

    GROUP BY u.id
),

-- Combine scores
ranked AS (
    SELECT
        u.id,
        u.base_quality_score,
        ps.personalization_score,
        ps.exploration_bonus,
        RANDOM() * 0.20 AS random_factor,
        (
            u.base_quality_score * (SELECT quality_w FROM user_maturity)
            + ps.personalization_score * (SELECT personal_w FROM user_maturity)
            + ps.exploration_bonus * 0.10
            + RANDOM() * 0.20 * 0.10
        ) AS feed_score
    FROM unseen u
    JOIN pref_scores ps ON u.id = ps.content_id
)

SELECT r.id, r.feed_score
FROM ranked r
ORDER BY r.feed_score DESC
LIMIT $limit;
```

**Performance Notes:**
- The `user_swipes(user_id, content_id)` index makes the NOT IN subquery fast (B-tree lookup)
- For 50 users and ~6,000 content items, this query runs in <100ms on modern hardware
- Pre-computed `base_quality_score` and `entity_idf_cache` avoid recalculation
- The feed is fetched in batches of 20; the client pre-fetches the next batch while the user swipes

### 3.6 Session Diversity Enforcement

Applied **after** the SQL query returns ranked results, in the application layer:

```
Algorithm: Diverse Feed Shuffle
Input: ranked_cards (20 items ordered by feed_score)
Output: diverse_cards (20 items with diversity constraints)

1. Initialize result = []
2. Initialize recent_directors = [] (last 2 directors shown)
3. Initialize recent_franchises = [] (last 2 collections shown)
4. For each position 0..19:
   a. If position % 8 == 7 (every 8th card):
      - Pick the highest-scoring card from a genre NOT in user's top 3
      - This is the "exploration card"
   b. Otherwise:
      - Take next card from ranked_cards
      - If card's director is in recent_directors (would make 3+ in a row):
        Skip, move to next candidate
      - If card's collection is in recent_franchises (would make 3+ in a row):
        Skip, move to next candidate
   c. Add card to result
   d. Update recent_directors, recent_franchises
5. Return result
```

### 3.7 Exploration Card Insertion

Every ~8th card in the feed is a deliberate exploration pick:

```sql
-- Exploration card: high-quality movie from an underexplored genre
SELECT c.id
FROM content c
JOIN content_genres cg ON c.id = cg.content_id
LEFT JOIN user_preferences up ON up.user_id = $user_id
    AND up.entity_type = 'genre' AND up.entity_id = cg.genre_id
WHERE c.content_type = $content_type
  AND c.id NOT IN (SELECT content_id FROM user_swipes WHERE user_id = $user_id)
  AND (up.interaction_count IS NULL OR up.interaction_count < 5)
ORDER BY c.base_quality_score DESC
LIMIT 1;
```

### 3.8 Recommendation Reason Generation

For each card, generate 1-2 human-readable reasons. Check in priority order:

1. **Director match**: "You liked N films by {director_name}" (if director raw_score > 2.0)
2. **Actor match**: "Stars {actor_name}, who you enjoy" (if actor raw_score > 2.0)
3. **Genre match**: "Matches your love of {genre_name}" (if genre in user's top 3)
4. **Award signal**: "Academy Award Winner" or "Oscar-nominated" (if has awards)
5. **Collection match**: "From the {collection_name} collection" (if collection raw_score > 1.0)
6. **Keyword match**: "Similar themes to movies you've liked" (if 2+ keyword matches)
7. **High quality fallback**: "Highly rated on TMDB & IMDb" (if base_quality > 0.7)
8. **Exploration**: "Discover something new in {genre_name}" (if exploration card)

Show max 2 reasons per card. Only show reasons in the detail view (per decisions.md).

---

## 4. Data Seeding Strategy

### 4.1 TMDB API Endpoints

**Phase 1: Discover Movies (Build Catalog)**

| Endpoint | Purpose | Strategy |
|----------|---------|----------|
| `GET /discover/movie` | Main catalog source | Query per-genre to ensure diversity |
| `GET /discover/tv` | TV series catalog | Filter for popular, well-rated series |
| `GET /movie/{id}` | Full movie details | For each discovered movie |
| `GET /movie/{id}/credits` | Cast & crew | Top 10 actors + all directors/writers |
| `GET /movie/{id}/keywords` | Keywords/tags | All keywords |
| `GET /movie/{id}/watch/providers` | Streaming availability | Filter for UA region |
| `GET /movie/{id}/external_ids` | IMDb ID crossref | For Oscar data matching |
| `GET /genre/movie/list` | Genre definitions | Both `en-US` and `uk-UA` |
| `GET /genre/tv/list` | TV genre definitions | Both languages |
| `GET /person/{id}` | Person details | For top actors/directors |
| `GET /collection/{id}` | Collection details | TMDB collections |

### 4.2 Genre-Diverse Catalog Strategy

**Problem:** Simply fetching top 5,000 by popularity gives you 60% Action/Drama/Comedy and almost no Horror, Documentary, War, Musical, or Western.

**Solution:** Per-genre quota system.

```
Target catalog: ~6,000 movies + ~1,000 series + ~500 animation = ~7,500 total

Movies per genre (approximate targets):
  Action:       600    Drama:          700    Comedy:      600
  Thriller:     500    Sci-Fi:         400    Horror:      350
  Romance:      350    Crime:          350    Adventure:   300
  Animation:    300    Mystery:        200    War:         150
  Fantasy:      250    Family:         200    Documentary: 150
  History:      150    Music/Musical:  100    Western:     100

  (Movies appear in multiple genres, so these overlap — actual unique ~6,000)
```

**Seeding algorithm:**

```
For each genre:
  page = 1
  collected = 0
  while collected < genre_quota and page <= 50:
    results = TMDB.discover/movie(
      with_genres: genre_id,
      sort_by: "vote_count.desc",     // high vote count = well-known
      vote_count.gte: 100,            // minimum visibility
      vote_average.gte: 5.5,          // minimum quality
      primary_release_date.gte: "1970-01-01",
      with_original_language: not "xx",  // exclude adult/no-language
      page: page
    )
    for each movie in results:
      if movie not already in catalog:
        if movie has poster_path:
          add to catalog
          collected++
    page++
```

**Additional discovery passes:**
1. **Oscar movies pass**: Fetch all movies matched from Oscar dataset, regardless of popularity
2. **Revenue leaders pass**: `sort_by=revenue.desc` per decade to catch box office hits
3. **Director completionism**: For top 200 directors, fetch their complete filmography
4. **Trending/recent pass**: `GET /trending/movie/week` for recent releases

### 4.3 Oscar Data Cross-Referencing

**Source:** `DLu/oscar_data` GitHub repository (CSV files with all Oscar nominations since 1927).

**Process:**

1. Download Oscar data CSV from GitHub
2. Parse CSV — key fields: `year`, `category`, `film`, `nominee`, `won`, `imdb_id`
3. Filter to ceremonies from 1970 onward (matching catalog constraint)
4. For each nomination:
   a. Match by `imdb_id` → `content.imdb_id` (primary match strategy)
   b. If no `imdb_id` in Oscar data, match by `film` title + `year` (fuzzy)
   c. For person-linked categories (acting, directing):
      - Match `nominee` name to `people.name_en`
      - Or search TMDB by name to get `tmdb_id`, then match
   d. Insert into `awards` table with proper `category`, `won`, `ceremony_year`
5. After all Oscar data imported, recompute `base_quality_score` for affected content

**Category mapping** from Oscar data to our `award_category_type` enum:

| Oscar Category Pattern | Maps To |
|----------------------|---------|
| "BEST PICTURE" | `picture` |
| "DIRECTING" | `director` |
| "ACTOR IN A LEADING ROLE" | `actor` |
| "ACTRESS IN A LEADING ROLE" | `actress` |
| "ACTOR IN A SUPPORTING ROLE" | `supporting_actor` |
| "ACTRESS IN A SUPPORTING ROLE" | `supporting_actress` |
| "WRITING" / "SCREENPLAY" | `screenplay` |
| "CINEMATOGRAPHY" | `cinematography` |
| "MUSIC (ORIGINAL SCORE)" | `score` |
| "MUSIC (ORIGINAL SONG)" | `song` |
| "ANIMATED FEATURE" | `animated` |
| "INTERNATIONAL FEATURE" | `international` |
| Everything else | `other` |

### 4.4 Ukrainian Translations

**TMDB provides Ukrainian translations** via the `language=uk-UA` parameter:

```
For each content item in catalog:
  en_data = TMDB.movie(id, language="en-US")
  uk_data = TMDB.movie(id, language="uk-UA")

  content.title_en = en_data.title
  content.overview_en = en_data.overview

  if uk_data.title != en_data.title:  // TMDB returns English if no translation
    content.title_uk = uk_data.title
    content.overview_uk = uk_data.overview
    content.has_uk_translation = true
  else:
    content.has_uk_translation = false
```

**Expected coverage:** TMDB has Ukrainian translations for ~60-70% of popular movies. The remaining ~30% will display English titles/overviews until manually translated.

For people:
```
  en_person = TMDB.person(id, language="en-US")
  uk_person = TMDB.person(id, language="uk-UA")

  people.name_uk = uk_person.name (if different from English)
  people.biography_uk = uk_person.biography (if non-empty)
```

### 4.5 API Call Estimates & Rate Limiting

TMDB API free tier: **40 requests/second** (no daily limit).

| Operation | Calls per Item | Total Items | Total Calls |
|-----------|---------------|-------------|-------------|
| Discover pages (per genre) | 1 | ~500 pages | 500 |
| Movie details (EN) | 1 | 7,500 | 7,500 |
| Movie details (UK) | 1 | 7,500 | 7,500 |
| Credits per movie | 1 | 7,500 | 7,500 |
| Keywords per movie | 1 | 7,500 | 7,500 |
| Watch providers per movie | 1 | 7,500 | 7,500 |
| External IDs per movie | 1 | 7,500 | 7,500 |
| Person details (EN) | 1 | ~5,000 unique | 5,000 |
| Person details (UK) | 1 | ~5,000 unique | 5,000 |
| Collection details | 1 | ~500 | 500 |
| **Total** | | | **~60,000** |

**At 40 req/s: ~25 minutes** to complete full seeding.

**Optimization: use `append_to_response`** to combine multiple sub-requests:

```
GET /movie/{id}?append_to_response=credits,keywords,watch/providers,external_ids&language=en-US
```

This combines 4 calls into 1. Revised estimate:

| Operation | Total Calls |
|-----------|-------------|
| Discover pages | 500 |
| Movie details + credits + keywords + providers + external_ids (EN) | 7,500 |
| Movie details (UK — for translations) | 7,500 |
| Person details (EN + UK) | 10,000 |
| Collections | 500 |
| **Total (optimized)** | **~26,000** |

**At 40 req/s: ~11 minutes** for full seeding.

**Seeding script strategy:**
- Run as a standalone Node.js script (`scripts/seed.ts`)
- Implements rate limiting (35 req/s to stay safely under 40)
- Tracks progress in a local JSON file (resume on failure)
- Runs in phases: discover → details → people → oscar-crossref → compute-scores → IDF-cache
- Can be re-run incrementally (only fetches new/updated content)

### 4.6 IDF Cache Computation

After all content is seeded, compute the IDF cache:

```sql
-- Genre IDF
INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
SELECT
    'genre',
    cg.genre_id,
    LN((SELECT COUNT(*) FROM content)::NUMERIC / COUNT(DISTINCT cg.content_id)),
    COUNT(DISTINCT cg.content_id)
FROM content_genres cg
GROUP BY cg.genre_id
ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET idf_weight = EXCLUDED.idf_weight,
        content_count = EXCLUDED.content_count,
        updated_at = NOW();

-- Director IDF
INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
SELECT
    'director',
    cp.person_id,
    LN((SELECT COUNT(*) FROM content)::NUMERIC / COUNT(DISTINCT cp.content_id)),
    COUNT(DISTINCT cp.content_id)
FROM content_people cp
WHERE cp.role = 'director'
GROUP BY cp.person_id
ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET idf_weight = EXCLUDED.idf_weight,
        content_count = EXCLUDED.content_count,
        updated_at = NOW();

-- Actor IDF
INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
SELECT
    'actor',
    cp.person_id,
    LN((SELECT COUNT(*) FROM content)::NUMERIC / COUNT(DISTINCT cp.content_id)),
    COUNT(DISTINCT cp.content_id)
FROM content_people cp
WHERE cp.role = 'actor'
GROUP BY cp.person_id
ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET idf_weight = EXCLUDED.idf_weight,
        content_count = EXCLUDED.content_count,
        updated_at = NOW();

-- Keyword IDF
INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
SELECT
    'keyword',
    ck.keyword_id,
    LN((SELECT COUNT(*) FROM content)::NUMERIC / COUNT(DISTINCT ck.content_id)),
    COUNT(DISTINCT ck.content_id)
FROM content_keywords ck
GROUP BY ck.keyword_id
ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET idf_weight = EXCLUDED.idf_weight,
        content_count = EXCLUDED.content_count,
        updated_at = NOW();

-- Decade IDF
INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
SELECT
    'decade',
    (EXTRACT(YEAR FROM c.release_date)::INT / 10 * 10),
    LN((SELECT COUNT(*) FROM content)::NUMERIC / COUNT(*)),
    COUNT(*)
FROM content c
WHERE c.release_date IS NOT NULL
GROUP BY (EXTRACT(YEAR FROM c.release_date)::INT / 10 * 10)
ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET idf_weight = EXCLUDED.idf_weight,
        content_count = EXCLUDED.content_count,
        updated_at = NOW();

-- Collection IDF
INSERT INTO entity_idf_cache (entity_type, entity_id, idf_weight, content_count)
SELECT
    'collection',
    cc.collection_id,
    LN((SELECT COUNT(*) FROM content)::NUMERIC / COUNT(DISTINCT cc.content_id)),
    COUNT(DISTINCT cc.content_id)
FROM content_collections cc
GROUP BY cc.collection_id
ON CONFLICT (entity_type, entity_id) DO UPDATE
    SET idf_weight = EXCLUDED.idf_weight,
        content_count = EXCLUDED.content_count,
        updated_at = NOW();
```

---

## 5. Docker Compose Setup

### 5.1 docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: pickme-app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://pickme:${DB_PASSWORD}@postgres:5432/pickme
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
      - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
      - GOOGLE_CALLBACK_URL=${GOOGLE_CALLBACK_URL}
      - TMDB_API_KEY=${TMDB_API_KEY}
      - TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p
      - APP_URL=${APP_URL:-http://localhost:3000}
      - DEFAULT_LOCALE=uk
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - pickme-network
    volumes:
      - ./logs:/app/logs

  postgres:
    image: postgres:16-alpine
    container_name: pickme-db
    environment:
      - POSTGRES_DB=pickme
      - POSTGRES_USER=pickme
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d    # SQL schema files auto-run on first start
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pickme"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - pickme-network

volumes:
  pgdata:
    driver: local

networks:
  pickme-network:
    driver: bridge
```

### 5.2 .env Template

```env
# Database
DB_PASSWORD=change_me_in_production

# JWT
JWT_SECRET=change_me_32_chars_minimum_random
JWT_REFRESH_SECRET=change_me_different_from_above

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# TMDB
TMDB_API_KEY=your_tmdb_api_key

# App
APP_URL=http://localhost:3000
```

### 5.3 Dockerfile

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/server.js"]
```

### 5.4 Database Initialization

Place SQL files in `db/init/` — they execute alphabetically on first container start:

```
db/init/
  001-enums.sql          # CREATE TYPE statements
  002-tables.sql         # All CREATE TABLE statements
  003-indexes.sql        # All CREATE INDEX statements
  004-triggers.sql       # updated_at triggers
  005-seed-config.sql    # entity_type_weights, genre emoji mappings
```

The data seeding script (`scripts/seed.ts`) runs separately after the container is up:

```bash
# Start services
docker compose up -d

# Run data seeding (fetches from TMDB, imports Oscar data, computes scores)
docker compose exec app node dist/scripts/seed.js
```

### 5.5 Development Override

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
    command: npm run dev
    ports:
      - "3000:3000"
      - "9229:9229"        # Node.js debugger

  postgres:
    ports:
      - "5432:5432"        # Exposed for local DB tools
```

Usage: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`

---

## Appendix: Quick Reference

### Key Table Counts (Expected)

| Table | Expected Rows |
|-------|--------------|
| content | ~7,500 |
| genres | ~20 |
| people | ~5,000 |
| keywords | ~3,000 |
| collections | ~500 |
| streaming_providers | ~30 |
| content_genres | ~15,000 |
| content_people | ~50,000 |
| content_keywords | ~25,000 |
| awards | ~3,000 |
| entity_idf_cache | ~8,500 |
| users (max) | ~50 |
| user_swipes (per user, mature) | ~500-2,000 |
| user_preferences (per user) | ~200-500 |

### Critical Performance Indexes Summary

| Index | Purpose |
|-------|---------|
| `idx_user_swipes_user_content` | Exclude seen content from feed (most critical) |
| `idx_content_quality` | Order by quality for cold-start users |
| `idx_user_prefs_lookup` | Fetch preference scores during feed generation |
| `idx_content_genres_genre` | Filter by genre |
| `idx_content_people_person` | Filter by person |
| `idx_content_type` | Filter by content type |

### TMDB Image URL Construction

```
Full poster URL = TMDB_IMAGE_BASE_URL + size + poster_path
Example: https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911p7NkQ.jpg

Sizes:
  Poster: w92, w154, w185, w342, w500, w780, original
  Backdrop: w300, w780, w1280, original
  Profile: w45, w185, h632, original
  Logo: w45, w92, w154, w185, w300, w500, original
```

---

*Document version: 1.0*
*Created: 2026-02-07*
*Based on: IDEA.md, Business Analysis Report, Technical Decisions*
