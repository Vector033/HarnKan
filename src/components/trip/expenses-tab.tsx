"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { formatBaht } from "@/lib/core/money";
import { shares } from "@/lib/core/split";
import type { Settlement } from "@/lib/trip/derive";
import type { Pending } from "@/lib/trip/outbox";
import type { TripState, TripStore } from "@/lib/trip/store";
import type { Expense } from "@/lib/trip/types";
import { Baht, Empty, MemberTile, PendingMark, memberTint } from "../ui";
import { ExpenseSheet } from "./expense-sheet";

/** The trip's booklet number: a stable 4-digit serial printed on its coupons. */
export function tripSerial(tripId: string) {
  let h = 0;
  for (const ch of tripId) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return `No. ${String(h % 10000).padStart(4, "0")}`;
}

/** A transfer's own coupon number: the booklet serial plus a stub number fixed by who pays whom. */
export function couponNo(tripId: string, from: string, to: string) {
  let h = 0;
  for (const ch of from + to) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${tripSerial(tripId)}-${String((h % 99) + 1).padStart(2, "0")}`;
}

export function ExpensesTab({
  state,
  store,
  settlement,
  onOpenSettle,
}: {
  state: TripState;
  store: TripStore;
  settlement: Settlement;
  onOpenSettle: () => void;
}) {
  const view = state.view!;
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const names = new Map(view.members.map((m) => [m.id, m.nickname]));
  const list = view.expenses.filter((e) => !e.deleted);
  const me = state.me;
  const myShare = me ? (settlement.spentBy.get(me.id) ?? 0) : 0;
  const myPayments = me ? settlement.transfers.filter((t) => t.from === me.id && t.claimedAmount < t.amount) : [];
  const serial = tripSerial(view.trip.id);
  const allHavePromptPay = myPayments.every((t) => view.members.find((m) => m.id === t.to)?.promptpay_id);

  const byDay = new Map<string, Pending<Expense>[]>();
  for (const e of list) {
    const day = new Date(e.spent_at).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }

  return (
    <>
      <section className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2" aria-label="ยอดรวม">
        <Stub label="ทั้งทริปจ่ายไป" serial={serial} satang={settlement.total} />
        <Stub label="ส่วนของคุณ" serial={serial} satang={myShare} tint={me ? memberTint(view.members, me.id) : undefined} />
      </section>

      {myPayments.length > 0 && (
        <button
          onClick={onOpenSettle}
          className="coupon coupon-press mt-2.5 flex w-full items-stretch text-left"
          style={{ background: memberTint(view.members, myPayments[0].to) }}
        >
          <span className="flex-1 px-4 py-3">
            <span className="flex items-baseline justify-between gap-2 text-meta font-medium">
              <span className="min-w-0 [overflow-wrap:anywhere]">คุณต้องโอนให้ {myPayments.map((t) => names.get(t.to)).join(", ")}</span>
              {myPayments.length === 1 && <span className="serial">{couponNo(view.trip.id, myPayments[0].from, myPayments[0].to)}</span>}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-body font-bold">
              {allHavePromptPay ? "ดู QR พร้อมเพย์และแนบสลิป" : "ดูยอดที่ต้องโอนและแนบสลิป"} <ChevronRight className="size-4" aria-hidden />
            </span>
          </span>
          <span className="perf-y flex items-center border-ink/30 px-4">
            <Baht satang={myPayments.reduce((s, t) => s + t.amount - t.claimedAmount, 0)} className="text-title font-semibold" />
          </span>
        </button>
      )}

      {list.length === 0 ? (
        <div className="mt-6">
          <Empty title="ยังไม่มีรายจ่าย">กดปุ่ม “เพิ่มรายจ่าย” เพื่อบันทึกรายการแรก ทุกคนในทริปจะเห็นทันที</Empty>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {[...byDay].map(([day, items]) => (
            <section key={day} aria-label={day}>
              {/* Guide row: stays pinned under the header while its day is in view. */}
              <h2 className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+4rem)] z-10 -mx-4 flex justify-between bg-ground/95 px-4 py-2 text-meta font-semibold text-muted">
                <span>{day}</span>
                <span className="num font-medium">
                  {items.length} รายการ · {formatBaht(items.reduce((s, e) => s + e.amount, 0))} ฿
                </span>
              </h2>
              <ul className="coupon divide-y divide-line">
                {items.map((e) => (
                  <ExpenseRow key={e.id} e={e} state={state} onOpen={() => setEditing(e)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <button
        onClick={() => setEditing("new")}
        className="btn-primary fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50%-15.5rem))] z-20 h-14 rounded-[var(--radius-coupon)] px-5 shadow-[0_6px_18px_-6px_rgb(20_48_43/0.55)]"
      >
        <Plus className="size-5" strokeWidth={2.6} aria-hidden /> เพิ่มรายจ่าย
      </button>

      {editing && (
        <ExpenseSheet
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          state={state}
          store={store}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Stub({ label, serial, satang, tint }: { label: string; serial: string; satang: number; tint?: string }) {
  return (
    <div className="coupon flex" style={tint ? { background: tint } : undefined}>
      <span className="perf-y my-2.5 ml-2.5 border-ink/25" aria-hidden />
      <div className="min-w-0 flex-1 px-3 py-3">
        <span className="block text-meta font-medium">{label}</span>
        <Baht satang={satang} className="mt-0.5 block text-title font-semibold leading-tight" />
        <span className="serial mt-1 block whitespace-nowrap">{serial}</span>
      </div>
    </div>
  );
}

function ExpenseRow({ e, state, onOpen }: { e: Pending<Expense>; state: TripState; onOpen: () => void }) {
  const members = state.view!.members;
  const payer = members.find((m) => m.id === e.paid_by);
  const s = shares(e);
  const people = [...s.values()].filter((v) => v > 0).length;
  const mine = state.me ? s.get(state.me.id) : undefined;
  const editedBy =
    e.version > 1 && e.updated_by && e.updated_by !== e.created_by
      ? members.find((m) => m.user_id === e.updated_by)?.nickname
      : null;

  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-ground/60" data-testid="expense-row">
        <MemberTile name={payer?.nickname ?? "?"} tint={memberTint(members, e.paid_by)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold" title={e.title}>
            {e.title}
          </span>
          <span className="block text-meta text-muted">
            <span className="[overflow-wrap:anywhere]">{payer?.nickname ?? "?"}</span> จ่าย · {splitLabel(e.split_mode, people)}
            {editedBy && ` · แก้ล่าสุดโดย ${editedBy}`}
          </span>
        </span>
        <span className="text-right">
          <Baht satang={e.amount} className="block text-body font-semibold leading-tight" />
          {e.pending ? (
            <PendingMark />
          ) : (
            mine !== undefined && <span className="num block text-meta text-muted">ส่วนคุณ {formatBaht(mine)}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function splitLabel(mode: Expense["split_mode"], people: number) {
  if (mode === "equal") return `หารเท่ากัน ${people} คน`;
  if (mode === "weights") return `ตามสัดส่วน ${people} คน`;
  return `ระบุยอดเอง ${people} คน`;
}
