// Pure logic for the offline queue: how queued changes show up before they
// sync, how a new change folds into ones not yet sent, and how a conflict
// reply is judged. The IO around it lives in store.ts.

import type { Conflict, Expense, ExpenseDraft, Member, Op, Payment, QueuedOp, Snapshot } from "./types";

export type Pending<T> = T & { pending?: boolean };

export interface TripView {
  trip: Snapshot["trip"];
  members: Pending<Member>[];
  expenses: Pending<Expense>[];
  payments: Pending<Payment>[];
}

/** The server snapshot with every queued change applied on top, in order. */
export function overlay(snap: Snapshot, queue: QueuedOp[]): TripView {
  const members = new Map<string, Pending<Member>>(snap.members.map((m) => [m.id, m]));
  const expenses = new Map<string, Pending<Expense>>(snap.expenses.map((e) => [e.id, e]));
  const payments = new Map<string, Pending<Payment>>(snap.payments.map((p) => [p.id, p]));
  const now = new Date().toISOString();

  for (const { op } of queue) {
    switch (op.kind) {
      case "save_expense": {
        const prev = expenses.get(op.expense.id);
        expenses.set(op.expense.id, {
          deleted: false,
          version: 0,
          created_by: snap.userId,
          created_at: now,
          ...prev,
          ...op.expense,
          updated_by: snap.userId,
          updated_at: now,
          pending: true,
        });
        break;
      }
      case "delete_expense": {
        const prev = expenses.get(op.id);
        if (prev) expenses.set(op.id, { ...prev, deleted: true, pending: true });
        break;
      }
      case "record_payment": {
        const toMember = members.get(op.payment.to_member);
        payments.set(op.payment.id, {
          slip: null,
          ...op.payment,
          status: toMember?.user_id === snap.userId ? "confirmed" : "claimed",
          created_by: snap.userId,
          decided_by: null,
          created_at: now,
          decided_at: null,
          pending: true,
        } as Pending<Payment>);
        break;
      }
      case "decide_payment": {
        const prev = payments.get(op.id);
        if (prev) payments.set(op.id, { ...prev, status: op.decision, pending: true });
        break;
      }
      case "add_member":
        members.set(op.member.id, {
          user_id: null,
          promptpay_id: null,
          payee_name: null,
          created_at: now,
          ...op.member,
          pending: true,
        });
        break;
      case "update_member": {
        const prev = members.get(op.id);
        if (prev) members.set(op.id, { ...prev, ...op.patch, pending: true });
        break;
      }
    }
  }
  return {
    trip: snap.trip,
    members: [...members.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    expenses: [...expenses.values()].sort((a, b) => b.spent_at.localeCompare(a.spent_at)),
    payments: [...payments.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

/**
 * Adds an op to the queue, merging it into an earlier op for the same expense
 * when that one has not been sent yet. `inflight` is the seq currently being
 * sent; it must not be changed under the request.
 */
export function enqueue(queue: QueuedOp[], item: QueuedOp, inflight: number | null): QueuedOp[] {
  const { op } = item;
  const sameExpense = (q: QueuedOp) =>
    q.seq !== inflight &&
    q.op.kind === "save_expense" &&
    q.op.expense.id === (op.kind === "save_expense" ? op.expense.id : op.kind === "delete_expense" ? op.id : null);

  if (op.kind === "save_expense") {
    const i = queue.findIndex(sameExpense);
    if (i !== -1) {
      const prev = queue[i].op as Extract<Op, { kind: "save_expense" }>;
      const merged = { ...queue[i], op: { ...prev, expense: op.expense } };
      return queue.map((q, j) => (j === i ? merged : q));
    }
  }
  if (op.kind === "delete_expense") {
    const i = queue.findIndex(sameExpense);
    if (i !== -1) {
      const prev = queue[i].op as Extract<Op, { kind: "save_expense" }>;
      // Never reached the server: dropping the create is the whole delete.
      if (prev.baseVersion === null) return queue.filter((_, j) => j !== i);
      return queue.map((q, j) => (j === i ? { ...q, op: { kind: "delete_expense", id: op.id, baseVersion: prev.baseVersion! } } : q));
    }
  }
  return [...queue, item];
}

/** Whether two versions of an expense say the same thing. */
export function sameContent(a: ExpenseDraft, b: ExpenseDraft): boolean {
  if (a.title.trim() !== b.title.trim() || a.amount !== b.amount || a.paid_by !== b.paid_by) return false;
  if (a.split_mode !== b.split_mode) return false;
  const ka = Object.keys(a.split).filter((k) => a.split[k] !== 0);
  const kb = Object.keys(b.split).filter((k) => b.split[k] !== 0);
  return ka.length === kb.length && ka.every((k) => a.split[k] === b.split[k]);
}

/**
 * Turns a 'conflict' reply into a Conflict for the user to resolve, or null
 * when the server already holds what this device wanted (for example a
 * replayed edit whose first reply was lost when the connection dropped).
 */
export function judgeConflict(op: Op, theirs: Expense): Conflict | null {
  if (op.kind === "delete_expense") return theirs.deleted ? null : { id: op.id, mine: "deleted", theirs };
  if (op.kind !== "save_expense") return null;
  if (!theirs.deleted && sameContent(op.expense, theirs)) return null;
  return { id: op.expense.id, mine: op.expense, theirs };
}
