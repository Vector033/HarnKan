import { describe, expect, it } from "vitest";
import { balances, settle, settleGreedy, type Transfer } from "./settle";

const net = (o: Record<string, number>) => new Map(Object.entries(o));

/** Applies transfers to balances and checks everyone ends at zero. */
function settlesExactly(start: Map<string, number>, transfers: Transfer[]) {
  const left = new Map(start);
  for (const t of transfers) {
    expect(t.amount).toBeGreaterThan(0);
    expect(t.from).not.toBe(t.to);
    left.set(t.from, (left.get(t.from) ?? 0) + t.amount);
    left.set(t.to, (left.get(t.to) ?? 0) - t.amount);
  }
  for (const v of left.values()) expect(v === 0).toBe(true);
}

/** Brute-force minimum transfer count, for checking the DP on small inputs. */
function bruteMin(values: number[]): number {
  const nz = values.filter((v) => v !== 0);
  if (nz.length === 0) return 0;
  let best = Infinity;
  const go = (vals: number[], count: number) => {
    const i = vals.findIndex((v) => v !== 0);
    if (i === -1) return void (best = Math.min(best, count));
    if (count >= best) return;
    for (let j = i + 1; j < vals.length; j++) {
      if (vals[j] !== 0 && Math.sign(vals[j]) !== Math.sign(vals[i])) {
        const next = [...vals];
        next[j] += next[i];
        next[i] = 0;
        go(next, count + 1);
      }
    }
  };
  go(nz, 0);
  return best;
}

describe("balances", () => {
  it("credits the payer and debits each share", () => {
    const b = balances(
      ["a", "b", "c"],
      [{ amount: 30_000, paid_by: "a", split_mode: "equal", split: { a: 1, b: 1, c: 1 } }],
      [],
    );
    expect(Object.fromEntries(b)).toEqual({ a: 20_000, b: -10_000, c: -10_000 });
  });

  it("skips deleted expenses and unconfirmed payments", () => {
    const b = balances(
      ["a", "b"],
      [
        { amount: 1000, paid_by: "a", split_mode: "equal", split: { a: 1, b: 1 } },
        { amount: 9999, paid_by: "b", split_mode: "equal", split: { a: 1, b: 1 }, deleted: true },
      ],
      [
        { from_member: "b", to_member: "a", amount: 500, status: "claimed" },
        { from_member: "b", to_member: "a", amount: 500, status: "rejected" },
      ],
    );
    expect(Object.fromEntries(b)).toEqual({ a: 500, b: -500 });
  });

  it("confirmed payments close the debt", () => {
    const b = balances(
      ["a", "b"],
      [{ amount: 1000, paid_by: "a", split_mode: "equal", split: { a: 1, b: 1 } }],
      [{ from_member: "b", to_member: "a", amount: 500, status: "confirmed" }],
    );
    expect(Object.fromEntries(b)).toEqual({ a: 0, b: 0 });
  });

  it("always sums to zero", () => {
    const b = balances(
      ["a", "b", "c", "d"],
      [
        { amount: 10_001, paid_by: "a", split_mode: "equal", split: { a: 1, b: 1, c: 1 } },
        { amount: 777, paid_by: "d", split_mode: "weights", split: { a: 1.5, d: 2, c: 1 } },
        { amount: 500, paid_by: "c", split_mode: "exact", split: { b: 100, d: 400 } },
      ],
      [],
    );
    expect([...b.values()].reduce((s, v) => s + v, 0)).toBe(0);
  });
});

describe("settle", () => {
  it("returns nothing when everyone is square", () => {
    expect(settle(net({ a: 0, b: 0 }))).toEqual([]);
    expect(settle(new Map())).toEqual([]);
  });

  it("settles one debt with one transfer", () => {
    expect(settle(net({ a: 500, b: -500 }))).toEqual([{ from: "b", to: "a", amount: 500 }]);
  });

  it("finds pairs that cancel out, which greedy misses", () => {
    // Greedy pairs the biggest amounts first and needs 4 transfers here; the
    // two groups {a, d} and {b, c, e} need only 1 + 2 = 3.
    const b = net({ a: 600, b: 500, c: 400, d: -600, e: -900 });
    const t = settle(b);
    settlesExactly(b, t);
    expect(t).toHaveLength(3);
    expect(settleGreedy(b).length).toBeGreaterThanOrEqual(t.length);
  });

  it("splits into many independent pairs", () => {
    const b = net({ a: 10, b: -10, c: 20, d: -20, e: 30, f: -30 });
    const t = settle(b);
    settlesExactly(b, t);
    expect(t).toHaveLength(3);
  });

  it("matches brute force on random small groups", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let round = 0; round < 300; round++) {
      const n = 2 + Math.floor(rand() * 6);
      const vals = Array.from({ length: n - 1 }, () => Math.floor(rand() * 9 - 4) * 100);
      vals.push(-vals.reduce((s, v) => s + v, 0));
      const b = new Map(vals.map((v, i) => [`m${i}`, v]));
      const t = settle(b);
      settlesExactly(b, t);
      expect(t.length).toBe(bruteMin(vals));
    }
  });

  it("is deterministic", () => {
    const b = net({ c: 300, a: -100, b: -200 });
    expect(settle(b)).toEqual(settle(net({ b: -200, c: 300, a: -100 })));
  });

  it("falls back to greedy above the exact limit and still settles", () => {
    const o: Record<string, number> = {};
    for (let i = 0; i < 20; i++) o[`p${String(i).padStart(2, "0")}`] = i < 10 ? 100 * (i + 1) : -100 * (i - 9);
    const b = net(o);
    const t = settle(b);
    settlesExactly(b, t);
    expect(t.length).toBeLessThanOrEqual(19);
  });

  it("refuses balances that do not add up", () => {
    expect(() => settle(net({ a: 100, b: -99 }))).toThrow();
  });

  it("handles 16 people quickly", () => {
    const o: Record<string, number> = {};
    for (let i = 0; i < 15; i++) o[`p${String(i).padStart(2, "0")}`] = (i % 2 ? 1 : -1) * (i * 37 + 11);
    o.p15 = -Object.values(o).reduce((s, v) => s + v, 0);
    const start = performance.now();
    settlesExactly(net(o), settle(net(o)));
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
