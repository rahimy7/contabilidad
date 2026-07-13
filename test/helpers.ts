import { describe } from "vitest";

/**
 * Integration tests need a real Postgres: the NCF allocator relies on row locks
 * and the balance invariant on a deferred constraint trigger. Neither is
 * exercised by a mock. Point TEST_DATABASE_URL at a throwaway Neon branch —
 * never at DATABASE_URL, since these tests truncate tables.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;
