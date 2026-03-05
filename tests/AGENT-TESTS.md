# pickme.mov — End-to-End User Journey Tests

These tests are executed by Claude Code via Chrome browser automation (Claude in Chrome MCP).
They simulate real user journeys through the app — multi-step flows that chain actions across pages.

## Prerequisites
- Docker DB running: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres`
- Dev servers running: `npm run dev` (Vite on :5173, Fastify on :3001)
- Browser extension connected
- App URL: `http://localhost:5173`
- User must be logged in and past onboarding (if not, do dev login + onboarding first)

## Startup Procedure
1. `tabs_context_mcp` → get or create tab
2. Navigate to `http://localhost:5173`
3. Screenshot — if on `/login`, perform dev login (toggle dev mode, enter `test@pickme.mov`, submit)
4. If on `/onboarding`, complete it (pick 5 genres, rate all movies, click start)
5. Confirm feed is loaded before starting tests

## Execution Notes
- Take screenshots AFTER waiting for animations (0.5–1s)
- For swipe gestures: use `left_click_drag` with `start_coordinate` at card center (~280,400) and `coordinate` moved ≥150px horizontally
- For scroll between cards: use `scroll` action with 5 ticks at card center
- For keyboard: use `key` action with key names like "ArrowDown", "ArrowRight", "ctrl+z"
- If any test fails, screenshot the failure state, note what went wrong, and continue to the next test
- At the end, report: X/17 passed, with a list of failures and their screenshots

---

## UC-01: Browse Feed & View Details & Return to Same Card
**Scenario:** User browses the feed, finds an interesting movie, opens details, reads about it, and goes back to continue browsing from where they left off.
**Steps:**
1. On feed, screenshot — note movie title (call it Movie A)
2. Scroll down 3 times (wheel down 5 ticks each, 0.5s pause between)
3. Screenshot — note current movie title (call it Movie D, 4th card)
4. Tap the poster to open movie details
5. Wait 1s, screenshot — confirm detail page shows Movie D's title
6. Scroll down on detail page to see cast/crew section, screenshot
7. Click back button (top-left arrow)
8. Wait 1s, screenshot — confirm feed shows Movie D (NOT Movie A)
**Pass if:** Feed returns to the exact card (Movie D) the user was on before opening details.

---

## UC-02: Scroll Feed, Undo, Open Card, Add to Favorites
**Scenario:** User scrolls through feed, goes back to a previous movie via undo, opens it, and adds it to favorites from the detail page.
**Steps:**
1. On feed, screenshot — note Movie A
2. Swipe right to like Movie A (drag from center-right, release past 120px)
3. Wait 0.5s, screenshot — confirm next card shown (Movie B)
4. Click undo button (top-right circular arrow)
5. Wait 0.5s, screenshot — confirm Movie A is back
6. Tap the poster to open Movie A's detail page
7. Wait 1s, screenshot — confirm detail page for Movie A
8. Scroll down to find the "Add to Favorites" button, screenshot
9. Click "Add to Favorites" button
10. Screenshot — confirm button text changed (e.g., "In Favorites" or similar)
11. Click back to return to feed
12. Screenshot — confirm still on Movie A in feed
**Pass if:** Undo restores the card, detail page works, favorites button responds, feed position preserved.

---

## UC-03: Filter Movies by Genre, Browse Filtered Results, Clear Filter
**Scenario:** User wants to see only comedies, applies a genre filter, browses the filtered feed, then clears the filter.
**Steps:**
1. On feed, screenshot — note the current movie and its genres
2. Click the filter icon (top-right funnel) to open filter drawer
3. Wait 0.5s, screenshot — confirm filter drawer is open with genre chips visible
4. Click 2 genre chips (e.g., Comedy and Drama or whichever are visible)
5. Screenshot — confirm chips are highlighted
6. Click "Apply" button
7. Wait 2s, screenshot — confirm feed reloaded with (potentially different) cards
8. Scroll down 2-3 times to verify there are results
9. Open filter drawer again (click funnel icon)
10. Click "Reset" button to clear all filters
11. Click "Apply"
12. Wait 2s, screenshot — confirm feed shows unfiltered results again
**Pass if:** Filters apply and change results, reset returns to full feed, no crashes.

---

