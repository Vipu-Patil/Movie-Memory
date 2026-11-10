import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaFactStore } from "@/lib/facts/prisma-store";
import { createFactService } from "@/lib/facts/service";
import { createPrismaClient } from "@/lib/prisma";

/**
 * Runs against a real Postgres so the concurrency guarantee is tested where
 * it actually lives (the atomic INSERT ... ON CONFLICT).
 *
 * Skipped unless TEST_DATABASE_URL is set. That database is wiped by these
 * tests, so never point it at real data. Prepare it once with:
 *   DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Postgres fact store (integration)", () => {
  const db = createPrismaClient(url);
  const store = createPrismaFactStore(db);

  async function createUser(name: string, movie: string | null = "Alien") {
    const user = await db.user.create({
      data: {
        googleSub: `sub-${name}-${Math.random().toString(36).slice(2)}`,
        email: `${name}@example.com`,
        favoriteMovie: movie,
      },
    });
    return user.id;
  }

  beforeEach(async () => {
    await db.user.deleteMany(); // cascades to facts and locks
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("grants the lease to exactly one of many concurrent callers", async () => {
    const userId = await createUser("alice");

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.tryAcquireLock(userId, `token-${i}`, 30_000),
      ),
    );

    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it("only releases the lease for the token that holds it", async () => {
    const userId = await createUser("alice");
    expect(await store.tryAcquireLock(userId, "holder", 30_000)).toBe(true);

    await store.releaseLock(userId, "not-the-holder");
    expect(await store.tryAcquireLock(userId, "other", 30_000)).toBe(false);

    await store.releaseLock(userId, "holder");
    expect(await store.tryAcquireLock(userId, "other", 30_000)).toBe(true);
  });

  it("lets an expired lease be taken over", async () => {
    const userId = await createUser("alice");
    expect(await store.tryAcquireLock(userId, "crashed", 0)).toBe(true);

    expect(await store.tryAcquireLock(userId, "next", 30_000)).toBe(true);
  });

  it("keeps leases independent per user", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");

    expect(await store.tryAcquireLock(alice, "a", 30_000)).toBe(true);
    expect(await store.tryAcquireLock(bob, "b", 30_000)).toBe(true);
  });

  it("generates one fact for a burst of concurrent requests", async () => {
    const userId = await createUser("alice");
    const generate = vi.fn(async (movie: string) => {
      await new Promise((resolve) => setTimeout(resolve, 150)); // slow OpenAI
      return `A fact about ${movie}`;
    });
    const service = createFactService({ store, generate });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => service.getFact(userId)),
    );

    expect(generate).toHaveBeenCalledTimes(1);
    expect(await db.fact.count({ where: { userId } })).toBe(1);
    expect(new Set(results.map((r) => r.fact.id)).size).toBe(1);
    expect(await db.factGenerationLock.count()).toBe(0);
  });

  it("serves the stored fact within 60s and scopes facts to their owner", async () => {
    const alice = await createUser("alice");
    const bob = await createUser("bob");
    const generate = vi.fn(async () => "A fact");
    const service = createFactService({ store, generate });

    const first = await service.getFact(alice);
    const second = await service.getFact(alice);
    expect(second.source).toBe("cache");
    expect(second.fact.id).toBe(first.fact.id);

    // Same movie, different user: Bob has no fact of his own yet.
    expect(await store.getLatestFact(bob, "Alien")).toBeNull();
    const bobFact = await service.getFact(bob);
    expect(bobFact.fact.userId).toBe(bob);
    expect(bobFact.fact.id).not.toBe(first.fact.id);
  });

  it("treats a fact older than 60s in the database as expired", async () => {
    const userId = await createUser("alice");
    await db.fact.create({
      data: {
        userId,
        movie: "Alien",
        content: "Old fact",
        createdAt: new Date(Date.now() - 61_000),
      },
    });
    const service = createFactService({ store, generate: async () => "New fact" });

    const result = await service.getFact(userId);

    expect(result.source).toBe("generated");
    expect(result.fact.content).toBe("New fact");
  });
});
