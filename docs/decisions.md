# pickme.mov — Technical Decisions

## Finalized Stack
| Layer | Decision |
|-------|----------|
| Frontend | React + TypeScript |
| Swipe animations | framer-motion |
| State management | Zustand |
| API client | TanStack Query |
| Backend | Fastify + TypeScript |
| Database | PostgreSQL |
| Auth | Google OAuth (via passport or fastify-oauth2) |
| Deployment | Docker Compose (app + PostgreSQL) |
| i18n | i18next (Ukrainian primary, English) |

## Key Decisions

### Onboarding
- 3-screen flow: Genre chips (pick 3-5) → Quick-rate 8-12 famous movies (thumbs up/down) → Start swiping
- Under 2 minutes total
- No registration required before seeing value (OAuth prompt when wanting to save progress)

### Recommendation Algorithm
- Weighted scoring in PostgreSQL: 50% personalization + 30% base quality + 10% exploration + 10% random
- Asymmetric like/dislike: Like = +1.0, Superlike = +2.0, Dislike = -0.3
- Entity weights: Director (1.5x) > Genre (1.0x) > Top actors (0.8x) > Keywords (0.6x) > Collections (0.5x) > Supporting actors (0.4x) > Decades (0.3x)
- TF-IDF-inspired IDF weights for entity rarity
- Exponential time decay (half-life ~69 days)
- Cold-start: onboarding seeds initial preferences, then gradual personalization ramp over first 50 swipes
- Session diversity: no 3+ same-director/franchise in a row
- Exploration: every ~8th card from underexplored genres

### Watched vs. Liked (revised)
Opinion and viewing are two axes, and the app records both on one row per title
(`user_swipes`):
- A **like or dislike means the user has seen it** — you cannot judge what you
  have not watched — so either one sets `is_watched`. A dislike also covers "not
  interested, never going to watch it"; that is deliberate, and the cost is that
  a dislike is not proof of a viewing.
- **Skip** says nothing about either axis and returns after 30 days.
- **`watched`** is a fourth action for a viewing with no opinion attached. Only
  the MCP server writes it, for the history the user accumulated before this app
  existed.
- Anything `is_watched` is excluded from the feed and from MCP search by default.

Superseded: the original decision had no "seen it" concept at all, and the
`watched` flag lived inside the favourites list, so only liked titles could be
marked. Favourites are now simply the liked swipes — there is no separate table.

### "Why Recommended" Transparency
- Show recommendation reasons in the detail view (pull-down), NOT on the card face
- Below movie description: "Recommended because: you liked 4 other films by Christopher Nolan" etc.
- For debugging/transparency during initial months of use

### Undo
- Shake-to-undo on mobile
- Visible undo button + Ctrl+Z on desktop
- Only undo the LAST swipe (not infinite history)

### PWA / Offline
- Standard PWA manifest, icons, splash screen
- NO offline support / service worker caching
- Skip service worker complexity

### Desktop Support
- Mobile-first design
- Desktop gets visible undo button + keyboard shortcuts
- No special desktop layout (responsive is enough)

### Watch Together
- SKIPPED entirely. Not in Phase 1 or schema design.

### Poster Images
- Hotlink from TMDB CDN (don't cache locally)
- Store `poster_path` in DB, construct URLs on the fly

### Other
- No Redis — PostgreSQL is enough for 50 users
- No ML models — all recommendation logic in SQL
- Dark theme default, light mode in settings
- Superlike = 2x weight on all entities (genres, actors, director, keywords)