## UC-04: Switch Content Type, Scroll, Switch Back, Verify Position Reset
**Scenario:** User is browsing movies, switches to series, browses a bit, switches back to movies, and expects the movie feed to start fresh.
**Steps:**
1. On feed (Фільми tab active), scroll down 3 times to reach ~card 4
2. Screenshot — note the movie title (Movie D)
3. Click "Серіали" tab in TopBar
4. Wait 2s, screenshot — confirm series content loaded (different cards, different titles)
5. Scroll down 2 times in series feed
6. Screenshot — note a series title
7. Click "Фільми" tab to switch back
8. Wait 2s, screenshot — confirm movies loaded; check whether it starts from card 1 (expected: index resets to 0 on content type switch)
**Pass if:** Content type switches load different content, switching back resets the feed position.

---

## UC-05: Like Movies, Check Favorites in Saved Page
**Scenario:** User likes several movies in the feed, then navigates to Saved page to verify they appear in Favorites.
**Steps:**
1. On feed, screenshot — note Movie A title
2. Swipe right to like Movie A
3. Wait 0.5s, note Movie B, swipe right to like Movie B
4. Wait 0.5s, note Movie C, scroll down (skip Movie C without action)
5. Screenshot — on Movie D now
6. Click "Збережене" in bottom nav
7. Wait 1s, screenshot — verify Saved page loaded
8. Switch to Favorites tab (not Watchlist)
9. Screenshot — confirm Movie A and Movie B appear in the favorites grid
10. Click on Movie A's poster in the grid
11. Wait 1s, screenshot — confirm detail page for Movie A opens
12. Click back, confirm return to Saved page
**Pass if:** Liked movies appear in Favorites, navigation to detail from Saved works.

---

## UC-06: Bookmark from Feed, Verify in Saved Watchlist, Unbookmark
**Scenario:** User bookmarks a movie from the feed card, verifies it's in the Saved watchlist, then removes it.
**Steps:**
1. On feed, screenshot — note the movie title and bookmark icon state (outlined)
2. Click the bookmark icon (top-right, below undo)
3. Screenshot — confirm bookmark icon changed to filled/active
4. Click "Збережене" in bottom nav
5. Wait 1s, screenshot — confirm the bookmarked movie appears in Watchlist tab
6. Click "Стрічка" in bottom nav to return to feed
7. Wait 1s — confirm same card is shown (position preserved after tab switch)
8. Click the bookmark icon again to unbookmark
9. Screenshot — confirm icon reverted to outlined/inactive
10. Click "Збережене" again
11. Wait 1s, screenshot — confirm the movie is no longer in Watchlist (or list is empty)
**Pass if:** Bookmark toggle works both ways, Saved page reflects changes, feed position preserved across tab switches.

---

## UC-07: Search Movie, Open Detail, Navigate to Actor, Check Filmography
**Scenario:** User searches for a specific movie, opens its detail page, taps on an actor, and browses their filmography.
**Steps:**
1. Click "Пошук" in bottom nav
2. Wait 0.5s, screenshot — confirm search page with empty input
3. Click search input, type "Inception" (or "Matrix" or another known title)
4. Wait 1.5s (debounce), screenshot — confirm search results appear with movie titles
5. Click the first matching result
6. Wait 1s, screenshot — confirm content detail page loaded
7. Scroll down to the cast/actors section, screenshot
8. Click on one of the actor photos/names
9. Wait 1s, screenshot — confirm person page loaded with:
   - Actor photo, name, known-for role
   - Biography text
10. Scroll down to filmography section, screenshot — confirm movie posters in grid
11. Click on a movie in the filmography grid
12. Wait 1s, screenshot — confirm a different content detail page loaded
**Pass if:** Full chain works: search → movie detail → actor page → filmography → another movie detail.

---

## UC-08: Keyboard-Only Feed Navigation
**Scenario:** User navigates the feed using only keyboard shortcuts — arrow keys for navigation, left/right for like/dislike, Ctrl+Z for undo.
**Steps:**
1. On feed, click the card area once to ensure focus
2. Screenshot — note Movie A
3. Press ArrowDown key
4. Wait 0.5s, screenshot — confirm Movie B shown
5. Press ArrowDown key twice more
6. Screenshot — confirm Movie D shown
7. Press ArrowUp key
8. Screenshot — confirm Movie C shown (went back one)
9. Press ArrowRight key (like Movie C)
10. Wait 0.5s, screenshot — confirm next card shown (Movie D)
11. Press key "ctrl+z" (undo)
12. Wait 0.5s, screenshot — confirm Movie C is back
13. Press ArrowLeft key (dislike Movie C)
14. Wait 0.5s, screenshot — confirm next card shown
**Pass if:** All keyboard shortcuts work: arrows navigate, right=like, left=dislike, Ctrl+Z=undo.

