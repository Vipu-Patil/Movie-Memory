export type FactRecord = {
  id: string;
  userId: string;
  movie: string;
  content: string;
  createdAt: Date;
};

/**
 * Everything the fact service needs from persistence. Every method takes the
 * userId explicitly and scopes its query to it, so there is no way to read or
 * write another user's rows through this interface.
 *
 * Implementations: Prisma/Postgres (production) and in-memory (unit tests).
 */
export interface FactStore {
  getFavoriteMovie(userId: string): Promise<string | null>;

  getLatestFact(userId: string, movie: string): Promise<FactRecord | null>;

  createFact(input: {
    userId: string;
    movie: string;
    content: string;
    createdAt: Date;
  }): Promise<FactRecord>;

  /**
   * Atomically take the per-user generation lease. Returns true only for the
   * single caller that got it. A lease older than `ttlMs` counts as abandoned
   * and can be taken over.
   */
  tryAcquireLock(userId: string, token: string, ttlMs: number): Promise<boolean>;

  /** Release the lease, but only if `token` still owns it. */
  releaseLock(userId: string, token: string): Promise<void>;
}
