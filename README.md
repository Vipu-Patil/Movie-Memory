# Movie Memory

Sign in with Google, tell the app your favorite movie, and get a fun fact about it from OpenAI.

**Variant chosen: A (Backend-Focused: caching and correctness).** See [Variant choice](#variant-choice).

Stack: TypeScript, Next.js 16 (App Router), React 19, Tailwind CSS 4, Postgres, Prisma 7, Google OAuth (NextAuth), OpenAI API, Vitest.

## Setup

Prerequisites: Node.js 20.19 or newer, Docker (or any Postgres 14+), a Google OAuth client, and an OpenAI API key.

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Configure environment
cp .env.example .env
#    then fill in the values (see the table below)

# 3. Start Postgres
docker compose up -d

# 4. Apply database migrations
npx prisma migrate deploy

# 5. Run the app
npm run dev
```

Open http://localhost:3000.

### Google OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Authorized JavaScript origin: `http://localhost:3000`
3. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy the client ID and secret into `.env`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. The default in `.env.example` matches `docker-compose.yml`. |
| `NEXTAUTH_URL` | yes | Base URL of the app, `http://localhost:3000` locally. |
| `NEXTAUTH_SECRET` | yes | Signs and encrypts the session cookie. Generate with `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client secret. |
| `OPENAI_API_KEY` | yes | Used server-side only to generate facts. |
| `OPENAI_MODEL` | no | Chat model to use. Defaults to `gpt-4o-mini`. |
| `TEST_DATABASE_URL` | no | A separate, disposable database for the integration tests. |

None of these are prefixed `NEXT_PUBLIC_`, so none are ever included in the browser bundle.

## Database migrations

Migrations live in `prisma/migrations` and the schema in `prisma/schema.prisma`.

```bash
npx prisma migrate deploy   # apply existing migrations (setup, CI, production)
npx prisma migrate dev      # create a new migration after editing the schema
npx prisma studio           # browse the data
```

## Manual check

A quick way to confirm the whole flow works end to end:

1. Run `npm run dev` and open http://localhost:3000.
2. Sign in with Google. A new account is taken to `/onboarding`.
3. Enter a favorite movie. You land on `/dashboard` with your name, email, photo (or an initial if there is none) and a fun fact.
4. Refresh within 60 seconds. The same fact is shown (served from the cache).
5. Wait more than 60 seconds and refresh. A new fact is generated.
6. Log out, then visit `/dashboard` directly. You are sent back to the landing page.

## Tests

```bash
npm test            # unit tests, no database or network needed
npm run typecheck
```

The unit tests cover the 60-second cache window (including the exact 60s boundary), burst protection, OpenAI failure handling, authorization, and input validation.

There is also an integration suite that runs the real locking SQL against Postgres. It is skipped unless `TEST_DATABASE_URL` is set. It wipes that database, so use a dedicated one:

```bash
docker compose exec db createdb -U postgres movie_memory_test
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/movie_memory_test"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
npm test
```

## Architecture overview

### Request flow

```
Browser
  │  /                 landing page (Sign in with Google)
  │  /onboarding       first-time only: favorite movie form  ──► server action
  │  /dashboard        profile + movie (server-rendered)
  │                    └─ <FactCard> ──► GET /api/fact
  ▼
Next.js server
  lib/session.ts       who is signed in (verified session cookie → User row)
  lib/validation.ts    movie input rules (zod)
  lib/facts/service.ts cache window, lock, fallback  (pure logic, no I/O imports)
  lib/facts/prisma-store.ts   Postgres queries
  lib/openai.ts        the one OpenAI call
  ▼
Postgres (User, Fact, FactGenerationLock)        OpenAI
```

### Project layout

```
prisma/schema.prisma            data model
prisma/migrations/              SQL migrations
src/app/page.tsx                landing / login
src/app/onboarding/             page, form, server action
src/app/dashboard/page.tsx      dashboard
src/app/api/fact/route.ts       GET /api/fact
src/app/api/auth/[...nextauth]/ NextAuth handler
src/components/                 SignInButton, SignOutButton, Avatar, FactCard
src/lib/auth.ts                 NextAuth config (Google, JWT session, user upsert)
src/lib/session.ts              getSessionUserId, getCurrentUser
src/lib/facts/                  service, store interface, Prisma store, wiring
src/lib/openai.ts               fact generation
src/lib/validation.ts           movie validation
tests/                          unit tests + integration/ (Postgres)
```

### Authentication and routing

NextAuth handles the Google OAuth flow. On sign-in, the `jwt` callback upserts a `User` row keyed on Google's stable subject id (`sub`) and stores our own user id in the session token. Sessions are stateless encrypted cookies (JWT strategy).

Every page asks one function, `getCurrentUser()`, which reads the session and loads the row from Postgres. Routing follows from that:

| State | `/` | `/onboarding` | `/dashboard` |
|---|---|---|---|
| Signed out | landing page | → `/` | → `/` |
| Signed in, no movie | → `/onboarding` | form | → `/onboarding` |
| Signed in, has movie | → `/dashboard` | → `/dashboard` | dashboard |

"First-time user" is defined by data (`favoriteMovie` is null), not by a separate flag, so there is no way for the two to disagree. Guards run in the server components and the server action themselves rather than in middleware, so the check sits next to the data access it protects.

### Data model

```
User                 id, googleSub (unique), email, name?, image?, favoriteMovie?, timestamps
Fact                 id, userId → User, movie, content, createdAt
                     index (userId, movie, createdAt DESC)
FactGenerationLock   userId (PK) → User, token, expiresAt
```

Why it looks like this:

- **`googleSub` is the identity key, not email.** A Google account's email can change; its `sub` cannot. Email is stored for display only and is not unique.
- **`name` and `image` are nullable** because Google does not always provide them. The dashboard falls back to the email's local part and to an initial in place of the photo (also if the photo URL fails to load).
- **`favoriteMovie` lives on `User`.** It is a single free-text value per user. There is no `Movie` table because without an external catalogue (e.g. TMDB) there is no canonical movie identity to normalise to.
- **`Fact` is append-only and snapshots `movie`.** The cache key required by the spec is user + movie, so each fact records which movie it was written about. If the favorite movie changes, old facts simply stop matching. Nothing has to be invalidated.
- **The index matches the one hot query**: latest fact for a user and movie.
- **`FactGenerationLock` is its own table** rather than columns on `User`, so lock churn never touches the user row and its meaning is obvious. All child rows cascade on user delete.

### Fact generation (Variant A)

`GET /api/fact` takes no parameters. The service does this:

1. Load the user's favorite movie.
2. **Cache check.** Read the newest fact for (user, movie). If it is less than 60 seconds old, return it.
3. **Take the lock.** Try to acquire the per-user generation lease.
4. If acquired:
   - **Re-check the cache** (another request may have finished between steps 2 and 3).
   - Call OpenAI, insert the new fact, return it.
   - Release the lock in a `finally` block.
5. If not acquired, another request is already generating. Poll for its fact (every 250ms, up to 12s) and return that, so the burst produces one OpenAI call and everyone sees the same fact.
6. **On failure** (OpenAI error, timeout, or the wait in step 5 running out): return the most recent older fact marked `stale`, or a 503 with a friendly message if there is none.

**The lock** is the "generation in progress flag" approach, done as a database lease so it works across multiple server instances and serverless invocations:

```sql
INSERT INTO "FactGenerationLock" ("userId", "token", "expiresAt")
VALUES ($1, $2, now() + ttl)
ON CONFLICT ("userId") DO UPDATE
  SET "token" = EXCLUDED."token", "expiresAt" = EXCLUDED."expiresAt"
  WHERE "FactGenerationLock"."expiresAt" <= now()
RETURNING "token";
```

It is a single statement, so Postgres picks the winner: concurrent callers queue on the row and re-evaluate the `WHERE`, and exactly one gets a row back. The lease expires after 30 seconds so a crashed request cannot block a user forever, and it is released by token so a request can only release its own lease.

**Why not hold a transaction or advisory lock during generation?** That would keep a database connection and transaction open for the length of an OpenAI call (seconds). With the lease, the database is only touched for a few milliseconds before and after.

**OpenAI safety.** The call has a 10 second timeout and no SDK retries (so it always finishes well inside the 30 second lease). The movie title is user input, so it is sent as data in its own message with a system prompt that says to treat it only as a title, output is capped in length, and React escapes it on render. Raw OpenAI errors are logged server-side and never returned to the client.

**Time.** Fact freshness uses the application clock (injected into the service, which is what makes the 60s boundary testable). Lock expiry uses the database clock so all instances agree.

### Security

- **Validation**: `lib/validation.ts` trims, collapses whitespace, enforces 1 to 100 characters and rejects control characters. It runs in the server action. The input's `maxLength` in the browser is only a hint.
- **Authorization**: there is no code path where a user id comes from the client. The API route and the server action both take the id from the verified session cookie, and every store method is scoped by that id. The onboarding write is `WHERE id = <session user> AND favoriteMovie IS NULL`.
- **Secrets**: all secrets are server-only environment variables. The fact API returns only the fact's id, movie, content and timestamps.
- **CSRF**: NextAuth protects its own endpoints; Next.js server actions check the request origin; the only custom endpoint is a read-only GET.

## Variant choice

I chose **Variant A** because the most interesting problem in this app is on the server: an expensive, slow, unreliable external call that several requests can trigger at once. Getting that right (one generation per window, a correct boundary, a sane answer when OpenAI is down) is where the correctness risk is, and it is the part I can back with tests rather than describe. Variant B's client-side cache would also not protect the OpenAI bill from a second tab or device; the server-side guard does.

## Key tradeoffs

- **JWT sessions instead of database sessions.** Fewer tables and no session lookup per request, and the schema stays focused on the product. The cost is that a session cannot be revoked server-side before it expires. Profile data is still read from Postgres on each request, so a deleted user is treated as signed out immediately.
- **Database lease instead of an in-memory lock.** Slightly more code and one raw SQL statement, in exchange for being correct with more than one server process.
- **Waiting requests poll.** Simple and good enough at 250ms. The downside: if the generating request fails, waiters keep polling until their 12s timeout before falling back to the stale fact.
- **A rare duplicate is possible.** If a request stalls for longer than the 30s lease (far beyond the 10s OpenAI timeout), another request can take over and both may store a fact. I accepted this over holding a transaction open; the result is an extra row, not incorrect data.
- **Fact is fetched client-side after the dashboard renders.** The profile and movie appear immediately instead of waiting on OpenAI, at the cost of one small client component with loading and error states.
- **No movie catalogue.** The movie is free text. "Alien" and "alien" are different cache keys. Normalising case would be easy; real identity needs an external API.
- **No "change my movie" UI.** Not required for Variant A (it is Variant B's feature). The data model already supports it.
- **No model-accuracy guarantee.** Facts come from an LLM and may be wrong; the UI presents them as fun facts, not reference material.

## With 2 more hours

1. Let waiters stop early when the lock disappears without a new fact (generation failed), instead of polling to the timeout.
2. Add an edit-movie flow, reusing the same validation.
3. Rate limit `/api/fact` per user as a second line of defence, and add a per-user daily generation cap.
4. Ask for a fact that differs from the last few (pass recent facts in the prompt) so refreshes do not repeat.
5. Run the integration suite in CI against a Postgres service container, and add a Playwright test for the sign-in → onboarding → dashboard path with a mocked OAuth provider.
6. Structured logging and a metric for cache hit / generated / stale / failed.
7. A fact history view (the data is already stored).

## AI usage

See [AI_USAGE.md](./AI_USAGE.md).