---

## UC-09: Switch Language, Navigate Multiple Pages, Verify Consistency
**Scenario:** User switches language to English on profile, then verifies all pages display in English, then switches back.
**Steps:**
1. Click "Профіль" in bottom nav
2. Wait 1s, screenshot — confirm profile page in Ukrainian
3. Click "EN" language button
4. Wait 1s, screenshot — confirm profile page switched to English (labels, buttons, section headers)
5. Click bottom nav "Feed" (was "Стрічка", now should say "Feed" or English equivalent)
6. Wait 1s, screenshot — confirm feed TopBar tabs are in English, genre chips in English
7. Click bottom nav to go to Search page
8. Screenshot — confirm search page labels in English
9. Click bottom nav to go to Saved page
10. Screenshot — confirm saved page tabs/labels in English
11. Go back to Profile, click "UA" to restore Ukrainian
12. Screenshot — confirm Ukrainian restored
**Pass if:** Language switch applies globally across all pages, switch back works.

---

## UC-10: Toggle Theme, Browse Feed, Open Detail, Verify Theme Persists
**Scenario:** User switches to light theme, browses feed, opens a movie detail, verifies light theme is consistent everywhere.
**Steps:**
1. Click "Профіль" in bottom nav
2. Screenshot — confirm dark theme (dark background)
3. Click the light theme toggle button
4. Wait 0.5s, screenshot — confirm light theme applied (light background, dark text)
5. Click "Стрічка" in bottom nav
6. Wait 1s, screenshot — confirm feed is in light theme (light card backgrounds or light UI)
7. Tap a card to open movie details
8. Wait 1s, screenshot — confirm detail page is also in light theme
9. Click back to feed, then go to "Пошук"
10. Screenshot — confirm search page in light theme
11. Go back to Profile, switch back to dark theme
12. Screenshot — confirm dark theme restored everywhere
**Pass if:** Theme persists across all pages and navigation, toggle works both ways.

---

## UC-11: Rapid Swipe Sequence & Feed Stability
**Scenario:** User rapidly swipes through many cards to test feed stability, pagination, and that nothing breaks under fast interaction.
**Steps:**
1. On feed, screenshot — note starting card
2. Swipe right to like — wait 0.5s
3. Swipe left to dislike — wait 0.5s
4. Swipe right — wait 0.5s
5. Swipe right — wait 0.5s
6. Scroll down (wheel) — wait 0.5s
7. Swipe left — wait 0.5s
8. Swipe right — wait 0.5s
9. Scroll down — wait 0.5s
10. Swipe left — wait 0.5s
11. Screenshot — confirm feed is still functional, a valid card is displayed
12. Verify card shows proper info (title, year, poster, genres — no blank/broken card)
13. Try undo — confirm it works
14. Screenshot — confirm previous card restored correctly
**Pass if:** Feed remains stable after 10+ rapid actions, cards display correctly, undo still works.

---

## UC-12: Open Detail from Search Results, Bookmark, Verify in Saved
**Scenario:** User searches for a movie, opens it, bookmarks it from the detail page (if button exists), then checks it appears in Saved.
**Steps:**
1. Click "Пошук" in bottom nav
2. Type a known movie title (e.g. "Gladiator" or "Titanic")
3. Wait 1.5s, screenshot — confirm results shown
4. Click the first result to open detail page
5. Wait 1s, screenshot — confirm detail page loaded
6. Look for an "Add to Favorites" or bookmark button on the detail page
7. Click it, screenshot — confirm button state changed
8. Click back to return to search results
9. Screenshot — confirm search results still visible (not cleared)
10. Click "Збережене" in bottom nav
11. Wait 1s, screenshot — confirm the movie appears in Saved (Watchlist or Favorites tab)
**Pass if:** Search → detail → add favorite → saved page chain works end-to-end.

---

## UC-13: Filter by Year Range, Verify Cards Match, Open One
**Scenario:** User sets a year range filter to see only old classic movies, verifies cards match, opens one.
**Steps:**
1. On feed, click filter icon to open drawer
2. Wait 0.5s, screenshot — identify the year range slider
3. Adjust the year range slider to roughly 1990–2000 (drag the right handle left, or interact with slider)
4. Screenshot — confirm slider values changed
5. Click "Apply"
6. Wait 2s, screenshot — confirm feed reloaded
7. Check the year shown on the current card — it should be within the filtered range
8. Scroll down 2 times, check years on those cards too
9. Screenshot — confirm all visible cards are within ~1990-2000
10. Tap one card to open details
11. Wait 1s, screenshot — confirm detail page shows a movie from that era
12. Click back, open filters, reset, apply — confirm full feed returns
**Pass if:** Year filter restricts results to the correct range, detail page accessible from filtered results.

