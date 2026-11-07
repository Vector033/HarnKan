// Turns one expense into what each member owes for it.

export type SplitMode = "equal" | "weights" | "exact";

/** member id -> 1/0 (equal), a weight (weights) or satang (exact). */
export type Split = Record<string, number>;

export interface ExpenseLike {
  amount: number; // satang
  paid_by: string;
  split_mode: SplitMode;
  split: Split;
}

export type SplitProblem =
  | { kind: "empty" }
  | { kind: "negative"; memberId: string }
  | { kind: "not_whole"; memberId: string }
  | { kind: "unknown_member"; memberId: string }
  | { kind: "weight_range"; memberId: string }
  | { kind: "exact_mismatch"; total: number; amount: number };

/** Client-side twin of the validate_split SQL function. */
export function validateSplit(e: ExpenseLike, memberIds?: Iterable<string>): SplitProblem | null {
  const known = memberIds ? new Set(memberIds) : null;
  let total = 0;
  let positive = 0;
  for (const [id, v] of Object.entries(e.split)) {
    if (known && !known.has(id)) return { kind: "unknown_member", memberId: id };
    if (!Number.isFinite(v) || v < 0) return { kind: "negative", memberId: id };
    if ((e.split_mode === "exact" || e.split_mode === "equal") && !Number.isInteger(v))
      return { kind: "not_whole", memberId: id };
    if (e.split_mode === "equal" && v > 1) return { kind: "not_whole", memberId: id };
    // Same bounds as the server: no Infinity, no runaway decimals.
    if (e.split_mode === "weights" && (v > 1000 || Math.round(v * 1000) / 1000 !== v)) return { kind: "weight_range", memberId: id };
    total += v;
    if (v > 0) positive++;
  }
  if (positive === 0) return { kind: "empty" };
  if (e.split_mode === "exact" && total !== e.amount) return { kind: "exact_mismatch", total, amount: e.amount };
  return null;
}

/**
 * Satang each participant owes for this expense. The result always sums to
 * exactly `amount`.
 *
 * Equal and weighted splits use the largest remainder method: everyone gets
 * the floor of their exact share, and the satang left over go one each to the
 * largest fractional parts. Ties go to the payer first (so the person who is
 * owed money absorbs the odd satang), then by member id. Ordering by id rather
 * than by insertion order matters because Postgres jsonb does not keep key
 * order, and every client has to produce the same numbers.
 */
export function shares(e: ExpenseLike): Map<string, number> {
  const out = new Map<string, number>();
  if (e.split_mode === "exact") {
    for (const [id, v] of Object.entries(e.split)) if (v > 0) out.set(id, v);
    return out;
  }

  const entries = Object.entries(e.split)
    .filter(([, w]) => w > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const totalWeight = entries.reduce((s, [, w]) => s + w, 0);
  if (totalWeight === 0) return out;

  // Weights may be fractional (1.5 shares); scale to integers so the exact
  // share amount * w / total can be computed without float error.
  const scale = 10 ** Math.max(0, ...entries.map(([, w]) => decimals(w)));
  const scaled = entries.map(([id, w]) => [id, Math.round(w * scale)] as const);
  const scaledTotal = scaled.reduce((s, [, w]) => s + w, 0);

  let assigned = 0;
  const rows = scaled.map(([id, w]) => {
    const num = e.amount * w; // safe: amount <= 1e8 satang, weights are small
    const base = Math.floor(num / scaledTotal);
    assigned += base;
    return { id, base, rem: num % scaledTotal };
  });

  let left = e.amount - assigned;
  const order = [...rows].sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    if ((a.id === e.paid_by) !== (b.id === e.paid_by)) return a.id === e.paid_by ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  for (const row of order) {
    if (left === 0) break;
    row.base++;
    left--;
  }
  for (const row of rows) out.set(row.id, row.base);
  return out;
}

function decimals(n: number): number {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 ? 0 : Math.min(6, s.length - i - 1);
}
