import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FactErrorResponse, FactResponse } from "@/app/api/fact/route";
import { createClock, createMemoryStore } from "./helpers/memory-store";

// The route's two collaborators are replaced:
//  - the session lookup, so each test decides who is signed in
//  - the production fact service (Postgres + OpenAI), swapped for the real
//    service logic running on an in-memory store
const h = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  getFact: vi.fn<(userId: string) => Promise<unknown>>(),
}));

vi.mock("@/lib/session", () => ({
  getSessionUserId: async () => h.sessionUserId,
}));

vi.mock("@/lib/facts", async () => {
  const service = await import("@/lib/facts/service");
  return {
    FactUnavailableError: service.FactUnavailableError,
    NoFavoriteMovieError: service.NoFavoriteMovieError,
    factService: { getFact: h.getFact },
  };
});

const { GET } = await import("@/app/api/fact/route");
const { createFactService } = await import("@/lib/facts/service");

const ALICE = "user-alice";
const BOB = "user-bob";

function wireService(generate: (movie: string) => Promise<string>) {
  const clock = createClock();
  const memory = createMemoryStore(clock.now);
  const service = createFactService({
    store: memory.store,
    generate,
    now: clock.now,
  });
  h.getFact.mockImplementation((userId) => service.getFact(userId));
  return memory;
}

beforeEach(() => {
  h.sessionUserId = null;
  h.getFact.mockReset();
});

describe("GET /api/fact authorization", () => {
  it("returns 401 and does no work when signed out", async () => {
    const response = await GET();
    const body = (await response.json()) as FactErrorResponse;

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHENTICATED");
    expect(h.getFact).not.toHaveBeenCalled();
  });

  it("only ever asks for the session user's fact", async () => {
    wireService(async () => "A fact").setMovie(BOB, "Alien");
    h.sessionUserId = BOB;

    await GET();

    expect(h.getFact).toHaveBeenCalledTimes(1);
    expect(h.getFact).toHaveBeenCalledWith(BOB);
  });

  it("does not return another user's fact, even for the same movie", async () => {
    let n = 0;
    const memory = wireService(async () => `Generated fact ${++n}`);
    memory.setMovie(ALICE, "Alien");
    memory.setMovie(BOB, "Alien");

    h.sessionUserId = ALICE;
    const aliceBody = (await (await GET()).json()) as FactResponse;

    h.sessionUserId = BOB;
    const bobResponse = await GET();
    const bobBody = (await bobResponse.json()) as FactResponse;

    expect(bobResponse.status).toBe(200);
    expect(bobBody.fact.id).not.toBe(aliceBody.fact.id);
    expect(bobBody.fact.content).not.toBe(aliceBody.fact.content);
    const bobFactOwner = memory.facts.find((f) => f.id === bobBody.fact.id)?.userId;
    expect(bobFactOwner).toBe(BOB);
  });

  it("does not expose internal ids of the user in the response", async () => {
    wireService(async () => "A fact").setMovie(ALICE, "Alien");
    h.sessionUserId = ALICE;

    const response = await GET();
    const body = (await response.json()) as FactResponse;

    expect(body.fact).not.toHaveProperty("userId");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("GET /api/fact error mapping", () => {
  it("returns a friendly 503 when OpenAI fails and nothing is cached", async () => {
    wireService(async () => {
      throw new Error("sk-secret-should-not-leak: upstream 500");
    }).setMovie(ALICE, "Alien");
    h.sessionUserId = ALICE;

    const response = await GET();
    const body = (await response.json()) as FactErrorResponse;

    expect(response.status).toBe(503);
    expect(body.code).toBe("FACT_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("sk-secret");
  });

  it("returns 409 when the user has not chosen a movie", async () => {
    wireService(async () => "A fact");
    h.sessionUserId = ALICE;

    const response = await GET();

    expect(response.status).toBe(409);
  });

  it("returns the stale fact with 200 when OpenAI fails but a fact exists", async () => {
    const generate = vi
      .fn<(movie: string) => Promise<string>>()
      .mockResolvedValueOnce("The original fact");
    const memory = wireService(generate);
    memory.setMovie(ALICE, "Alien");
    h.sessionUserId = ALICE;
    await GET();

    // Age the stored fact past the cache window, then make OpenAI fail.
    memory.facts[0]!.createdAt = new Date(memory.facts[0]!.createdAt.getTime() - 61_000);
    generate.mockRejectedValueOnce(new Error("timeout"));
    const response = await GET();
    const body = (await response.json()) as FactResponse;

    expect(response.status).toBe(200);
    expect(body.source).toBe("stale");
    expect(body.fact.content).toBe("The original fact");
  });
});
