"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { settlement } from "@/lib/trip/derive";
import { useTrip, type TripState } from "@/lib/trip/store";
import { ConflictSheet } from "./conflict-sheet";
import { ExpensesTab } from "./expenses-tab";
import { MembersTab } from "./members-tab";
import { SettleTab } from "./settle-tab";

type Tab = "expenses" | "settle" | "members";

export function TripView({ tripId }: { tripId: string }) {
  const [state, store] = useTrip(tripId);
  const [tab, setTab] = useState<Tab>("expenses");
  const s = useMemo(() => (state.view ? settlement(state.view, state.me?.id ?? null) : null), [state.view, state.me]);

  if (state.status === "no-access")
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="font-medium">เปิดทริปนี้ไม่ได้</p>
        <p className="text-sm text-muted">ขอลิงก์ชวนจากเพื่อนในทริป แล้วเข้าผ่านลิงก์นั้น</p>
        <Link href="/" className="btn">
          กลับหน้าแรก
        </Link>
      </main>
    );
  if (!state.view || !s)
    return <main className="flex min-h-dvh items-center justify-center text-muted">กำลังโหลดทริป…</main>;

  const view = state.view;
  const badge = s.awaitingMe.length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex items-center gap-2">
          <Link href="/" className="btn-ghost -ml-3 px-2" aria-label="ทริปทั้งหมด">
            ‹
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{view.trip.name}</h1>
          <SyncPill state={state} />
        </div>
      </header>

      <Notices state={state} onDismissError={(i) => store.dismissError(i)} />

      <main className="flex-1 px-5 pb-28 pt-4">
        {tab === "expenses" && <ExpensesTab state={state} store={store} settlement={s} />}
        {tab === "settle" && <SettleTab state={state} store={store} settlement={s} />}
        {tab === "members" && <MembersTab state={state} store={store} settlement={s} />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        aria-label="ส่วนของทริป"
      >
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {(
            [
              ["expenses", "รายจ่าย", ICONS.expenses],
              ["settle", "สรุปยอด", ICONS.settle],
              ["members", "สมาชิก", ICONS.members],
            ] as const
          ).map(([key, label, icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${tab === key ? "text-brand" : "text-muted"}`}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {icon}
              </svg>
              {label}
              {key === "settle" && badge > 0 && (
                <span className="absolute right-[calc(50%-1.6rem)] top-1.5 min-w-5 rounded-full bg-owe px-1 text-[11px] leading-5 text-white">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {state.conflicts[0] && <ConflictSheet conflict={state.conflicts[0]} state={state} store={store} />}
    </div>
  );
}

const ICONS = {
  // receipt
  expenses: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  // two arrows swapping
  settle: (
    <>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </>
  ),
  // two people
  members: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" />
    </>
  ),
};

function SyncPill({ state }: { state: TripState }) {
  if (!state.online)
    return (
      <span className="chip bg-stone-200 text-stone-700" role="status">
        ออฟไลน์{state.queued ? ` · รอส่ง ${state.queued}` : ""}
      </span>
    );
  if (state.queued) return <span className="chip bg-wait-soft text-wait" role="status">กำลังส่ง {state.queued}</span>;
  if (state.live)
    return (
      <span className="chip bg-brand-soft text-brand" role="status" title="เห็นการแก้ไขของเพื่อนทันที">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
        สด
      </span>
    );
  return <span className="chip bg-stone-100 text-muted">เชื่อมต่อ…</span>;
}

function Notices({ state, onDismissError }: { state: TripState; onDismissError: (i: number) => void }) {
  if (!state.errors.length && state.online) return null;
  return (
    <div className="space-y-2 px-5 pt-3">
      {!state.online && (
        <p className="rounded-xl bg-stone-200/70 px-3.5 py-2.5 text-sm text-stone-700">
          ไม่มีเน็ตก็เพิ่มรายจ่ายได้ จะส่งให้เพื่อนเองเมื่อกลับมาออนไลน์
          {state.lastSyncedAt &&
            ` · ข้อมูลล่าสุดเมื่อ ${new Date(state.lastSyncedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`}
        </p>
      )}
      {state.errors.map((e, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl bg-owe-soft px-3.5 py-2.5 text-sm text-owe" role="alert">
          <span className="flex-1">บันทึกไม่สำเร็จ: {friendlyError(e)}</span>
          <button className="font-medium" onClick={() => onDismissError(i)}>
            ปิด
          </button>
        </div>
      ))}
    </div>
  );
}

function friendlyError(msg: string) {
  if (/invalid_split/.test(msg)) return "การหารไม่ถูกต้อง";
  if (/not_member/.test(msg)) return "คุณไม่ได้อยู่ในทริปนี้แล้ว";
  if (/not_allowed/.test(msg)) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (/already_decided/.test(msg)) return "รายการนี้ถูกยืนยันหรือยกเลิกไปแล้ว";
  if (/duplicate key|members_trip_nickname/.test(msg)) return "ชื่อเล่นนี้มีในทริปแล้ว";
  return msg;
}
