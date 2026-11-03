import { shares, type ExpenseLike } from "./split";

export interface PaymentLike {
  from_member: string;
  to_member: string;
  amount: number;
  status: "claimed" | "confirmed" | "rejected" | "cancelled";
}

export interface Transfer {
  from: string;
  to: string;
  amount: number; // satang
}

/**
 * Net position of each member in satang: positive means the group owes them,
 * negative means they owe the group. Only confirmed payments count; a payment
 * that is still waiting for the receiver to confirm leaves the debt open.
 */
export function balances(
  memberIds: Iterable<string>,
  expenses: (ExpenseLike & { deleted?: boolean })[],
  payments: PaymentLike[],
): Map<string, number> {
  const net = new Map<string, number>();
  for (const id of memberIds) net.set(id, 0);
  const add = (id: string, v: number) => net.set(id, (net.get(id) ?? 0) + v);

  for (const e of expenses) {
    if (e.deleted) continue;
    add(e.paid_by, e.amount);
    for (const [id, owed] of shares(e)) add(id, -owed);
  }
  for (const p of payments) {
    if (p.status !== "confirmed") continue;
    add(p.from_member, p.amount);
    add(p.to_member, -p.amount);
  }
  return net;
}

/** Above this many people with a non-zero balance, fall back to the greedy plan. */
export const EXACT_LIMIT = 16;

/**
 * The smallest set of transfers that settles every balance.
 *
 * Finding the true minimum is NP-hard in general, but trip groups are small.
 * With n people who are owed or owe money, the minimum number of transfers is
 * n - k, where k is the largest number of disjoint groups whose balances each
 * add up to zero (each such group of size s settles internally with s - 1
 * transfers). k is found with a DP over subsets, O(2^n * n), which is instant
 * for n <= 16. Larger groups use the greedy plan, which needs at most n - 1.
 *
 * Output is deterministic for the same balances, so every phone shows the
 * same plan.
 */
export function settle(net: Map<string, number>): Transfer[] {
  const people = [...net.entries()]
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const total = people.reduce((s, [, v]) => s + v, 0);
  if (total !== 0) throw new Error(`balances do not add up to zero (${total})`);
  if (people.length === 0) return [];
  if (people.length > EXACT_LIMIT) return greedy(people);

  const n = people.length;
  const full = (1 << n) - 1;
  const sum = new Int32Array(1 << n);
  const best = new Int8Array(1 << n); // most zero-sum groups this subset splits into
  for (let mask = 1; mask <= full; mask++) {
    const low = 31 - Math.clz32(mask & -mask);
    sum[mask] = sum[mask & (mask - 1)] + people[low][1];
    let b = 0;
    for (let m = mask; m; m &= m - 1) {
      const i = 31 - Math.clz32(m & -m);
      const v = best[mask ^ (1 << i)];
      if (v > b) b = v;
    }
    best[mask] = b + (sum[mask] === 0 ? 1 : 0);
  }

  // Walk back from the full set removing one person at a time along an
  // optimal path. Every time the remaining set sums to zero, the people
  // removed since the previous such point form one self-contained group.
  const groups: [string, number][][] = [];
  let current: [string, number][] = [];
  let mask = full;
  while (mask) {
    const target = best[mask] - (sum[mask] === 0 ? 1 : 0);
    let pick = -1;
    for (let m = mask; m; m &= m - 1) {
      const i = 31 - Math.clz32(m & -m);
      if (best[mask ^ (1 << i)] === target) {
        pick = i;
        break;
      }
    }
    current.push(people[pick]);
    mask ^= 1 << pick;
    if (sum[mask] === 0) {
      groups.push(current);
      current = [];
    }
  }

  return groups.flatMap(greedy);
}

/** Largest debtor pays largest creditor until everyone is square. */
function greedy(people: [string, number][]): Transfer[] {
  const creditors = people.filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = people.filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const byAmount = (a: { id: string; v: number }, b: { id: string; v: number }) =>
    b.v - a.v || (a.id < b.id ? -1 : 1);
  const out: Transfer[] = [];
  creditors.sort(byAmount);
  debtors.sort(byAmount);
  while (creditors.length && debtors.length) {
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount });
    c.v -= amount;
    d.v -= amount;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
    creditors.sort(byAmount);
    debtors.sort(byAmount);
  }
  return out;
}

/** Greedy plan, exported for comparison in tests and the README benchmark. */
export function settleGreedy(net: Map<string, number>): Transfer[] {
  return greedy([...net.entries()].filter(([, v]) => v !== 0).sort(([a], [b]) => (a < b ? -1 : 1)));
}
