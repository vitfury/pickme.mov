# pickme.mov — Business Analysis Report
## Competitor Analysis, Scoring Algorithms & UX Best Practices

---

## 1. Competitor Analysis

### 1.1 Swipe-Based Movie Discovery Apps (Direct Competitors)

#### MovieSwipe (movie-swipe.com)
- **What it does:** Swipe through movie cards, save to watchlist, swipe with friends for group movie night decisions.
- **Strengths:** Social/group matching feature ("find movies you both like"), streaming service filter, simple onboarding.
- **Weaknesses:** Users complain that 98% of suggestions are "garbage" — the recommendation quality is poor and feels random. The cold-start problem is evident: without good initial signals, users are overwhelmed with irrelevant content.
- **Key takeaway for us:** Recommendation quality is THE differentiator. A good scoring algorithm is more important than any other feature. If users feel like they're swiping "no" on everything, they'll abandon the app.

#### Cineswipe (cineswipe.app)
- **What it does:** All-in-one movie/TV tracker + Tinder-style matcher + watchlist + social features.
- **Strengths:** Cross-platform sync (Trakt, TMDB, Letterboxd, TV Time), enhanced "For You" algorithm, daily recommendation cache refresh, 4.67-star rating (200+ reviews). Upcoming AI-powered discovery (CineBot).
- **Weaknesses:** Users report repeated movie titles in the swipe deck. Missing original series content. Can feel feature-bloated.
- **Key takeaway for us:** Cineswipe is the closest competitor and the current market leader in the swipe-discovery space. Their daily-cached recommendation approach aligns with what IDEA.md proposes. We should study what they got wrong (repeated titles) and ensure our deck never shows duplicates.

#### Matched (by Taste)
- **What it does:** Designed specifically for couples. Both partners swipe, app finds mutual matches.
- **Strengths:** Strong product-market fit for couples. Calculates "taste profiles" from ~20 initial ratings. Mood-based filters. Streaming service integration.
- **Weaknesses:** Limited to the "couples choosing together" use case. No solo discovery mode.
- **Key takeaway for us:** The "rate ~20 movies to build a profile" onboarding approach is worth considering. It gives the algorithm something to work with immediately.

#### Movie Night (Swipe & Watch)
- **What it does:** Discover films by swiping, direct streaming integration (Netflix, Prime, etc.).
- **Strengths:** Clean UX, launch-directly-to-streaming, social sharing.
- **Weaknesses:** Limited recommendation intelligence. More of a "what's on streaming" browser than a preference learner.

#### Match a Movie (match-a-movie.com)
- **What it does:** Free web app (no install needed). Swipe through movies on Netflix, Disney+, etc. Group matching for movie nights.
- **Strengths:** Zero-friction web-based approach (like our PWA strategy). Free. Simple.
- **Weaknesses:** Very basic recommendations, primarily filters by streaming service rather than taste.

### 1.2 Social Film Discovery (Indirect Competitors)

#### Letterboxd
- **What it does:** Social network for film lovers. Rate, review, log, and discover films. Lists, friends, diary.
- **Strengths:**
  - Massive engaged community (cinephiles)
  - User-generated lists are a powerful discovery mechanism
  - "Similar Films" algorithm based on cross-referencing viewer reviews
  - 5-star rating system with half-stars (nuanced)
  - Beautiful, poster-centric design language (dark theme, cinematic feel)
  - Film diary concept (log what you watched)
