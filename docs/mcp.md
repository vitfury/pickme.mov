# MCP server

pickme.mov exposes its catalogue to AI clients over the Model Context Protocol,
so the user can ask for a film in prose and have it answered against their own
library and viewing history.

## The division of labour

The server does the **deterministic** half and the model does the **judgement**
half. This split is the whole design:

- A database can answer "action, released after 2000, IMDb above 7, at least 500
  votes, not yet watched". Those are columns and indexes.
- A database cannot answer "spectacular, with large-scale battles". That is a
  reading of the material.

So `search_titles` casts a wide net on the hard filters — up to 200 hits — and
ships each one with its genres, TMDB keywords and a short overview. The model
reads those and picks. Keywords carry most of the subjective signal, which is
why they travel with every search hit rather than only in the details call.

## Endpoint and authentication

`POST /mcp`, Streamable HTTP, stateless: no sessions, so every request carries
its own credential and builds a server bound to that one user. Nothing is shared
between requests.

Authentication is a bearer API key, generated in Profile → MCP access. Only the
SHA-256 hash is stored, so a key is readable exactly once, at creation. Keys are
revoked rather than deleted, which keeps the audit trail. `GET` and `DELETE` on
`/mcp` return 405 — there is no stream to resume and no session to end.

## Tools

| Tool | Purpose |
|---|---|
| `search_titles` | Filter the catalogue; returns a broad candidate set with keywords and overviews |
| `get_title_details` | Full record for up to 20 shortlisted titles — cast, crew, awards, availability |
| `mark_watched` | Record viewings, several at once, with no opinion attached |
| `rate_title` | Like or dislike, exactly as a swipe in the app would |
| `get_my_taste` | The learned profile: top genres, people, keywords, recent opinions |
| `list_filters` | Valid genre, provider and certification values, so filters are not guessed |

`search_titles` excludes watched titles by default, because the usual question
is what to watch next. Its `seen` parameter overrides that — `only_watched`
searches the user's own history instead.

## Recording what was already seen

Most of a user's viewing history predates the app. `mark_watched` exists so the
model can fix that in conversation: it offers a title, the user says they have
seen it, and the fact is recorded. A title with no swipe gets a row with the
neutral `watched` action; one that already carries a like, dislike or skip keeps
that action and only gains the flag. Marking is reversible with `watched: false`.

See `docs/decisions.md` → "Watched vs. Liked" for why viewing and opinion are
separate axes.

## Response size

A 150-title search runs roughly 20k tokens, which is the price of letting the
model do the selecting. Two levers cut it: `includeOverview: false` for a first
pass, and a smaller `limit`. Responses are compact JSON — pretty-printing a
result set this size costs thousands of tokens and buys nothing.
