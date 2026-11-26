import { describe, expect, it } from "vitest";
import { progress, settlement, settlementText, type PlannedTransfer } from "./derive";
import type { TripView } from "./outbox";
import type { Expense, Member, Payment } from "./types";

const pay = (amount: number, status: Payment["status"]) => ({ amount, status }) as Payment;

describe("settlement before/after minimization", () => {
  const member = (id: string) => ({ id, trip_id: "t1", user_id: null, pending_user_id: null, nickname: id, promptpay_id: null, payee_name: null, created_at: "" }) as Member;
  const exp = (id: string, paid_by: string, amount: number, split: Record<string, number>) =>
    ({ id, trip_id: "t1", title: id, amount, paid_by, split_mode: "equal", split, spent_at: "", deleted: false, version: 1, created_by: null, updated_by: null, created_at: "", updated_at: "" }) as Expense;

  it("computes raw expense debt pairs vs minimized transfers", () => {
    const view: TripView = {
      trip: { id: "t1", name: "ทริป", invite_code: "abc", created_by: "u1", created_at: "", locked: false, invite_expires_at: "" },
      members: [member("a"), member("b"), member("c")],
      expenses: [
        exp("e1", "a", 30_000, { a: 1, b: 1, c: 1 }), // b->a 10000, c->a 10000
        exp("e2", "b", 30_000, { a: 1, b: 1, c: 1 }), // a->b 10000, c->b 10000
      ],
      payments: [],
    };
    const r = settlement(view, "a");
    expect(r.rawDebtCount).toBe(4);
    expect(r.rawPairs).toHaveLength(4);
    expect(r.minTransfers).toHaveLength(2);
    expect(r.transfers).toHaveLength(2);
  });

  it("groups repeated pairs from multiple expenses into rawPairs with count", () => {
    const view: TripView = {
      trip: { id: "t1", name: "ทริป", invite_code: "abc", created_by: "u1", created_at: "", locked: false, invite_expires_at: "" },
      members: [member("a"), member("b")],
      expenses: [
        exp("e1", "a", 20_000, { a: 1, b: 1 }),
        exp("e2", "a", 40_000, { a: 1, b: 1 }),
      ],
      payments: [{ id: "p1", trip_id: "t1", from_member: "b", to_member: "a", amount: 30_000, status: "confirmed", source: "manual", slip: null, created_by: null, decided_by: null, created_at: "", decided_at: null }],
    };
    const r = settlement(view, "a");
    expect(r.rawDebtCount).toBe(2);
    expect(r.rawPairs).toEqual([{ from: "b", to: "a", amount: 30_000, count: 2 }]);
    expect(r.minTransfers).toEqual([{ from: "b", to: "a", amount: 30_000 }]);
    expect(r.transfers).toEqual([]);
  });
});

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

describe("settlementText", () => {
  const names: Record<string, string> = { a: "มิ้นต์", b: "ต้น", c: "แบม" };
  const t = (from: string, to: string, amount: number, claimedAmount = 0) => ({ from, to, amount, claims: [], claimedAmount }) as PlannedTransfer;
  it("lists what is left to pay, and marks claims waiting for the receiver", () => {
    const text = settlementText("เชียงดาว", [t("b", "a", 22000), t("c", "a", 123456, 50000), t("c", "b", 4500, 4500)], (id) => names[id], "https://x/t/1");
    expect(text.split("\n")).toEqual([
      "หารกัน · เชียงดาว",
      "ใครโอนให้ใคร",
      "• ต้น โอนให้ มิ้นต์ 220 บาท",
      "• แบม โอนให้ มิ้นต์ 734.56 บาท",
      "• แบม โอนให้ ต้น 45 บาท (แจ้งโอนแล้ว รอ ต้น ยืนยัน)",
      "ดูรายละเอียดและ QR พร้อมเพย์: https://x/t/1",
    ]);
  });
  it("says so when nobody owes anything", () => {
    expect(settlementText("ทริป", [], () => "", "u")).toContain("ทุกคนโอนกันครบแล้ว");
  });
});
