import { describe, expect, it } from "vitest";
import { enqueue, judgeConflict, overlay, sameContent } from "./outbox";
import type { Expense, ExpenseDraft, Op, QueuedOp, Snapshot } from "./types";

const draft = (o: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  id: "e1",
  trip_id: "t",
  title: "ข้าว",
  amount: 1000,
  paid_by: "a",
  split_mode: "equal",
  split: { a: 1, b: 1 },
  spent_at: "2026-11-04T10:00:00Z",
  ...o,
});
const row = (o: Partial<Expense> = {}): Expense => ({
  ...draft(),
  deleted: false,
  version: 1,
  created_by: "u1",
  updated_by: "u1",
  created_at: "2026-11-04T10:00:00Z",
  updated_at: "2026-11-04T10:00:00Z",
  ...o,
});
let seq = 0;
const q = (op: Op): QueuedOp => ({ seq: ++seq, tripId: "t", op, queuedAt: "" });

const snap: Snapshot = {
  trip: { id: "t", name: "ทริป", invite_code: "x", created_by: "u1", created_at: "" },
  members: [
    { id: "a", trip_id: "t", user_id: "u1", nickname: "เอ", promptpay_id: null, payee_name: null, created_at: "1" },
    { id: "b", trip_id: "t", user_id: "u2", nickname: "บี", promptpay_id: null, payee_name: null, created_at: "2" },
  ],
  expenses: [row()],
  payments: [],
  userId: "u1",
  savedAt: "",
};

describe("overlay", () => {
  it("shows queued creates, edits and deletes as pending", () => {
    const v = overlay(snap, [
      q({ kind: "save_expense", expense: draft({ id: "e2", title: "น้ำ" }), baseVersion: null }),
      q({ kind: "save_expense", expense: draft({ title: "ข้าวมันไก่" }), baseVersion: 1 }),
    ]);
    expect(v.expenses.find((e) => e.id === "e2")).toMatchObject({ title: "น้ำ", pending: true, version: 0 });
    expect(v.expenses.find((e) => e.id === "e1")).toMatchObject({ title: "ข้าวมันไก่", pending: true, version: 1 });

    const d = overlay(snap, [q({ kind: "delete_expense", id: "e1", baseVersion: 1 })]);
    expect(d.expenses[0]).toMatchObject({ deleted: true, pending: true });
  });

  it("predicts payment status from who records it", () => {
    const pay = (from: string, to: string) =>
      q({ kind: "record_payment", payment: { id: `${from}${to}`, trip_id: "t", from_member: from, to_member: to, amount: 5, source: "manual" } });
    const v = overlay(snap, [pay("b", "a"), pay("a", "b")]);
    expect(v.payments.find((p) => p.id === "ba")?.status).toBe("confirmed"); // I am the receiver
    expect(v.payments.find((p) => p.id === "ab")?.status).toBe("claimed");
  });
});

describe("enqueue", () => {
  it("folds a later edit into an unsent one, keeping its base version", () => {
    const first = q({ kind: "save_expense", expense: draft({ title: "1" }), baseVersion: 1 });
    const out = enqueue([first], q({ kind: "save_expense", expense: draft({ title: "2" }), baseVersion: 1 }), null);
    expect(out).toHaveLength(1);
    expect(out[0].op).toMatchObject({ baseVersion: 1, expense: { title: "2" } });
  });

  it("does not touch the op that is being sent", () => {
    const first = q({ kind: "save_expense", expense: draft({ title: "1" }), baseVersion: 1 });
    const out = enqueue([first], q({ kind: "save_expense", expense: draft({ title: "2" }), baseVersion: 2 }), first.seq);
    expect(out).toHaveLength(2);
  });

  it("deleting an unsent create removes both", () => {
    const create = q({ kind: "save_expense", expense: draft({ id: "new" }), baseVersion: null });
    expect(enqueue([create], q({ kind: "delete_expense", id: "new", baseVersion: 0 }), null)).toEqual([]);
  });

  it("deleting after an unsent edit turns it into a delete from the same base", () => {
    const edit = q({ kind: "save_expense", expense: draft(), baseVersion: 3 });
    const out = enqueue([edit], q({ kind: "delete_expense", id: "e1", baseVersion: 3 }), null);
    expect(out).toHaveLength(1);
    expect(out[0].op).toEqual({ kind: "delete_expense", id: "e1", baseVersion: 3 });
  });
});

describe("conflicts", () => {
  it("ignores a conflict when the server already has my change", () => {
    const op: Op = { kind: "save_expense", expense: draft({ title: "x" }), baseVersion: 1 };
    expect(judgeConflict(op, row({ title: "x", version: 2 }))).toBeNull();
  });

  it("reports a real conflict with both sides", () => {
    const op: Op = { kind: "save_expense", expense: draft({ amount: 2000 }), baseVersion: 1 };
    const c = judgeConflict(op, row({ amount: 1500, version: 2 }));
    expect(c?.mine).toMatchObject({ amount: 2000 });
    expect(c?.theirs.amount).toBe(1500);
  });

  it("reports editing something someone else deleted", () => {
    const op: Op = { kind: "save_expense", expense: draft(), baseVersion: 1 };
    expect(judgeConflict(op, row({ deleted: true, version: 2 }))).not.toBeNull();
  });

  it("treats a split with zero entries the same as one without them", () => {
    expect(sameContent(draft({ split: { a: 1, b: 1, c: 0 } }), draft())).toBe(true);
    expect(sameContent(draft({ split: { a: 1 } }), draft())).toBe(false);
  });
});
