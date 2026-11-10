import type { FactRecord, FactStore } from "@/lib/facts/store";

/**
 * In-memory FactStore for unit tests. Mirrors the semantics of the Postgres
 * store (per-user scoping, token-owned expiring lease) without a database.
 */
export function createMemoryStore(now: () => Date) {
  const movies = new Map<string, string>();
  const facts: FactRecord[] = [];
  const locks = new Map<string, { token: string; expiresAt: number }>();
  let nextId = 1;

  const store: FactStore = {
    async getFavoriteMovie(userId) {
      return movies.get(userId) ?? null;
    },

    async getLatestFact(userId, movie) {
      const matches = facts
        .filter((fact) => fact.userId === userId && fact.movie === movie)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matches[0] ?? null;
    },

    async createFact(input) {
      const fact: FactRecord = { id: `fact-${nextId++}`, ...input };
      facts.push(fact);
      return fact;
    },

    async tryAcquireLock(userId, token, ttlMs) {
      const existing = locks.get(userId);
      if (existing && existing.expiresAt > now().getTime()) return false;
      locks.set(userId, { token, expiresAt: now().getTime() + ttlMs });
      return true;
    },

    async releaseLock(userId, token) {
      if (locks.get(userId)?.token === token) locks.delete(userId);
    },
  };

  return {
    store,
    facts,
    setMovie: (userId: string, movie: string) => movies.set(userId, movie),
    isLocked: (userId: string) => locks.has(userId),
  };
}

/** A controllable clock. */
export function createClock(start = Date.parse("2026-01-01T00:00:00.000Z")) {
  let current = start;
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}
