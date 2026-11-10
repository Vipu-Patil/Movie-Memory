# AI usage

I used Claude (Anthropic) as a coding assistant throughout this exercise.

- **Understanding the brief**: had it turn the PDF into a requirements checklist.
- **Design**: Claude proposed Variant A and the architecture: the schema, the 60-second cache keyed on user + movie, and a database lease for burst protection (chosen over an in-memory lock or holding a transaction open during the OpenAI call). I reviewed the reasoning and kept the design.
- **Code generation**: Claude wrote most of the code: Prisma schema and migration, NextAuth setup, the fact service and Postgres store, pages and components, and the README draft.
- **Tests**: Claude wrote the unit and integration tests, covering the exact 60-second boundary, a single generation during a burst, fallback to the last fact when OpenAI fails, and per-user isolation.
- **Setup and debugging**: I set up the environment myself (Google OAuth client, OpenAI key, a hosted Postgres database) and used Claude to help diagnose setup errors along the way.
- **My own verification**: I ran the test suite and the migrations, signed in with Google, completed onboarding, and generated facts locally. I confirmed the cache and burst behaviour in the server logs (cache hits around 100 ms, and two simultaneous requests producing one OpenAI call), and fixed a hydration warning caused by a browser extension.
- **Understanding**: I read through the code and can explain the schema, the cache and lock flow, and the failure handling.