- **Weaknesses:**
  - No personalized recommendation feed (discovery relies on browsing lists/reviews)
  - No swipe-based interaction — requires active searching
  - No streaming availability info (you find a movie but don't know where to watch it)
  - Can feel intimidating for casual movie watchers (skews cinephile)
- **Key takeaway for us:** Letterboxd's design aesthetic (dark, poster-centric, cinematic) is exactly what IDEA.md describes. Their "similar films" feature is built on collaborative filtering from user reviews. However, they lack the passive discovery that swipe-based UX provides — that's our opportunity.

### 1.3 Streaming Aggregators (Partial Competitors)

#### JustWatch
- **What it does:** Search engine across 60,000+ movies/shows, shows which streaming service has what.
- **Strengths:** Best-in-class streaming availability data. Watchlist across all services. Price comparison for rental/purchase. Filter by year, rating, age rating. Free.
- **Weaknesses:** Poor "New Releases" UX — you have to manually filter by current year. No learning algorithm. Crashes reported. Doesn't track what you've actually watched well. UI feels utilitarian, not cinematic.
- **Key takeaway for us:** JustWatch is the gold standard for "where to watch" data. We should integrate streaming availability prominently (IDEA.md already plans this via TMDB's watch provider data).

#### Reelgood
- **What it does:** Streaming guide with recommendations, 50+ services, AI assistant "Cue."
- **Strengths:** "Reelgood Roulette" (shake for random suggestion — similar to our shake-to-undo concept). AI-powered "Cue" assistant. Tracks TV show episodes. Both IMDb and proprietary "Reelgood" scores displayed.
- **Weaknesses:** Limited 1-3 rating scale (users want 1-10). Feature complexity. Less focused than a swipe app.
- **Key takeaway for us:** Reelgood's "Roulette" (shake device for random pick) validates the shake-gesture concept. Their 1-3 rating was criticized — our 1-10 personal rating in the watchlist is better.

### 1.4 Recommendation Engines (Conceptual Competitors)

#### TasteDive
- **What it does:** Cross-media recommendation engine (movies, TV, music, books, games). Type in something you like, get similar items.
- **Algorithm:** Three-pronged approach: (1) trending/popular content, (2) content similarity from user ratings, (3) collaborative filtering from users with similar taste. Uses an "Entertainment Genome" of content attributes.
- **Strengths:** Cross-media recommendations. Three-tier signal (like, meh, dislike). Free API available. Simple input-output model.
- **Weaknesses:** Requires active searching (type a title, get recs). No passive discovery. Algorithm details are opaque.
- **Key takeaway for us:** TasteDive's three-tier feedback (like/meh/dislike) is interesting but may add friction to swipe UX. Binary (like/dislike) with asymmetric weighting is simpler and better for swipe interfaces.

#### Netflix Recommendation System
- **Algorithm:** Hybrid system combining collaborative filtering + content-based filtering + deep learning. Uses 3,000+ micro-genres. SemanticGNN knowledge graphs. Processes 1M+ events/second.
- **UX patterns:**
  - "Because you watched [X]" — transparent recommendation explanations
  - Personalized artwork (different thumbnails for same movie based on user preferences)
  - Horizontal scrolling rows organized by recommendation reason
  - 80%+ of content discovered through recommendations
  - Moving toward mood-based matching (2024-2026 roadmap)
- **Key takeaway for us:** Netflix's "Because you watched" pattern is the gold standard for recommendation transparency. We should implement a simpler version: show 1-2 reasons why a movie appears in the feed (e.g., "Because you liked Inception" or "Popular in Sci-Fi"). Netflix's micro-genre system (3,000 genres) is overkill for our scale, but TMDB keywords serve a similar purpose.

### 1.5 Competitor Gap Analysis — Our Opportunity

| Feature | MovieSwipe | Cineswipe | Letterboxd | JustWatch | **pickme.mov** |
|---------|-----------|-----------|-----------|-----------|----------------|
| Swipe discovery | Yes | Yes | No | No | **Yes** |
| Learning algorithm | Weak | Medium | N/A | No | **Strong (SQL-based)** |
| Recommendation quality | Poor | Good | N/A | N/A | **Target: Excellent** |
| Streaming availability | Some | Yes | No | Best | **Yes (TMDB data)** |
| Cinematic design | Basic | Medium | Excellent | Utilitarian | **Target: Excellent** |
| Offline support (PWA) | No | No | No | No | **Yes** |
| Bilingual (UK/EN) | No | No | No | Partial | **Yes** |
| "Why recommended" | No | No | N/A | N/A | **Yes** |
| Undo mechanism | No | No | N/A | N/A | **Yes (shake)** |
| Content quality filter | Weak | Medium | N/A | N/A | **Strong (Oscar data)** |

**Our primary differentiators:**
1. **Superior recommendation quality** through weighted PostgreSQL scoring with real preference learning
2. **Curated high-quality catalog** (Oscar data, quality gates) vs. random movie dumps
3. **"Why recommended" transparency** (no competitor does this well)
4. **PWA with offline support** (no competitor is a quality PWA)
5. **Bilingual Ukrainian/English** (untapped market)

---

## 2. Scoring & Recommendation Algorithms

### 2.1 Recommended Architecture: Weighted Content-Based Scoring in PostgreSQL

The IDEA.md's approach (SQL-based weighted scoring, no ML) is sound for the scale (50 users, 5-8K movies). Here's the detailed algorithm design:

#### Core Scoring Formula

```
feed_score = (base_quality_score * 0.3)
           + (personalization_score * 0.5)
           + (exploration_bonus * 0.1)
           + (random_factor * 0.1)
```

**Weights rationale:**
- Personalization dominates (50%) because that's the app's core value proposition
- Base quality matters (30%) to ensure good content surfaces even without signals
- Exploration (10%) prevents filter bubbles
- Randomness (10%) makes the feed feel fresh and serendipitous

### 2.2 Base Quality Score (0-1 normalized)

```sql
base_quality = (
    normalized_tmdb_rating * 0.25      -- TMDB vote_average / 10
  + normalized_imdb_rating * 0.25      -- IMDB rating / 10
  + normalized_popularity * 0.15       -- log(popularity) / log(max_popularity)
  + normalized_revenue * 0.10          -- log(revenue+1) / log(max_revenue+1)
  + oscar_bonus * 0.15                 -- 1.0 winner, 0.6 nominated, 0.0 none
  + vote_count_confidence * 0.10       -- min(vote_count, 1000) / 1000
)
```

**Notes:**
- Use logarithmic normalization for popularity and revenue (they follow power-law distributions)
- Oscar bonus provides significant quality signal without overwhelming other factors
- Vote count confidence ensures we don't over-rank movies with high ratings but very few votes

### 2.3 Personalization Score (TF-IDF-Inspired Weighting)

#### Entity Preference Table Structure
```sql
CREATE TABLE user_preferences (
    user_id       INT,
    entity_type   TEXT,    -- 'genre', 'actor', 'director', 'keyword', 'decade', 'collection'
    entity_id     INT,
    raw_score     FLOAT,  -- accumulated from swipes
    interaction_count INT, -- how many times this entity was seen
    last_updated  TIMESTAMP,
    PRIMARY KEY (user_id, entity_type, entity_id)
);
```

#### Asymmetric Like/Dislike Weighting

This is critical and well-supported by research on implicit feedback systems:

| Signal | Weight | Rationale |
|--------|--------|-----------|
| Like (swipe right) | +1.0 | Strong positive signal |
| Superlike (star) | +2.0 | Very strong positive signal |
| Dislike (swipe left) | -0.3 | Weak negative — one dislike shouldn't poison an entity |
| Multiple dislikes (3+) of same entity | Cumulative (-0.3 each) | Only 3+ dislikes of same actor/genre create real aversion |

**Why asymmetric?** Research on implicit feedback consistently shows that negative signals are noisier than positive ones. A user who dislikes one Tom Cruise movie might dislike the plot, not Tom Cruise. But a user who likes a Tom Cruise movie is more likely signaling genuine preference for Cruise. The ratio of 1.0 : -0.3 (approximately 3:1) is a well-established heuristic.

#### Entity Weight Hierarchy

Not all entities are equally predictive of taste:

| Entity Type | Weight Multiplier | Rationale |
|-------------|------------------|-----------|
| Director | 1.5x | Strongest taste signal — people follow directors |
| Genre | 1.0x | Core preference signal |
| Actor (top 3 billed) | 0.8x | Good signal, but actors appear in diverse genres |
| Actor (4-8 billed) | 0.4x | Supporting cast is weaker signal |
| Keywords/tags | 0.6x | "Heist", "Time Travel", etc. — thematic preferences |
| Decade | 0.3x | Mild signal — some people prefer 80s films |
| Collection/source | 0.5x | "If they liked 5 from this list, show more" |

#### TF-IDF-Inspired Weighting for Preference Signals

The key insight from TF-IDF: common entities (like "Drama" genre) are less informative than rare ones (like a specific director).

```sql
-- IDF-like weight: rare entities are more informative
entity_idf = LOG(total_movies_in_catalog / movies_with_this_entity)

-- Normalized preference score for a movie
personalization_score = SUM(
    user_pref.raw_score
    * entity_type_weight
    * entity_idf
    * time_decay_factor
) / normalizing_denominator
```

**Example:** If a user likes "Sci-Fi" (appears in 800 movies), that's less informative than liking "Denis Villeneuve" (appears in 8 movies). The IDF weight automatically handles this:
- Sci-Fi IDF: log(6000/800) = 0.88
- Denis Villeneuve IDF: log(6000/8) = 2.88

### 2.4 Time Decay (Preference Freshness)

Recent preferences should matter more than old ones. Use exponential decay:

```sql
time_decay = EXP(-lambda * days_since_last_update)
```

Where `lambda` controls decay speed. Recommended: `lambda = 0.01` (half-life ≈ 69 days)

This means:
- Preferences from today: weight 1.0
- Preferences from 1 week ago: weight 0.93
- Preferences from 1 month ago: weight 0.74
- Preferences from 3 months ago: weight 0.41
- Preferences from 6 months ago: weight 0.17

**Why this matters:** User taste evolves. Someone who binged horror movies 6 months ago but has been watching comedies lately should see comedies prioritized. The decay is gradual enough that old preferences don't vanish but slow enough that the feed feels responsive to recent behavior.

**Implementation note:** Don't recalculate decay on every query. Update it in a nightly batch job or when the user opens the app (check if >24 hours since last decay update).

### 2.5 Cold-Start Problem Solutions

For new users with zero swipe history, use a tiered approach:

#### Tier 1: Onboarding (First Launch)
1. **Genre Selection Screen:** Show 12-15 genre chips, ask user to select 3-5 favorites. This immediately seeds `user_preferences` with genre scores.
2. **"Rate These" Flow:** Show 10-15 widely-known movies (blockbusters across genres — Inception, Titanic, The Dark Knight, Forrest Gump, etc.) and ask for quick like/dislike. This gives actor, director, and keyword signals.
3. **Time limit:** Keep onboarding under 2 minutes. Research shows that if you ask too many questions, users abandon the flow.

#### Tier 2: First 50 Swipes (Learning Phase)
- Show a mix of **popular high-quality movies** (high base_quality_score) with genre diversity
- Weight base_quality higher (60% instead of 30%) during this phase
- Gradually shift to personalization as preference data accumulates
- Track a `user_maturity` score: `min(total_swipes / 50, 1.0)` that controls the blend:

```sql
effective_personalization_weight = 0.5 * user_maturity
effective_quality_weight = 0.3 + (0.2 * (1 - user_maturity))
```

#### Tier 3: Mature User (50+ Swipes)
- Full personalization weight kicks in
- Standard formula applies

### 2.6 Exploration vs. Exploitation Balance

Use an **epsilon-decreasing** strategy (inspired by multi-armed bandits):

```sql
-- Exploration bonus for underexplored genres
exploration_bonus = CASE
    WHEN user has < 3 interactions with this genre THEN 0.3
    WHEN user has < 10 interactions with this genre THEN 0.15
    ELSE 0.0
END
```

**Additionally:** Every Nth card (e.g., every 8th-10th card) should be a deliberate "exploration" card from a genre/decade the user hasn't engaged with much. This prevents filter bubbles and helps discover new preferences.

**Implementation:**
```sql
-- For ~10% of feed positions, override with exploration picks
SELECT * FROM unseen_movies
WHERE genre_id NOT IN (user's top 3 genres)
ORDER BY base_quality_score DESC
LIMIT 1
```

### 2.7 Feed Generation Query (Simplified)

```sql
WITH movie_scores AS (
    SELECT
        m.id,
        m.title,
        -- Base quality (pre-computed, stored on movie row)
        m.base_quality_score,

        -- Personalization: sum of matching preference signals
        COALESCE(SUM(
            up.raw_score
            * et.weight_multiplier
            * el.idf_weight
            * EXP(-0.01 * EXTRACT(EPOCH FROM (NOW() - up.last_updated)) / 86400)
        ), 0) AS personalization_score,

        -- Exploration bonus
        CASE WHEN genre_interaction_count < 3 THEN 0.3
             WHEN genre_interaction_count < 10 THEN 0.15
             ELSE 0.0 END AS exploration_bonus,

        -- Random factor (seeded per-user-per-day for consistency)
        RANDOM() * 0.2 AS random_factor

    FROM movies m
    LEFT JOIN movie_entities me ON m.id = me.movie_id
    LEFT JOIN user_preferences up ON me.entity_type = up.entity_type
        AND me.entity_id = up.entity_id
        AND up.user_id = :current_user_id
    LEFT JOIN entity_type_weights et ON me.entity_type = et.entity_type
    LEFT JOIN entity_idf el ON me.entity_type = el.entity_type
        AND me.entity_id = el.entity_id
    WHERE m.id NOT IN (SELECT movie_id FROM user_swipes WHERE user_id = :current_user_id)
    -- Apply active filters
    AND (:genre_filter IS NULL OR m.id IN (SELECT movie_id FROM movie_genres WHERE genre_id = ANY(:genre_filter)))
    GROUP BY m.id
)
SELECT *,
    (base_quality_score * :quality_weight
     + personalization_score * :personalization_weight
     + exploration_bonus * 0.1
     + random_factor * 0.1
    ) AS feed_score
FROM movie_scores
ORDER BY feed_score DESC
LIMIT 20;  -- Pre-fetch next 20 cards
```

**Performance note:** For 50 users and 6,000 movies, this query is well within PostgreSQL's capabilities. Pre-compute `base_quality_score` and `entity_idf` values. Index `user_swipes(user_id, movie_id)` and `user_preferences(user_id, entity_type, entity_id)`.

### 2.8 Collection Awareness

As specified in IDEA.md — if a user likes several movies from the same source collection:

```sql
-- Track collection affinity
-- When user likes a movie, also increment the collection preference:
UPDATE user_preferences
SET raw_score = raw_score + 0.5,
    interaction_count = interaction_count + 1,
    last_updated = NOW()
WHERE user_id = :user_id
  AND entity_type = 'collection'
  AND entity_id = :collection_id;
```

The collection entity type flows through the same scoring pipeline as genres/actors/directors, with its own weight multiplier (0.5x).

### 2.9 Additional Algorithm Recommendations

1. **Superlike as Amplified Signal:** When a user superlikes, apply 2x the normal like weight to all entities. This is a strong explicit signal and should be treated as highly informative.

2. **"Watched and Rated" Feedback Loop:** When a user marks a movie as watched and gives a personal rating (1-10), update preferences based on the rating:
   - Rating 8-10: equivalent to another like (+1.0)
   - Rating 5-7: neutral (no update)
   - Rating 1-4: equivalent to a dislike (-0.3)

3. **Popularity Damping:** Apply slight negative weight to extremely popular movies that the user hasn't liked yet. If everyone's seen Titanic and this user hasn't liked it, they might not want to.

4. **Session Diversity:** Within a single session, don't show 3+ movies from the same franchise or by the same director in a row. Shuffle for variety even if the score says otherwise.

5. **Anti-Staleness:** If a user has been shown 80%+ of a genre's catalog, slightly boost other genres to prevent running out of content.

---

## 3. UX Best Practices

### 3.1 Card Design Patterns That Drive Engagement

Based on research across Tinder, dating apps, and movie swiping apps:

**Visual Hierarchy:**
- Poster image is the hero — full-bleed, edge-to-edge. The poster IS the card.
- Title overlaid with gradient fade (dark gradient from top, ensuring readability)
- Minimal text on the card face: title, year, rating badge. Everything else on pull-down detail.
- Keep card text to under 100 characters / 3 lines to reduce cognitive load.

**Card Stack Effect:**
- Show 2-3 cards in a stack with slight offset and scale reduction for background cards
- This creates anticipation ("what's next?") and visual depth
- Background cards should be slightly blurred/dimmed to focus attention on the top card

**Interaction Feedback:**
- Color-coded overlays during swipe: green "LIKE" stamp rotating in from left on right-swipe, red "NOPE" stamp on left-swipe
- Spring-physics animation (react-spring or framer-motion) for natural feel
- Card should rotate slightly in swipe direction (5-15 degrees)
- Velocity-based throw: faster swipes = card flies off screen faster

**Bottom Action Buttons:**
- Three buttons: ✕ (red/dislike), ★ (gold/superlike), ♡ (green/like)
- Buttons should have satisfying press animations (scale + haptic feedback)
- These serve as accessibility alternatives to swiping

### 3.2 Preventing Swipe Fatigue

Research from dating apps shows swipe fatigue is the #1 engagement killer. 79% of dating app users report burnout symptoms. Prevention strategies:

1. **Quality over Quantity:** Our curated catalog (5-8K quality movies vs. random dumps of 100K+ titles) inherently reduces "why am I seeing this?" frustration. This is our biggest advantage over MovieSwipe.

2. **Session Boundaries:** Consider a soft daily limit or "you've been swiping for 20 minutes" nudge. But don't enforce hard limits — let users continue if they want.

3. **Varied Card Density:** Not every card needs to be a full-decision card. Every 5-7 cards, inject a "mini break":
   - "Your taste profile just updated" card (gamification)
   - "You might like this collection: Oscar Best Picture Winners" (exploration)
   - A "Featured Film" card with more detail pre-expanded

4. **Progressive Disclosure:** The pull-down detail reveal means users can make quick gut decisions (poster + title) OR investigate deeper. This dual-speed interaction respects different user modes.

5. **"Because you liked..."** Show a brief recommendation reason on every 3rd-4th card (e.g., small text like "Because you liked Inception" or "Popular in Sci-Fi"). This creates a sense of understanding and makes swipes feel purposeful rather than random.

6. **Quick Filters:** Accessible filter drawer means users can narrow the feed when they feel overwhelmed. "Show me only comedies from the 2010s" makes the next 20 swipes feel more intentional.

### 3.3 Undo Mechanism (Shake to Undo)

IDEA.md specifies shake-to-undo, which is a validated UX pattern:

**Implementation best practices:**
- Shake detection threshold should be calibrated to avoid accidental triggers (use accelerometer with ~2.5g threshold)
- Show a brief toast/snackbar when undo happens: "Movie restored ♻️"
- Only allow undo of the LAST card (not infinite history)
- Consider also adding a small "undo" button that appears for 3-5 seconds after each swipe (like Gmail's "Undo Send")
- On iOS, the 3-finger swipe left gesture is the system undo — support this too
- Animate the card flying back from the direction it left
- **Important:** Only undo dislikes (left swipes). Undoing a like is removing from watchlist, which is a different flow.

**Alternative/Addition to shake:** A small circular "↩" button in the top-left corner that's always visible. Shake can be unreliable on some devices and embarrassing in public. Having both options is inclusive.

### 3.4 Onboarding Flow

Based on research from Spotify, Netflix, and the Matched app:

**Recommended Flow (3 screens, under 2 minutes):**

1. **Welcome Screen** (5 seconds)
   - App logo, tagline: "Swipe to discover your next favorite movie"
   - Single "Get Started" button

2. **Genre Selection** (30-45 seconds)
   - "Pick 3-5 genres you enjoy"
   - 12-15 genre chips in a grid
   - Visual: each chip has a small representative poster thumbnail behind it
   - Minimum 3 selections required before "Continue"
   - Skip option available (for users who want to dive in)

3. **Quick Rate** (45-60 seconds)
   - "Like or dislike these movies to help us learn your taste"
   - Show 8-12 well-known movies across selected genres
   - Simple thumbs up / thumbs down (not full swipe — this should feel fast)
   - Skip option after rating at least 5
   - Show progress bar: "5/12 rated"

4. **Ready Screen** (3 seconds)
   - "Your feed is ready!" with a brief animation
   - "Start swiping" button
   - Transition directly into the feed

**Anti-patterns to avoid:**
- Don't ask for registration/login before showing value. Let users swipe first, prompt login when they want to save progress.
- Don't show a tutorial on how to swipe — it's intuitive. At most, a single subtle animation on the first card.
- Don't ask for too much (no demographics, no 50-movie rating quiz). 2 minutes maximum.

### 3.5 Recommendation Transparency ("Why This?")

Netflix's "Because you watched..." is the gold standard. Our implementation:

**On the card face (subtle):**
- Small text below the title: "Matches your taste in Sci-Fi" or "Director of movies you loved"
- Only show on every 3rd-4th card to avoid visual clutter
- Keep it to one short reason, not multiple

**On the detail view (pull-down):**
- "Why we think you'll like this" section
- Show 2-3 matching signals with icons:
  - 🎭 "You liked 4 other films by Christopher Nolan"
  - 🎬 "Matches your love of Sci-Fi Thrillers"
  - ⭐ "Academy Award Winner — Best Picture"
- This builds trust and teaches users HOW the algorithm works

### 3.6 Filter UX Patterns

Based on JustWatch, Netflix, and mobile filter best practices:

**Drawer vs. Modal:**
- Bottom sheet (slide-up) on mobile is the best pattern — familiar from maps, music apps
- Should be a half-screen sheet by default, expandable to full-screen for complex filters
- "Apply" is the primary action, always visible. "Reset" is secondary.

**Filter Chips Pattern:**
- Active filters should show as removable chips below the content tabs (Movies | Series | Animation)
- This gives persistent visibility of what's filtered without taking up much space
- Tapping a chip removes it; tapping "+ Filter" opens the drawer

**Genre Multi-Select:**
- Horizontal scrolling chip row (not a grid — takes less space)
- Selected chips change color (gold/amber accent)
- Show genre emoji prefix for scannability: 🔪 Horror, 😂 Comedy, 🚀 Sci-Fi

**Range Sliders:**
- Year range (1970-2025): dual-thumb slider with decade markers
- Rating range: dual-thumb slider with 0.5 increments
- Show current values above the slider in real-time

**Smart Defaults:**
- Filters should default to "no filter" (everything included)
- Most recently used filter combination should be remembered per session

### 3.7 Watchlist Management Patterns

Based on Letterboxd, Hotstar case study, and movie app design research:

**Grid Layout:**
- 3-column grid of poster thumbnails (consistent 2:3 aspect ratio)
- No text below posters — keeps the grid clean and poster-focused
- Long-press a poster to see quick actions (remove, mark watched)
- Tap opens full detail view

**Tabs:**
- All | Unwatched | Watched (as specified in IDEA.md)
- Show count badge on each tab: "Unwatched (24)"

**Sort Options:**
- Date added (default, newest first)
- Rating (TMDB/IMDB)
- Year (newest/oldest)
- Personal rating (for watched items)
- Alphabetical

**Drag-to-Reorder:**
- Allow users to manually reorder their watchlist by long-press and drag
- This is a "what to watch next" prioritization tool
- Optional — don't make it the default interaction mode

**Batch Actions:**
- "Select" mode for bulk operations (remove multiple, mark multiple as watched)
- Swipe-to-remove on individual items (with undo snackbar)

**Empty State:**
- When watchlist is empty, show encouraging copy: "Start swiping to build your watchlist"
- Link directly to the feed

### 3.8 Additional UX Recommendations

1. **Haptic Feedback:** Use subtle haptics on swipe completion, button taps, and undo. This is especially important for PWA on iOS (if supported via the Vibration API).

2. **Skeleton Loading:** When the feed is loading, show card-shaped skeleton placeholders. Never show a blank screen or generic spinner.

3. **Pull-to-Refresh:** On the feed, pull-to-refresh should reshuffle the deck (regenerate scores with new random seed). This gives users a sense of control.

4. **Swipe Counter Gamification:** "You've discovered 127 movies" — a running counter in the profile. People like seeing progress.

5. **"Seen It Already" Action:** Consider a third swipe direction (swipe up?) or a button for "Already watched, don't show again but don't count as dislike." This is missing from most competitors and prevents false negative signals.

6. **Dark Mode Default:** The app should launch in dark mode by default (matching the cinematic aesthetic). Light mode available via settings toggle.

7. **Poster Preloading:** Preload the next 3-5 posters while the user is viewing the current card. Swipe transitions should be instant — no loading states between cards.

8. **Weekly Digest:** Optional push notification: "5 new movies that match your taste were added this week." Drives re-engagement without being annoying.

---

## 4. Summary of Key Recommendations for pickme.mov

### Algorithm
- Implement the weighted scoring formula with 50% personalization, 30% quality, 10% exploration, 10% random
- Use asymmetric like/dislike weighting (1.0 : -0.3 ratio)
- Apply TF-IDF-inspired IDF weights so rare entities (specific directors) are more informative than common ones (Drama genre)
- Use exponential time decay with half-life ~69 days
- Solve cold-start with 3-screen onboarding + gradual personalization ramp-up
- Implement session diversity (no 3+ same-director/franchise in a row)
- Pre-compute base quality scores; recompute personalization on swipe events

### UX
- Poster-centric card design with pull-down detail reveal
- Shake-to-undo PLUS visible undo button (for 5 seconds after swipe)
- "Because you liked..." transparency on every 3rd-4th card
- Bottom-sheet filter drawer with chip-based active filter display
- 3-screen onboarding under 2 minutes (genres → quick rate → start)
- Session diversity and exploration cards to prevent swipe fatigue
- 3-column poster grid watchlist with tab filtering

### Design
- Dark cinematic theme matching Letterboxd's aesthetic
- Gold/amber accent color for likes and highlights
- Full-bleed poster images as the hero element
- Spring-physics animations for swipe gestures
- Skeleton loading states, never blank screens
- Preload next 3-5 posters for instant transitions

---

*Report generated: 2026-02-07*
*Data sources: App Store listings, Product Hunt, TechCrunch, Google Play, academic papers on recommendation systems, UX research from NNGroup, Smashing Magazine, and various Medium design articles.*
