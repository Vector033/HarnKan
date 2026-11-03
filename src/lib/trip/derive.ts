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
  };
}
