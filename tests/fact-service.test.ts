import { describe, expect, it, vi } from "vitest";
import {
  CACHE_WINDOW_MS,
  FactUnavailableError,
  LOCK_TTL_MS,
  NoFavoriteMovieError,
  WAIT_TIMEOUT_MS,
  createFactService,
} from "@/lib/facts/service";
import { createClock, createMemoryStore } from "./helpers/memory-store";

const ALICE = "user-alice";
const BOB = "user-bob";

function setup(options: { sleepAdvancesClock?: boolean } = {}) {
  const clock = createClock();
  const memory = createMemoryStore(clock.now);
  let counter = 0;
  const generate = vi.fn(async (movie: string) => `Fact #${++counter} about ${movie}`);

  const service = createFactService({
    store: memory.store,
    generate,
    now: clock.now,
    // By default "sleep" just yields to the event loop so concurrent requests
    // interleave for real. The timeout test makes it advance the fake clock.
    sleep: options.sleepAdvancesClock
      ? async (ms) => clock.advance(ms)
      : () => new Promise((resolve) => setTimeout(resolve, 0)),
  });

  memory.setMovie(ALICE, "Alien");
  return { clock, memory, generate, service };
}

describe("60-second cache window", () => {
  it("generates and stores a fact when none exists", async () => {
    const { service, memory, generate } = setup();

    const result = await service.getFact(ALICE);

    expect(result.source).toBe("generated");
    expect(result.fact.content).toBe("Fact #1 about Alien");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(memory.facts).toHaveLength(1);
    expect(memory.facts[0]).toMatchObject({ userId: ALICE, movie: "Alien" });
  });

  it("returns the cached fact while it is less than 60 seconds old", async () => {
    const { service, clock, generate } = setup();
    const first = await service.getFact(ALICE);

    clock.advance(CACHE_WINDOW_MS - 1);
    const second = await service.getFact(ALICE);

    expect(second.source).toBe("cache");
    expect(second.fact.id).toBe(first.fact.id);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("generates a new fact once the cached one is exactly 60 seconds old", async () => {
    const { service, clock, generate, memory } = setup();
    const first = await service.getFact(ALICE);

    clock.advance(CACHE_WINDOW_MS);
    const second = await service.getFact(ALICE);

    expect(second.source).toBe("generated");
    expect(second.fact.id).not.toBe(first.fact.id);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(memory.facts).toHaveLength(2);
  });

  it("reports when the cache window ends", async () => {
    const { service } = setup();
    const { fact, cachedUntil } = await service.getFact(ALICE);

    expect(cachedUntil.getTime() - fact.createdAt.getTime()).toBe(CACHE_WINDOW_MS);
  });

  it("keys the cache on the movie, not just the user", async () => {
    const { service, memory, generate } = setup();
    await service.getFact(ALICE);

    memory.setMovie(ALICE, "Heat");
    const result = await service.getFact(ALICE);

    expect(result.source).toBe("generated");
    expect(result.fact.movie).toBe("Heat");
    expect(result.fact.content).toBe("Fact #2 about Heat");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when the user has no favorite movie", async () => {
    const { service, generate } = setup();

    await expect(service.getFact(BOB)).rejects.toBeInstanceOf(NoFavoriteMovieError);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("burst protection", () => {
  it("generates only once when many requests arrive together", async () => {
    const { service, memory, generate } = setup();
    generate.mockImplementation(async (movie) => {
      await new Promise((resolve) => setTimeout(resolve, 30)); // slow OpenAI
      return `Slow fact about ${movie}`;
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.getFact(ALICE)),
    );

    expect(generate).toHaveBeenCalledTimes(1);
    expect(memory.facts).toHaveLength(1);
    expect(new Set(results.map((r) => r.fact.id)).size).toBe(1);
    expect(results.filter((r) => r.source === "generated")).toHaveLength(1);
    expect(memory.isLocked(ALICE)).toBe(false);
  });

  it("does not let one user's generation block another user", async () => {
    const { service, memory, generate } = setup();
    memory.setMovie(BOB, "Alien");

    const [alice, bob] = await Promise.all([
      service.getFact(ALICE),
      service.getFact(BOB),
    ]);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(alice.source).toBe("generated");
    expect(bob.source).toBe("generated");
  });

  it("falls back to the previous fact if the in-flight generation never lands", async () => {
    const { service, clock, memory, generate } = setup({ sleepAdvancesClock: true });
    const first = await service.getFact(ALICE);
    clock.advance(CACHE_WINDOW_MS);

    // Another request holds the lease and never finishes.
    await memory.store.tryAcquireLock(ALICE, "someone-else", WAIT_TIMEOUT_MS * 10);
    const result = await service.getFact(ALICE);

    expect(result.source).toBe("stale");
    expect(result.fact.id).toBe(first.fact.id);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("takes over a lease abandoned by a crashed request", async () => {
    const { service, clock, memory } = setup();
    await memory.store.tryAcquireLock(ALICE, "crashed-request", LOCK_TTL_MS);

    clock.advance(LOCK_TTL_MS);
    const result = await service.getFact(ALICE);

    expect(result.source).toBe("generated");
  });
});

describe("OpenAI failure handling", () => {
  it("returns the most recent cached fact when generation fails", async () => {
    const { service, clock, memory, generate } = setup();
    const first = await service.getFact(ALICE);
    clock.advance(CACHE_WINDOW_MS + 1);

    generate.mockRejectedValueOnce(new Error("OpenAI timeout"));
    const result = await service.getFact(ALICE);

    expect(result.source).toBe("stale");
    expect(result.fact.id).toBe(first.fact.id);
    expect(memory.facts).toHaveLength(1);
  });

  it("throws a FactUnavailableError when generation fails and nothing is cached", async () => {
    const { service, generate, memory } = setup();
    generate.mockRejectedValueOnce(new Error("OpenAI is down"));

    await expect(service.getFact(ALICE)).rejects.toBeInstanceOf(FactUnavailableError);
    expect(memory.facts).toHaveLength(0);
  });

  it("releases the lease after a failure so the next request can retry", async () => {
    const { service, generate, memory } = setup();
    generate.mockRejectedValueOnce(new Error("OpenAI is down"));
    await expect(service.getFact(ALICE)).rejects.toThrow();
    expect(memory.isLocked(ALICE)).toBe(false);

    const retry = await service.getFact(ALICE);

    expect(retry.source).toBe("generated");
  });
});

describe("authorization at the service layer", () => {
  it("never serves one user's fact to another user with the same movie", async () => {
    const { service, memory } = setup();
    memory.setMovie(BOB, "Alien");

    const alice = await service.getFact(ALICE);
    const bob = await service.getFact(BOB);

    expect(bob.fact.userId).toBe(BOB);
    expect(bob.fact.id).not.toBe(alice.fact.id);
    // Bob's request generated his own fact rather than hitting Alice's cache.
    expect(bob.source).toBe("generated");
  });
});
