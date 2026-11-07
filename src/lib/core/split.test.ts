import { describe, expect, it } from "vitest";
import { shares, validateSplit, type ExpenseLike } from "./split";

const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("shares: equal", () => {
  it("splits evenly when it divides", () => {
    const s = shares({ amount: 30_000, paid_by: "a", split_mode: "equal", split: { a: 1, b: 1, c: 1 } });
    expect(Object.fromEntries(s)).toEqual({ a: 10_000, b: 10_000, c: 10_000 });
  });

  it("gives the odd satang to the payer first", () => {
    // 100.00 / 3 = 33.333...: one extra satang, payer b takes it
    const s = shares({ amount: 10_000, paid_by: "b", split_mode: "equal", split: { a: 1, b: 1, c: 1 } });
    expect(Object.fromEntries(s)).toEqual({ a: 3333, b: 3334, c: 3333 });
  });

  it("then by member id when the payer is not sharing or already got one", () => {
    // 100.00 / 3 with 2 leftover satang, payer is outside the split
    const s = shares({ amount: 10_001, paid_by: "z", split_mode: "equal", split: { c: 1, a: 1, b: 1 } });
    expect(Object.fromEntries(s)).toEqual({ a: 3334, b: 3334, c: 3333 });
  });

  it("ignores members with 0 (not in this expense)", () => {
    const s = shares({ amount: 1000, paid_by: "a", split_mode: "equal", split: { a: 1, b: 0, c: 1 } });
    expect(Object.fromEntries(s)).toEqual({ a: 500, c: 500 });
  });

  it("does not depend on key order", () => {
    const e1: ExpenseLike = { amount: 1001, paid_by: "x", split_mode: "equal", split: { b: 1, a: 1, c: 1 } };
    const e2: ExpenseLike = { ...e1, split: { c: 1, b: 1, a: 1 } };
    expect(Object.fromEntries(shares(e1))).toEqual(Object.fromEntries(shares(e2)));
  });

  it("handles 1 satang split between many people", () => {
    const s = shares({ amount: 1, paid_by: "c", split_mode: "equal", split: { a: 1, b: 1, c: 1 } });
    expect(Object.fromEntries(s)).toEqual({ a: 0, b: 0, c: 1 });
  });
});

describe("shares: weights", () => {
  it("splits by weight", () => {
    const s = shares({ amount: 90_000, paid_by: "a", split_mode: "weights", split: { a: 2, b: 1 } });
    expect(Object.fromEntries(s)).toEqual({ a: 60_000, b: 30_000 });
  });

  it("supports fractional weights without float drift", () => {
    const s = shares({ amount: 10_000, paid_by: "a", split_mode: "weights", split: { a: 1.5, b: 1, c: 0.5 } });
    expect(Object.fromEntries(s)).toEqual({ a: 5000, b: 3333, c: 1667 });
    expect(sum(s)).toBe(10_000);
  });

  it("gives leftovers to the largest remainders", () => {
    // 1000 * 1/7 = 142.857, 1000 * 6/7 = 857.142 -> 143 + 857
    const s = shares({ amount: 1000, paid_by: "b", split_mode: "weights", split: { a: 1, b: 6 } });
    expect(Object.fromEntries(s)).toEqual({ a: 143, b: 857 });
  });
});

describe("shares: exact", () => {
  it("uses the given amounts", () => {
    const s = shares({ amount: 500, paid_by: "a", split_mode: "exact", split: { a: 200, b: 300 } });
    expect(Object.fromEntries(s)).toEqual({ a: 200, b: 300 });
  });
});

describe("shares: always sums to the amount", () => {
  it("for many random equal and weighted splits", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 2000; i++) {
      const n = 1 + Math.floor(rand() * 10);
      const split: Record<string, number> = {};
      for (let k = 0; k < n; k++) split[`m${k}`] = i % 2 ? Math.round(rand() * 40) / 4 + 0.25 : 1;
      const amount = 1 + Math.floor(rand() * 10_000_000);
      const s = shares({ amount, paid_by: "m0", split_mode: i % 2 ? "weights" : "equal", split });
      expect(sum(s)).toBe(amount);
      for (const v of s.values()) expect(Number.isInteger(v) && v >= 0).toBe(true);
    }
  });
});

describe("validateSplit", () => {
  const base = { amount: 1000, paid_by: "a" };
  it("accepts a valid split", () => {
    expect(validateSplit({ ...base, split_mode: "equal", split: { a: 1, b: 1 } }, ["a", "b"])).toBeNull();
  });
  it("rejects nobody sharing", () => {
    expect(validateSplit({ ...base, split_mode: "equal", split: { a: 0 } })).toEqual({ kind: "empty" });
  });
  it("rejects exact amounts that do not add up", () => {
    expect(validateSplit({ ...base, split_mode: "exact", split: { a: 400, b: 500 } })).toEqual({
      kind: "exact_mismatch",
      total: 900,
      amount: 1000,
    });
  });
  it("rejects fractional satang and unknown members", () => {
    expect(validateSplit({ ...base, split_mode: "exact", split: { a: 999.5, b: 0.5 } })?.kind).toBe("not_whole");
    expect(validateSplit({ ...base, split_mode: "equal", split: { x: 1 } }, ["a"])?.kind).toBe("unknown_member");
    expect(validateSplit({ ...base, split_mode: "weights", split: { a: -1, b: 2 } })?.kind).toBe("negative");
    expect(validateSplit({ ...base, split_mode: "weights", split: { a: 1e400, b: 2 } })?.kind).toBe("negative");
    expect(validateSplit({ ...base, split_mode: "weights", split: { a: 5000, b: 2 } })?.kind).toBe("weight_range");
    expect(validateSplit({ ...base, split_mode: "weights", split: { a: 0.0001, b: 2 } })?.kind).toBe("weight_range");
    expect(validateSplit({ ...base, split_mode: "weights", split: { a: 1e-9, b: 2 } })?.kind).toBe("weight_range");
  });
});
