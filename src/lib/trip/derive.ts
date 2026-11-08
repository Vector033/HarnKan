import { balances, settle, type Transfer } from "@/lib/core/settle";
import { shares } from "@/lib/core/split";
import type { TripView } from "./outbox";
import type { Payment } from "./types";

export interface PlannedTransfer extends Transfer {
  /** Claims from `from` to `to` waiting for the receiver to confirm. */
  claims: Payment[];
  claimedAmount: number;
}

export interface Settlement {
  net: Map<string, number>;
  /** What each member's share of all expenses came to (their "cost" of the trip). */
  spentBy: Map<string, number>;
  total: number;
  transfers: PlannedTransfer[];
  awaitingMe: Payment[];
  /** Money confirmed as received so far, and what that plus every planned transfer adds up to. */
  settled: number;
  toSettle: number;
}

export function settlement(view: TripView, meId: string | null): Settlement {
  const expenses = view.expenses.filter((e) => !e.deleted);
  const net = balances(
    view.members.map((m) => m.id),
    expenses,
    view.payments,
  );
  const spentBy = new Map<string, number>();
  for (const e of expenses) for (const [id, v] of shares(e)) spentBy.set(id, (spentBy.get(id) ?? 0) + v);

  const claims = view.payments.filter((p) => p.status === "claimed");
  const transfers = settle(net).map((t) => {
    const mine = claims.filter((p) => p.from_member === t.from && p.to_member === t.to);
    return { ...t, claims: mine, claimedAmount: mine.reduce((s, p) => s + p.amount, 0) };
  });

  return {
    net,
    spentBy,
    total: expenses.reduce((s, e) => s + e.amount, 0),
    transfers,
    awaitingMe: meId ? claims.filter((p) => p.to_member === meId) : [],
    ...progress(view.payments, transfers),
  };
}

/**
 * How far the trip is from settled: confirmed payments against confirmed plus
 * still planned. Claimed but unconfirmed money still counts as outstanding.
 */
export function progress(payments: Payment[], transfers: { amount: number }[]) {
  const settled = payments.filter((p) => p.status === "confirmed").reduce((s, p) => s + p.amount, 0);
  const outstanding = transfers.reduce((s, t) => s + t.amount, 0);
  return { settled, toSettle: settled + outstanding };
}
