"use client";

import { ArrowLeftRight, ChevronLeft, CloudOff, ReceiptText, Users, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { settlement } from "@/lib/trip/derive";
import { useTrip, type TripState } from "@/lib/trip/store";
import { ConflictSheet } from "./conflict-sheet";
import { ExpensesTab } from "./expenses-tab";
import { MembersTab } from "./members-tab";
import { SettleTab } from "./settle-tab";

type Tab = "expenses" | "settle" | "members";

const TABS = [
  { key: "expenses", label: "รายจ่าย", Icon: ReceiptText },
  { key: "settle", label: "สรุปยอด", Icon: ArrowLeftRight },
  { key: "members", label: "สมาชิก", Icon: Users },
] as const;

export function TripView({ tripId }: { tripId: string }) {
  const [state, store] = useTrip(tripId);
  const [tab, setTab] = useState<Tab>("expenses");
  const s = useMemo(() => (state.view ? settlement(state.view, state.me?.id ?? null) : null), [state.view, state.me]);

  if (state.status === "no-access")
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-body font-bold">เปิดทริปนี้ไม่ได้</p>
        <p className="max-w-[34ch] text-body text-muted">
          คุณอาจยังไม่ได้เข้าทริป หรือถูกนำออกจากทริปแล้ว โปรดขอลิงก์ชวนใหม่จากเจ้าของทริป
        </p>
        <Link href="/" className="btn mt-2">
          กลับหน้าแรก
        </Link>
      </main>
    );
  if ((!state.view || !s) && !state.online)
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <CloudOff className="size-6 text-muted" aria-hidden />
        <p className="text-body font-bold">ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเปิดทริปนี้ครั้งแรก</p>
        <p className="max-w-[34ch] text-body text-muted">ทริปที่เคยเปิดในเครื่องนี้แล้วจะใช้ได้แม้ไม่มีสัญญาณ</p>
        <Link href="/" className="btn mt-2">
          กลับหน้าแรก
        </Link>
      </main>
    );
  if (!state.view || !s)
    return (
      <main className="flex min-h-dvh items-center justify-center text-muted" role="status">
        กำลังโหลดทริป…
      </main>
    );

  const view = state.view;
  const badge = s.awaitingMe.length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-20 bg-ink px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center gap-1">
          <Link href="/" className="-ml-3 grid size-12 place-items-center rounded-lg hover:bg-white/10" aria-label="ทริปทั้งหมด">
            <ChevronLeft className="size-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 text-title font-bold leading-[1.3] [overflow-wrap:anywhere]" title={view.trip.name}>
              {view.trip.name}
            </h1>
            <p className="text-meta text-on-ink-muted">
              {view.members.length} คน{view.trip.locked && " · ล็อกแล้ว"}
            </p>
          </div>
          <SyncStatus state={state} />
        </div>
      </header>

      <Notices state={state} onDismissError={(i) => store.dismissError(i)} />

      <main className="flex-1 px-4 pb-32 pt-4">
        {tab === "expenses" && <ExpensesTab state={state} store={store} settlement={s} onOpenSettle={() => setTab("settle")} />}
        {tab === "settle" && <SettleTab state={state} store={store} settlement={s} />}
        {tab === "members" && <MembersTab state={state} store={store} settlement={s} />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)]"
        aria-label="ส่วนของทริป"
      >
        <div className="mx-auto grid max-w-lg grid-cols-3 border-t border-line bg-paper sm:border-x">
          {TABS.map(({ key, label, Icon }) => {
            const on = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-meta font-semibold ${on ? "text-ink" : "text-muted"}`}
              >
                {on && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-ink" aria-hidden />}
                <Icon className="size-[22px]" strokeWidth={on ? 2.4 : 1.9} aria-hidden />
                {label}
                {key === "settle" && badge > 0 && (
                  <span className="num absolute right-[calc(50%-1.9rem)] top-2 min-w-5 rounded-md bg-ink px-1 text-center text-meta leading-5 text-white">
                    {badge}
                    <span className="sr-only"> รายการรอคุณยืนยัน</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {state.conflicts[0] && <ConflictSheet conflict={state.conflicts[0]} state={state} store={store} />}
    </div>
  );
}

function SyncStatus({ state }: { state: TripState }) {
  const base = "chip shrink-0 text-meta";
  if (!state.online)
    return (
      <span className={`${base} bg-white/12 text-white`} role="status">
        <CloudOff className="size-3.5" aria-hidden />
        ออฟไลน์{state.queued ? ` · รอส่ง ${state.queued} รายการ` : ""}
      </span>
    );
  if (state.queued)
    return (
      <span className={`${base} border border-dashed border-t3 text-t3`} role="status">
        กำลังส่ง {state.queued} รายการ
      </span>
    );
  if (state.live)
    return (
      <span className={`${base} bg-t1 text-ink`} role="status" title="เห็นการแก้ไขของเพื่อนทันที">
        <span className="live-dot size-1.5 rounded-full bg-ok" aria-hidden />
        ออนไลน์
      </span>
    );
  return (
    <span className={`${base} bg-white/12 text-white`} role="status">
      กำลังเชื่อมต่อ…
    </span>
  );
}

function Notices({ state, onDismissError }: { state: TripState; onDismissError: (i: number) => void }) {
  if (!state.errors.length && state.online) return null;
  return (
    <div className="space-y-2 px-4 pt-3">
      {!state.online && (
        <p className="rounded-lg border border-dashed border-perf bg-paper px-3.5 py-3 text-body text-ink">
          ไม่มีอินเทอร์เน็ตก็เพิ่มรายจ่ายได้ ระบบจะส่งให้เพื่อนเองเมื่อกลับมาออนไลน์
          {state.lastSyncedAt && (
            <span className="text-muted">
              {" "}
              · ข้อมูลล่าสุดเมื่อ {new Date(state.lastSyncedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
            </span>
          )}
        </p>
      )}
      {state.errors.map((e, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg bg-owe-soft px-3.5 py-3 text-body text-owe" role="alert">
          <span className="flex-1">บันทึกไม่สำเร็จ: {friendlyError(e)} รายการนี้ยังไม่ถูกบันทึก</span>
          <button className="-my-2 -mr-2 grid size-12 shrink-0 place-items-center rounded-md" onClick={() => onDismissError(i)} aria-label="ปิดข้อความ">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function friendlyError(msg: string) {
  if (/invalid_split/.test(msg)) return "การหารไม่ถูกต้อง โปรดเปิดรายการแล้วตรวจยอดของแต่ละคนอีกครั้ง";
  if (/check constraint/.test(msg)) return "ยอดต่อรายการต้องมากกว่า 0 และไม่เกิน 1,000,000 บาท";
  if (/not_member/.test(msg)) return "คุณไม่ได้อยู่ในทริปนี้แล้ว";
  if (/not_allowed|not_creator/.test(msg)) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (/already_decided/.test(msg)) return "รายการนี้ได้รับการยืนยันหรือยกเลิกไปแล้ว";
  if (/duplicate key|members_trip_nickname/.test(msg)) return "ชื่อเล่นนี้มีอยู่ในทริปแล้ว";
  if (/row-level security|violates/.test(msg)) return "คุณไม่มีสิทธิ์แก้ไขรายการนี้";
  return "เกิดข้อผิดพลาด โปรดลองอีกครั้ง";
}
