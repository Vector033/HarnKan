import { formatBaht } from "@/lib/core/money";
import { balances, settle, type Transfer } from "@/lib/core/settle";
import { shares } from "@/lib/core/split";
import type { TripView } from "./outbox";
import type { Payment } from "./types";

export interface PlannedTransfer extends Transfer {
  /** Claims from `from` to `to` waiting for the receiver to confirm. */
  claims: Payment[];
  claimedAmount: number;
}

export interface DebtPair extends Transfer {
  /** Number of expense shares between `from` and `to` before debt minimization. */
  count: number;
}

export interface Settlement {
  net: Map<string, number>;
  /** What each member's share of all expenses came to (their "cost" of the trip). */
  spentBy: Map<string, number>;
  total: number;
  transfers: PlannedTransfer[];
  /** Individual expense-level debt pairs count before debt minimization. */
  rawDebtCount: number;
  /** Directed pairs from expenses before netting/minimization. */
  rawPairs: DebtPair[];
  /** Minimized transfer plan from expenses alone (before confirmed payments). */
  minTransfers: Transfer[];
  awaitingMe: Payment[];
  /** Money confirmed as received so far, and what that plus every planned transfer adds up to. */
  settled: number;
  toSettle: number;
}

export function settlement(view: TripView, meId: string | null): Settlement {
  const memberIds = view.members.map((m) => m.id);
  const expenses = view.expenses.filter((e) => !e.deleted);
  const net = balances(memberIds, expenses, view.payments);
  const spentBy = new Map<string, number>();
  let rawDebtCount = 0;
  const pairMap = new Map<string, DebtPair>();
  for (const e of expenses) {
    for (const [id, v] of shares(e)) {
      spentBy.set(id, (spentBy.get(id) ?? 0) + v);
      if (id === e.paid_by || v <= 0) continue;
      rawDebtCount++;
      const key = `${id}\0${e.paid_by}`;
      const prev = pairMap.get(key);
      if (prev) {
        prev.amount += v;
        prev.count += 1;
      } else {
        pairMap.set(key, { from: id, to: e.paid_by, amount: v, count: 1 });
      }
    }
  }
  const rawPairs = [...pairMap.values()].sort(
    (a, b) => b.amount - a.amount || (a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : 1),
  );
  const minTransfers = settle(balances(memberIds, expenses, []));

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
    rawDebtCount,
    rawPairs,
    minTransfers,
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

/** The settlement as a message for the group chat: who still pays whom, and a link back to the trip. */
export function settlementText(tripName: string, transfers: PlannedTransfer[], name: (id: string) => string, url: string) {
  const lines = transfers.map((t) => {
    const left = t.amount - t.claimedAmount;
    return left > 0
      ? `• ${name(t.from)} โอนให้ ${name(t.to)} ${formatBaht(left)} บาท`
      : `• ${name(t.from)} โอนให้ ${name(t.to)} ${formatBaht(t.amount)} บาท (แจ้งโอนแล้ว รอ ${name(t.to)} ยืนยัน)`;
  });
  return [
    `หารกัน · ${tripName}`,
    ...(lines.length ? ["ใครโอนให้ใคร", ...lines] : ["ทุกคนโอนกันครบแล้ว"]),
    `ดูรายละเอียดและ QR พร้อมเพย์: ${url}`,
  ].join("\n");
}
