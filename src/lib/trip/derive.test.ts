import { describe, expect, it } from "vitest";
import { progress } from "./derive";
import type { Payment } from "./types";

const pay = (amount: number, status: Payment["status"]) => ({ amount, status }) as Payment;

describe("progress", () => {
  it("is empty with nothing to settle", () => {
    expect(progress([], [])).toEqual({ settled: 0, toSettle: 0 });
  });
  it("counts only confirmed payments as settled", () => {
    const r = progress([pay(1000, "confirmed"), pay(500, "claimed"), pay(300, "rejected"), pay(200, "cancelled")], [{ amount: 2000 }]);
    expect(r).toEqual({ settled: 1000, toSettle: 3000 });
  });
  it("is complete when no transfers remain", () => {
    expect(progress([pay(2500, "confirmed")], [])).toEqual({ settled: 2500, toSettle: 2500 });
  });
});
