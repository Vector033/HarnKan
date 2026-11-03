"use client";

import { useState } from "react";
import type { Settlement } from "@/lib/trip/derive";
import type { Pending } from "@/lib/trip/outbox";
import type { TripState, TripStore } from "@/lib/trip/store";
import type { Expense } from "@/lib/trip/types";
import { Avatar, Baht, Empty, PendingDot } from "../ui";
import { ExpenseSheet } from "./expense-sheet";

export function ExpensesTab({ state, store, settlement }: { state: TripState; store: TripStore; settlement: Settlement }) {
  const view = state.view!;
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const names = new Map(view.members.map((m) => [m.id, m.nickname]));
  const list = view.expenses.filter((e) => !e.deleted);
  const myShare = state.me ? (settlement.spentBy.get(state.me.id) ?? 0) : 0;

  const byDay = new Map<string, Pending<Expense>[]>();
  for (const e of list) {
    const day = new Date(e.spent_at).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  }

  return (
    <>
      <section className="mb-5 grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-xs text-muted">ทั้งทริปจ่ายไป</p>
          <Baht satang={settlement.total} className="mt-1 block text-2xl font-bold" />
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">ส่วนของคุณ</p>
          <Baht satang={myShare} className="mt-1 block text-2xl font-bold" />
        </div>
      </section>

      {list.length === 0 ? (
        <Empty title="ยังไม่มีรายจ่าย">กดปุ่ม + ด้านล่างเพื่อจดรายการแรก เพื่อนในทริปจะเห็นทันที</Empty>
      ) : (
        <div className="space-y-5">
          {[...byDay].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold text-muted">{day}</h2>
              <ul className="card divide-y divide-line">
                {items.map((e) => {
                  const people = Object.values(e.split).filter((v) => v > 0).length;
                  return (
                    <li key={e.id}>
                      <button
                        onClick={() => setEditing(e)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-stone-50"
                        data-testid="expense-row"
                      >
                        <Avatar name={names.get(e.paid_by) ?? "?"} id={e.paid_by} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{e.title}</span>
                          <span className="block text-sm text-muted">
                            {names.get(e.paid_by) ?? "?"} จ่าย · {splitLabel(e.split_mode, people)}
                          </span>
                        </span>
                        <span className="text-right">
                          <Baht satang={e.amount} className="block font-semibold" />
                          {e.pending && <PendingDot />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <button
        onClick={() => setEditing("new")}
        className="btn-primary fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-[max(1.25rem,calc(50%-15rem))] z-10 h-14 rounded-2xl px-5 shadow-lg shadow-brand/30"
      >
        <span className="text-xl leading-none">+</span> เพิ่มรายจ่าย
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

function splitLabel(mode: Expense["split_mode"], people: number) {
  if (mode === "equal") return `หารเท่า ${people} คน`;
  if (mode === "weights") return `ตามสัดส่วน ${people} คน`;
  return `ระบุยอดเอง ${people} คน`;
}
