# pickme.mov — Tinder for Movies

## What I want

A PWA web app for choosing movies to watch. The UI works like Tinder — you see a card with a movie poster, swipe right to save it to your watchlist, swipe left to dismiss it forever. The system learns from my swipes and gets better at suggesting movies I'll actually want to watch.

## Content types

The app should support three content categories that user can switch between:
- Movies
- TV Series
- Animated films/series

## Data & catalog

The catalog should contain ~5,000–8,000 movies to start with. These should be **normal mainstream movies** — the kind of films regular people watch. Not arthouse, not obscure festival winners, not ultra-low-budget films from the 1950s.

**Hard rules for what gets into the catalog:**
- No films older than 1970
- Must have a reasonable number of ratings (not some forgotten film 12 people saw)
- Should have recognizable actors OR directors OR decent box office OR award nominations
- Must have a poster image available
- No adult content

**Preference for quality signals:**
- Oscar winners and nominees should be prioritized
- Films by Oscar-winning/nominated directors and actors get priority
- Commercially successful films (high revenue) are good candidates
- High popularity on TMDB is a good signal
- Genre-specific "best of" coverage is important — don't just grab top 5,000 by popularity, make sure there are good thrillers, good comedies, good horror, etc.
- also open for your advises regarding quality of movies

**Source of data:** TMDB API (The Movie Database). It's free, has posters, cast photos, descriptions, ratings, genres, streaming providers — everything we need. For Oscar data, use the `DLu/oscar_data` GitHub dataset which has all nominations with IMDb IDs that can be cross-referenced with TMDB.

The catalog should be pre-loaded into our database. The app should NOT make TMDB API calls at runtime for the feed — everything should be cached locally. TMDB is only used during data seeding/refresh.

Poster images should be hotlinked from CDN or cached locally

## Recommendation system

**Approach:** Weighted scoring in PostgreSQL. No ML, no separate service.

**How it learns:**
When I swipe right (like) on a movie, the system gives positive scores to:
- That movie's genres
- The main actors (top billed get more weight)
- The director (highest weight)
- Keywords/tags associated with the movie
- The decade the movie is from
- The collection/list the movie was sourced from
- also open for other advices from your side

When I swipe left (dislike), the same entities get SMALLER negative scores. Important: dislike should be weaker than like — if I dislike one Tom Cruise movie it doesn't mean I hate Tom Cruise. It takes several dislikes of the same entity to create real aversion.

**Feed ordering:** Content that hasn't been seen yet gets ranked by a combination of:
- Base quality (TMDB and/or IMDB rating, Oscar status, popularity, revenue)
- Personalization (sum of preference scores for this movie's genres, actors, director, keywords)
- Small random factor (so the feed isn't 100% deterministic)
- Exploration bonus (slight boost for genres the user hasn't seen much of yet)
- also open for other advices from your side

**Collection awareness:** If I like 5 disaster movies in a row from the same collection, the system should start showing me more from that collection. Track where each movie was sourced from.

## UI / UX

### Design language

**NOT Bootstrap. NOT the generic rounded-everything AI-generated look.**

I want a dark, cinematic aesthetic — closer to Netflix or Letterboxd:
- Near-black background
- Warm accent color (gold/amber) for likes and highlights
- Sharp modern typography (Inter or similar), not bold everywhere
- Poster images are the hero — full-bleed, minimal chrome around them
- Minimal border-radius (4-8px, not pills)
- Smooth spring animations for swipe gestures
- Glass morphism only sparingly (filter overlays)
- Generous whitespace
- also open for other advices from your side

### Main screens

**1. Feed (Swipe View) — the main screen**
- Card stack with 2-3 visible cards, top card is interactive
- Card shows full poster image
- Movie title overlaid at top with gradient fade
- Scroll/pull down on the card to reveal details: year, rating, genres, overview, cast thumbnails, award badges, where to watch
- Swipe left = dislike, swipe right = like
- If i shake phone it means (undo). It brigs back disliked movie card
- Tap buttons at bottom as alternative: ✕ (dislike), ★ (superlike), ♡ (like)
- Filter button (top right corner) opens the filter drawer
- Content type tabs at top: Movies | Series | Animation

**2. Filter drawer**
- Slides in from right or bottom sheet on mobile
- Genre chips (multi-select)
- Year range slider (1970–2025)
- Awards filter: Any | Oscar Winner | Nominated | No filter
- TMDB/IMDB rating range slider
- Browse by actor/director (with search)
- Browse by collection
- Streaming service filter (where to watch)
- Age certification filter (PG, PG-13, R)
- Apply + Reset buttons
- Additional useful filters to consider: runtime range, language, country of production

**3. Watchlist**
- Grid of poster thumbnails (all liked content)
- Tabs: All | Unwatched | Watched
- Tap any poster → opens detail view
- Mark as watched, give personal rating (1-10)
- Sort by: date added, rating, year, personal rating

**4. Content detail view (modal/overlay)**
- Large backdrop image at top
- Title, year, runtime, certification, TMDB/IMDB rating
- Genre pills
- Overview/synopsis
- Award badges (🏆 Winner, ⭐ Nominated)
- Cast horizontal carousel (photos + names, tappable → person page)
- Director, writer credits
- Where to watch (streaming service logos)
- Similar content carousel
- Status indicator if already in watchlist or disliked

**5. Person page**
- Photo, name, biography
- Filmography as horizontal poster scroll
- Awards listed
- "Browse all" button → enters feed mode filtered by this person

**6. Search**
- Global search across movies, series, and people
- Results grouped by type

**7. Profile / Settings**
- Language toggle (Ukrainian / English)
- Toggle between light and dark theme
- Stats: total swiped, likes, dislikes, top genres, favorite actors
- Visual preference breakdown (what the system thinks you like)
- Reset preferences
- Export watchlist

**8. Bottom navigation bar**
- Feed (🎬) | Watchlist (♡) | Search (🔍) | Profile (👤)

## PWA requirements

The primary use case is: open the site once in Safari or Chrome, add to home screen, use like a native iOS app.

Must have:
- `manifest.json` with proper icons (192x192, 512x512), theme_color matching dark theme, `display: standalone`
- Service Worker: cache app shell, cache poster images aggressively
- iOS meta tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`
- `viewport-fit=cover` for notch handling
- Splash screen
- Works offline (at minimum shows cached watchlist and previously loaded content)
- also open for other advices from your side

## Localization

- App UI is bilingual: Ukrainian (primary) and English
- Content (movie titles, overviews) stored in both languages in the database
- TMDB provides Ukrainian translations via `?language=uk-UA` for many films — use as primary source
- For films without Ukrainian translations: mark these films in the database. Later we would translate english descriptions
- UI strings via i18next or similar, with `uk.json` and `en.json` locale files

## Tech stack

- **Frontend:** React + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL
- **Auth:** JWT with refresh tokens
- **Swipe animations:** framer-motion or react-spring

## Scale

This is for personal use and friends — up to 50 users. No need for complex infrastructure, rate limiting, or horizontal scaling. Single server deployment with Docker Compose (app + PostgreSQL).


