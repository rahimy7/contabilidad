import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "test/**/*.test.ts"],
    // Integration tests allocate NCFs and post journal entries against a real
    // Postgres branch; they must not interleave on the same rows.
    fileParallelism: false,
    testTimeout: 30_000,
    // Integration setups seed whole companies over the network to Neon; the
    // default 10s hook budget is too tight for ~180 sequential round trips.
    hookTimeout: 60_000,
  },
});
