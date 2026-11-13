"use client";

import { Check, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { formatBaht, parseBaht } from "@/lib/core/money";
import { shares, validateSplit, type Split, type SplitMode } from "@/lib/core/split";
import type { TripState, TripStore } from "@/lib/trip/store";
import { expectedVersion, type Pending } from "@/lib/trip/outbox";
import type { Expense, ExpenseDraft } from "@/lib/trip/types";
import { Baht, MemberTile, Sheet, memberTint } from "../ui";

const MODES = [
  ["equal", "เท่ากัน"],
  ["weights", "สัดส่วน"],
  ["exact", "ระบุเอง"],
] as const;

/** The database caps one expense at 1,000,000 baht. */
const MAX_SATANG = 100_000_000;

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
  initial: Pending<Expense> | null;
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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [startTitle] = useState(title);
  const [startAmount] = useState(amountText);
  const dirty = title !== startTitle || amountText !== startAmount;

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
  const amountInvalid = amountText.trim() !== "" && amount === null;
  const amountTooBig = amount !== null && amount > MAX_SATANG;

  // Someone else changed this expense while the sheet was open.
  const live = base ? view.expenses.find((e) => e.id === base.id) : null;
  const baseVersion = base ? expectedVersion(base) : 0;
  const changedUnderneath = !!(base && live && !live.pending && live.version > baseVersion);
  const deletedUnderneath = !!(base && live?.deleted && !live.pending);

  async function save() {
    if (!draft || problem || !draft.title || amountTooBig) return;
    await store.do({ kind: "save_expense", expense: draft, baseVersion: base ? Math.max(1, baseVersion) : null });
    onClose();
  }

  async function remove() {
    if (!base) return;
    await store.do({ kind: "delete_expense", id: base.id, baseVersion: Math.max(1, baseVersion) });
    onClose();
  }

  const editor = live ? members.find((m) => m.user_id === live.updated_by)?.nickname : null;
  const payerName = members.find((m) => m.id === paidBy)?.nickname ?? "ผู้จ่าย";
  const meId = state.me?.id;
  const allEqual = mode === "equal" && members.every((m) => !!equal[m.id]);
  const noPayerEqual = mode === "equal" && members.length >= 2 && members.every((m) => (m.id === paidBy ? !equal[m.id] : !!equal[m.id]));
  const twoWayEqual =
    mode === "equal" &&
    !!meId &&
    meId !== paidBy &&
    members.length > 2 &&
    members.every((m) => (m.id === meId || m.id === paidBy ? !!equal[m.id] : !equal[m.id]));

  function applyQuickEqual(predicate: (id: string) => boolean) {
    setMode("equal");
    setEqual(Object.fromEntries(members.map((m) => [m.id, predicate(m.id)])));
  }

  return (
    <Sheet
      open
      onClose={onClose}
      onRequestClose={() => (dirty ? setConfirmDiscard(true) : onClose())}
      title={base ? "แก้ไขรายจ่าย" : "เพิ่มรายจ่าย"}
      footer={
        confirmDiscard ? (
          <div className="flex flex-wrap items-center gap-2" role="alert">
            <p className="w-full text-body font-semibold">ทิ้งข้อมูลที่กรอกไว้?</p>
            <button className="btn-danger flex-1" onClick={onClose} autoFocus>
              ทิ้ง
            </button>
            <button className="btn flex-1" onClick={() => setConfirmDiscard(false)}>
              กรอกต่อ
            </button>
          </div>
        ) : (
        <div className="flex gap-2">
          {base &&
            (confirmDelete ? (
              <button className="btn-danger" onClick={remove} autoFocus>
                <Trash2 className="size-4" strokeWidth={1.75} aria-hidden /> ยืนยันการลบ
              </button>
            ) : (
              <button className="btn" onClick={() => setConfirmDelete(true)} aria-label="ลบรายการนี้">
                <Trash2 className="size-4" strokeWidth={1.75} aria-hidden /> ลบ
              </button>
            ))}
          <button
            className="btn-primary flex-1"
            onClick={save}
            disabled={!draft || !!problem || !title.trim() || deletedUnderneath || amountTooBig}
            data-testid="save-expense"
          >
            <Check className="size-5" strokeWidth={1.75} aria-hidden /> บันทึก
          </button>
        </div>
        )
      }
    >
      {(changedUnderneath || deletedUnderneath) && (
        <div className="mb-5 flex gap-2.5 rounded-lg border border-dashed border-wait bg-wait-soft px-3.5 py-3 text-body text-wait" role="alert" data-testid="changed-underneath">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
          <p>
            {deletedUnderneath ? (
              <>รายการนี้ถูกลบไปแล้วระหว่างที่คุณกำลังแก้ไข</>
            ) : (
              <>
                {editor ?? "สมาชิกอีกคน"} เพิ่งแก้ไขรายการนี้ ({live!.title} {formatBaht(live!.amount)} ฿) หากบันทึก
                ระบบจะให้คุณเลือกว่าจะเก็บฉบับใด
              </>
            )}
          </p>
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
            placeholder="เช่น ค่าที่พัก หมูกระทะ"
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
              className="input num font-num text-body"
              inputMode="decimal"
              placeholder="0.00"
              value={amountText}
              aria-invalid={amountInvalid || amountTooBig}
              aria-describedby={amountInvalid || amountTooBig ? "amount-error" : undefined}
              onChange={(e) => setAmountText(e.target.value)}
            />
            {(amountInvalid || amountTooBig) && (
              <p id="amount-error" className="mt-1.5 flex items-start gap-1.5 text-meta text-owe" role="alert">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>{amountTooBig ? "ยอดต่อรายการต้องไม่เกิน 1,000,000 บาท" : "ใส่ตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง"}</span>
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="paid-by">
              ผู้จ่าย
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

        <fieldset className="space-y-2.5 pt-2">
          <legend className="label">วิธีหาร</legend>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-paper p-1 ring-1 ring-line">
            {MODES.map(([k, label]) => (
              <label key={k} className="relative">
                <input
                  type="radio"
                  name="split-mode"
                  value={k}
                  checked={mode === k}
                  onChange={() => setMode(k)}
                  className="peer sr-only"
                />
                <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-[8px] text-body font-semibold text-ink transition-colors duration-150 hover:bg-ground peer-checked:bg-ink peer-checked:text-white peer-checked:hover:bg-ink-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                  {label}
                </span>
              </label>
            ))}
          </div>
          {members.length >= 2 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="ตัวเลือกหารด่วน">
              <button
                type="button"
                onClick={() => applyQuickEqual(() => true)}
                aria-pressed={allEqual}
                className={`min-h-12 rounded-lg border px-3.5 text-meta font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] ${
                  allEqual ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink hover:border-ink/40"
                }`}
              >
                ทุกคน (<span className="num font-num">{members.length}</span>)
              </button>
              <button
                type="button"
                onClick={() => applyQuickEqual((id) => id !== paidBy)}
                aria-pressed={noPayerEqual}
                className={`min-h-12 rounded-lg border px-3.5 text-meta font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] ${
                  noPayerEqual ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink hover:border-ink/40"
                }`}
              >
                ไม่รวมผู้จ่าย (<span className="num font-num">{members.length - 1}</span>)
              </button>
              {meId && meId !== paidBy && members.length > 2 && (
                <button
                  type="button"
                  onClick={() => applyQuickEqual((id) => id === meId || id === paidBy)}
                  aria-pressed={twoWayEqual}
                  className={`min-h-12 rounded-lg border px-3.5 text-meta font-semibold transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] ${
                    twoWayEqual ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink hover:border-ink/40"
                  }`}
                >
                  แค่ฉันกับ{payerName}
                </button>
              )}
            </div>
          )}
        </fieldset>

        <ul className="coupon divide-y divide-line">
          {members.map((m) => {
            const share = preview?.get(m.id);
            return (
              <li key={m.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                {mode === "equal" ? (
                  <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 self-stretch">
                    <input
                      type="checkbox"
                      className="size-5 accent-[#14302b]"
                      checked={!!equal[m.id]}
                      onChange={(e) => setEqual({ ...equal, [m.id]: e.target.checked })}
                    />
                    <MemberTile name={m.nickname} tint={memberTint(members, m.id)} size={30} />
                    <span className="min-w-0 flex-1 break-words text-body">{m.nickname}</span>
                  </label>
                ) : (
                  <>
                    <MemberTile name={m.nickname} tint={memberTint(members, m.id)} size={30} />
                    <span className="min-w-0 flex-1 truncate text-body" title={m.nickname}>
                      {m.nickname}
                    </span>
                    <input
                      aria-label={`${mode === "weights" ? "สัดส่วน" : "ยอด"}ของ ${m.nickname}`}
                      className="input num font-num w-20 shrink-0 text-right min-[400px]:w-24"
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
                <span className={`num font-num min-w-20 shrink-0 text-right text-body ${share ? "text-ink" : "text-muted"}`}>
                  {share ? formatBaht(share, { always2dp: true }) : "–"}
                </span>
              </li>
            );
          })}
        </ul>

        {mode === "exact" && amount !== null && (
          <p className={`flex items-center gap-1.5 text-body font-medium ${exactTotal === amount ? "text-ok" : "text-owe"}`} role="status">
            {exactTotal === amount ? (
              <Check className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            ) : (
              <TriangleAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            <span>
              รวม <Baht satang={exactTotal} /> จาก <Baht satang={amount} />
              {exactTotal !== amount && ` (${exactTotal < amount ? "ขาด" : "เกิน"} ${formatBaht(Math.abs(amount - exactTotal))} ฿)`}
            </span>
          </p>
        )}
        {problem?.kind === "empty" && (
          <p className="flex items-center gap-1.5 text-body text-owe" role="alert">
            <TriangleAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>
              โปรดเลือกอย่างน้อย <span className="whitespace-nowrap">1 คน</span>ที่ร่วมจ่ายรายการนี้
            </span>
          </p>
        )}
        {mode !== "exact" && preview && amount !== null && amount % Math.max(1, preview.size) !== 0 && (
          <p className="hint">เศษสตางค์ที่หารไม่ลงตัวจะไปอยู่กับผู้จ่ายก่อน ยอดรวมจึงตรงทุกสตางค์</p>
        )}
      </div>
    </Sheet>
  );
}
