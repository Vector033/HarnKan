"use client";

import { useMemo, useState } from "react";
import { formatBaht, parseBaht } from "@/lib/core/money";
import { shares, validateSplit, type Split, type SplitMode } from "@/lib/core/split";
import type { TripState, TripStore } from "@/lib/trip/store";
import type { Expense, ExpenseDraft } from "@/lib/trip/types";
import { Baht, Sheet } from "../ui";

/**
 * Add or edit one expense. Edits remember the version they started from, so
 * if a friend saves the same expense first the server reports a conflict
 * instead of one change silently replacing the other.
 */
export function ExpenseSheet({
  initial,
  state,
  store,
  onClose,
}: {
  initial: Expense | null;
  state: TripState;
  store: TripStore;
  onClose: () => void;
}) {
  const view = state.view!;
  const members = view.members;
  const [base] = useState(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [amountText, setAmountText] = useState(initial ? formatBaht(initial.amount).replace(/,/g, "") : "");
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? state.me?.id ?? members[0]?.id);
  const [mode, setMode] = useState<SplitMode>(initial?.split_mode ?? "equal");
  const [equal, setEqual] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(members.map((m) => [m.id, initial ? initial.split_mode !== "equal" || (initial.split[m.id] ?? 0) > 0 : true])),
  );
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.id, initial?.split_mode === "weights" ? String(initial.split[m.id] ?? 0) : "1"])),
  );
  const [exact, setExact] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      members.map((m) => [m.id, initial?.split_mode === "exact" && initial.split[m.id] ? formatBaht(initial.split[m.id]).replace(/,/g, "") : ""]),
    ),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const amount = parseBaht(amountText);
  const split: Split = useMemo(() => {
    if (mode === "equal") return Object.fromEntries(members.map((m) => [m.id, equal[m.id] ? 1 : 0]));
    if (mode === "weights") return Object.fromEntries(members.map((m) => [m.id, Math.max(0, Number(weights[m.id]) || 0)]));
    return Object.fromEntries(members.map((m) => [m.id, parseBaht(exact[m.id] || "0") ?? 0]));
  }, [mode, members, equal, weights, exact]);

  const draft: ExpenseDraft | null =
    amount && paidBy
      ? {
          id: base?.id ?? crypto.randomUUID(),
          trip_id: view.trip.id,
          title: title.trim(),
          amount,
          paid_by: paidBy,
          split_mode: mode,
          split,
          spent_at: base?.spent_at ?? new Date().toISOString(),
        }
      : null;
  const problem = draft ? validateSplit(draft) : null;
  const preview = draft && !problem ? shares(draft) : null;
  const exactTotal = mode === "exact" ? Object.values(split).reduce((s, v) => s + v, 0) : 0;

  // Someone else changed this expense while the sheet was open.
  const live = base ? view.expenses.find((e) => e.id === base.id) : null;
  const changedUnderneath = !!(base && live && !live.pending && live.version > base.version);
  const deletedUnderneath = !!(base && live?.deleted && !live.pending);

  async function save() {
    if (!draft || problem || !draft.title) return;
    await store.do({ kind: "save_expense", expense: draft, baseVersion: base ? Math.max(1, base.version) : null });
    onClose();
  }

  async function remove() {
    if (!base) return;
    await store.do({ kind: "delete_expense", id: base.id, baseVersion: Math.max(1, base.version) });
    onClose();
  }

  const names = new Map(members.map((m) => [m.id, m.nickname]));

  return (
    <Sheet
      open
      onClose={onClose}
      title={base ? "แก้รายจ่าย" : "เพิ่มรายจ่าย"}
      footer={
        <div className="flex gap-2">
          {base &&
            (confirmDelete ? (
              <button className="btn border-owe text-owe" onClick={remove}>
                ยืนยันลบ
              </button>
            ) : (
              <button className="btn" onClick={() => setConfirmDelete(true)}>
                ลบ
              </button>
            ))}
          <button
            className="btn-primary flex-1"
            onClick={save}
            disabled={!draft || !!problem || !title.trim() || deletedUnderneath}
            data-testid="save-expense"
          >
            บันทึก
          </button>
        </div>
      }
    >
      {(changedUnderneath || deletedUnderneath) && (
        <div className="mb-4 rounded-xl bg-wait-soft px-3.5 py-3 text-sm text-wait" role="alert" data-testid="changed-underneath">
          {deletedUnderneath ? (
            <>มีคนลบรายการนี้ไปแล้วระหว่างที่คุณแก้</>
          ) : (
            <>
              {names.get(members.find((m) => m.user_id === live!.updated_by)?.id ?? "") ?? "เพื่อน"} เพิ่งแก้รายการนี้
              ({live!.title}, {formatBaht(live!.amount)} ฿). ถ้าบันทึก แอปจะให้เลือกว่าจะเก็บของใคร
            </>
          )}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="title">
            รายการ
          </label>
          <input
            id="title"
            className="input"
            maxLength={80}
            placeholder="เช่น ค่าที่พัก, หมูกระทะ"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus={!base}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="amount">
              จำนวนเงิน (บาท)
            </label>
            <input
              id="amount"
              className="input num"
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="paid-by">
              ใครจ่าย
            </label>
            <select id="paid-by" className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nickname}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="label">หารยังไง</span>
          <div className="grid grid-cols-3 rounded-xl bg-stone-100 p-1 text-sm" role="radiogroup">
            {(
              [
                ["equal", "เท่ากัน"],
                ["weights", "ตามสัดส่วน"],
                ["exact", "ระบุยอดเอง"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={mode === k}
                onClick={() => setMode(k)}
                className={`rounded-lg py-2 font-medium ${mode === k ? "bg-white shadow-sm" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul className="divide-y divide-line rounded-xl border border-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
              {mode === "equal" ? (
                <label className="flex flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-brand"
                    checked={!!equal[m.id]}
                    onChange={(e) => setEqual({ ...equal, [m.id]: e.target.checked })}
                  />
                  <span className="flex-1">{m.nickname}</span>
                </label>
              ) : (
                <>
                  <span className="flex-1">{m.nickname}</span>
                  <input
                    aria-label={`${mode === "weights" ? "สัดส่วน" : "ยอด"}ของ ${m.nickname}`}
                    className="input num w-24 py-1.5 text-right"
                    inputMode="decimal"
                    placeholder="0"
                    value={mode === "weights" ? weights[m.id] : exact[m.id]}
                    onChange={(e) =>
                      mode === "weights"
                        ? setWeights({ ...weights, [m.id]: e.target.value })
                        : setExact({ ...exact, [m.id]: e.target.value })
                    }
                  />
                </>
              )}
              <span className="num w-20 text-right text-sm text-muted">
                {preview?.get(m.id) ? formatBaht(preview.get(m.id)!, { always2dp: true }) : "–"}
              </span>
            </li>
          ))}
        </ul>

        {mode === "exact" && amount !== null && (
          <p className={`text-sm ${exactTotal === amount ? "text-brand" : "text-owe"}`}>
            รวม <Baht satang={exactTotal} /> จาก <Baht satang={amount} />
            {exactTotal !== amount && ` (${exactTotal < amount ? "ขาด" : "เกิน"} ${formatBaht(Math.abs(amount - exactTotal))} ฿)`}
          </p>
        )}
        {problem?.kind === "empty" && <p className="text-sm text-owe">เลือกอย่างน้อย 1 คนที่หารรายการนี้</p>}
        {mode !== "exact" && preview && amount !== null && amount % Math.max(1, preview.size) !== 0 && (
          <p className="text-xs text-muted">เศษสตางค์ที่หารไม่ลงตัวจะไปอยู่กับคนจ่ายก่อน ยอดรวมจึงตรงเป๊ะเสมอ</p>
        )}
      </div>
    </Sheet>
  );
}
