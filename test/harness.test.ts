import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";

describe("test harness", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("runs fast-check property tests", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
    );
  });
});

describeIntegration("integration harness", () => {
  it("has a throwaway database to talk to", () => {
    expect(TEST_DATABASE_URL).toBeTruthy();
  });
});