---

## UC-14: Dislike Several, Undo Multiple Times, Verify Order
**Scenario:** User dislikes 3 movies in a row, then undoes all 3 actions one by one, verifying each card comes back in reverse order.
**Steps:**
1. On feed, screenshot — note Movie A title
2. Swipe left to dislike Movie A
3. Wait 0.5s, screenshot — note Movie B
4. Swipe left to dislike Movie B
5. Wait 0.5s, screenshot — note Movie C
6. Swipe left to dislike Movie C
7. Wait 0.5s, screenshot — on Movie D now
8. Click undo — wait 0.5s, screenshot — confirm Movie C is back
9. Click undo — wait 0.5s, screenshot — confirm Movie B is back
10. Click undo — wait 0.5s, screenshot — confirm Movie A is back
11. Verify undo button is now disabled (no more history)
**Pass if:** Each undo restores the correct previous card in exact reverse order, undo disables when history is empty.

---

## UC-15: Full New User Journey (Login → Onboarding → First Swipes → Bookmark → Saved)
**Scenario:** Simulate a complete new user experience from first login to browsing and saving movies.
**Precondition:** Need a fresh user. Either reset preferences from profile, or use a new email for dev login.
**Steps:**
1. If currently logged in, go to Profile and click "Reset Preferences"
2. Confirm the reset in the modal
3. Wait — should redirect to `/onboarding`
4. Screenshot — confirm onboarding step 1 (genre selection)
5. Select 5 genre chips, click Next
6. Screenshot — confirm step 2 (rate movies)
7. Rate all movies (alternate like/dislike), wait for auto-advance to step 3
8. Screenshot — confirm step 3 (ready screen)
9. Click "Start Swiping"
10. Wait 2s, screenshot — confirm feed loaded with personalized recommendations
11. Scroll through 2-3 cards
12. Bookmark one card (click bookmark icon)
13. Swipe right to like another card
14. Go to "Збережене" — confirm bookmarked movie in Watchlist, liked movie in Favorites
15. Screenshot — confirm both sections populated
**Pass if:** Complete new-user flow works seamlessly from onboarding to saving content.

---

## UC-16: Navigate Between All Pages via Bottom Nav & Verify No State Loss
**Scenario:** User jumps between all 4 main pages rapidly and verifies each page loads correctly without breaking.
**Steps:**
1. On feed, scroll down 3 times, screenshot — note Movie D
2. Click "Збережене" — wait 1s, screenshot — confirm saved page loads
3. Click "Пошук" — wait 1s, screenshot — confirm search page loads
4. Click "Профіль" — wait 1s, screenshot — confirm profile page loads
5. Click "Стрічка" — wait 1s, screenshot — confirm feed loads and shows Movie D (position preserved)
6. Click "Пошук", type "Batman", wait 1.5s — confirm results
7. Click "Стрічка" — confirm feed still on Movie D
8. Click "Пошук" — confirm search input still has "Batman" and results are visible (or cleared — note behavior)
9. Screenshot final state
**Pass if:** All pages load correctly, feed position preserved across tab switches, no crashes or blank pages.

---

## UC-17: Person Page Deep Dive — Actor → Movie → Different Actor → Movie
**Scenario:** User explores the app by following actor/movie links: movie detail → actor → their other movie → another actor.
**Steps:**
1. On feed, tap current card to open movie detail
2. Wait 1s, scroll down to cast section, screenshot
3. Click on the first actor
4. Wait 1s, screenshot — confirm person page with photo, name, bio
5. Scroll down to filmography, screenshot — confirm movie grid
6. Click on a different movie in their filmography (not the one we came from)
7. Wait 1s, screenshot — confirm new movie detail page
8. Scroll down to cast section
9. Click on a different actor from this movie
10. Wait 1s, screenshot — confirm new person page
11. Use browser back (or back button) 4 times to get back to feed
12. Screenshot — confirm feed is back with correct card position
**Pass if:** Deep navigation chain works (4+ levels deep), back navigation returns to feed with position intact.
