import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { add, sub, mul, neg, sum, roundTo, toMoney, cmp, isZero } from "../server/accounting/decimal";

describe("exact decimal arithmetic", () => {
  it("adds without float drift", () => {
    expect(add("0.1", "0.2")).toBe("0.3"); // 0.30000000000000004 in IEEE-754
    expect(sum(Array(10).fill("0.1"))).toBe("1");
  });

  it("multiplies an ITBIS base exactly", () => {
    // 1234.56 * 0.18 = 222.2208 exactly. A float yields 222.22079999999997.
    expect(mul("1234.56", "0.18")).toBe("222.2208");
    expect(roundTo(mul("1234.56", "0.18"), 2)).toBe("222.22");
  });

  it("rounds halves away from zero, as Dominican invoicing does", () => {
    expect(roundTo("0.005", 2)).toBe("0.01");
    expect(roundTo("0.015", 2)).toBe("0.02"); // banker's rounding would give 0.02 too
    expect(roundTo("0.025", 2)).toBe("0.03"); // banker's rounding would give 0.02
    expect(roundTo("-0.005", 2)).toBe("-0.01");
    expect(roundTo("2.5", 0)).toBe("3");
    expect(roundTo("-2.5", 0)).toBe("-3");
  });

  it("renders numeric(18,4) with a fixed width", () => {
    expect(toMoney("1")).toBe("1.0000");
    expect(toMoney("0.00005")).toBe("0.0001");
    expect(toMoney("-3.14159")).toBe("-3.1416");
    expect(toMoney("0")).toBe("0.0000");
  });

  it("keeps large ledger balances exact", () => {
    // A year of invoices summed. numeric(18,4) holds it; a float loses cents
    // past 2^53 / 10^4 ≈ 9e11.
    expect(add("99999999999.9999", "0.0001")).toBe("100000000000");
  });

  it("rejects anything that is not a decimal", () => {
    for (const bad of ["", " ", "abc", "1.2.3", "1e5", "NaN", "Infinity", "--1", "1,5"]) {
      expect(() => add(bad, "0")).toThrow(RangeError);
    }
  });

  it("has no negative zero", () => {
    expect(neg("0")).toBe("0");
    expect(sub("1", "1")).toBe("0");
    expect(isZero(neg("0"))).toBe(true);
  });

  // ── Properties ────────────────────────────────────────────────────────────

  const decimal = () =>
    fc
      .tuple(fc.bigInt({ min: -(10n ** 14n), max: 10n ** 14n }), fc.integer({ min: 0, max: 4 }))
      .map(([n, places]) => {
        const s = n.toString();
        const neg = s.startsWith("-");
        const digits = neg ? s.slice(1) : s;
        const padded = digits.padStart(places + 1, "0");
        const cut = padded.length - places;
        const value = places === 0 ? padded : `${padded.slice(0, cut)}.${padded.slice(cut)}`;
        return (neg ? "-" : "") + value;
      });

  it("property: addition is commutative and associative", () => {
    fc.assert(
      fc.property(decimal(), decimal(), decimal(), (a, b, c) => {
        expect(add(a, b)).toBe(add(b, a));
        expect(add(add(a, b), c)).toBe(add(a, add(b, c)));
      }),
    );
  });

  it("property: a - a is zero, and a + (-a) is zero", () => {
    fc.assert(
      fc.property(decimal(), (a) => {
        expect(sub(a, a)).toBe("0");
        expect(add(a, neg(a))).toBe("0");
      }),
    );
  });

  it("property: multiplication by one is identity, by zero is zero", () => {
    fc.assert(
      fc.property(decimal(), (a) => {
        // Compared by value, not by string: inputs like "0.0" are accepted but
        // every result is rendered canonically ("0").
        expect(cmp(mul(a, "1"), a)).toBe(0);
        expect(mul(a, "0")).toBe("0");
      }),
    );
  });

  it("property: rounding never moves a value by half a step or more", () => {
    fc.assert(
      fc.property(decimal(), fc.integer({ min: 0, max: 4 }), (a, places) => {
        const r = roundTo(a, places);
        const halfStep = `0.${"0".repeat(places)}5`;
        const drift = sub(r, a);
        const magnitude = cmp(drift, "0") < 0 ? neg(drift) : drift;
        expect(cmp(magnitude, halfStep)).toBeLessThanOrEqual(0);
      }),
    );
  });

  it("property: summing a list equals folding it, in any order", () => {
    fc.assert(
      fc.property(fc.array(decimal(), { maxLength: 30 }), (xs) => {
        const forward = sum(xs);
        const backward = sum([...xs].reverse());
        expect(forward).toBe(backward);
      }),
    );
  });

  it("property: toMoney is idempotent", () => {
    fc.assert(
      fc.property(decimal(), (a) => {
        expect(toMoney(toMoney(a))).toBe(toMoney(a));
      }),
    );
  });
});
