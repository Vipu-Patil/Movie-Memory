import type { PrismaClient } from "@/generated/prisma/client";
import type { FactStore } from "./store";

export function createPrismaFactStore(db: PrismaClient): FactStore {
  return {
    async getFavoriteMovie(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { favoriteMovie: true },
      });
      return user?.favoriteMovie ?? null;
    },

    async getLatestFact(userId, movie) {
      return db.fact.findFirst({
        where: { userId, movie },
        orderBy: { createdAt: "desc" },
      });
    },

    async createFact(input) {
      return db.fact.create({ data: input });
    },

    async tryAcquireLock(userId, token, ttlMs) {
      // One statement, so Postgres decides the winner:
      //  - no row yet      -> INSERT succeeds, we hold the lease
      //  - row, expired    -> DO UPDATE runs, we take the lease over
      //  - row, still live -> WHERE is false, nothing is returned
      // Concurrent callers queue on the row lock and re-check the WHERE
      // clause, so at most one of them gets a row back.
      //
      // The lease is timed on the database clock (not the app clock) so all
      // app instances agree on when it expires.
      const ttlSeconds = ttlMs / 1000;
      const rows = await db.$queryRaw<{ token: string }[]>`
        INSERT INTO "FactGenerationLock" ("userId", "token", "expiresAt")
        VALUES (
          ${userId},
          ${token},
          (now() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlSeconds}::double precision)
        )
        ON CONFLICT ("userId") DO UPDATE
          SET "token" = EXCLUDED."token",
              "expiresAt" = EXCLUDED."expiresAt"
          WHERE "FactGenerationLock"."expiresAt" <= (now() AT TIME ZONE 'UTC')
        RETURNING "token"
      `;
      return rows.length === 1;
    },

    async releaseLock(userId, token) {
      // Matching on token means a request whose lease expired and was taken
      // over cannot delete the new holder's lease.
      await db.factGenerationLock.deleteMany({ where: { userId, token } });
    },
  };
}
