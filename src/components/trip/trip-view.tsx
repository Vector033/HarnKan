"use client";

import { ArrowLeftRight, ChevronLeft, Clock, CloudOff, ReceiptText, Settings, TriangleAlert, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { settlement } from "@/lib/trip/derive";
import { useTrip, type TripState } from "@/lib/trip/store";
import { InkBandWatermark } from "../ui";
import { ConflictSheet } from "./conflict-sheet";
import { ExpensesTab, tripSerial } from "./expenses-tab";
import { MembersTab } from "./members-tab";
import { SettleTab } from "./settle-tab";

type Tab = "expenses" | "settle" | "members";

const TABS = [
  { key: "expenses", label: "รายจ่าย", Icon: ReceiptText },
  { key: "settle", label: "สรุปยอด", Icon: ArrowLeftRight },
  { key: "members", label: "สมาชิก", Icon: Users },
] as const;

/** Wide screens (1024px and up) show the settlement beside the list instead of in its own tab. */
const WIDE = "(min-width: 1024px)";
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

/** Publishes the sticky header's height so rows that stick under it never slide beneath it. */
function useHeaderHeight() {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

export function TripView({ tripId }: { tripId: string }) {
  const [state, store] = useTrip(tripId);
  const [tab, setTab] = useState<Tab>("expenses");
  const wide = useWide();
  const headerRef = useHeaderHeight();
  const s = useMemo(() => (state.view ? settlement(state.view, state.me?.id ?? null) : null), [state.view, state.me]);

  if (state.status === "no-access")
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-body font-bold">เปิดทริปนี้ไม่ได้</p>
        <p className="max-w-[34ch] text-body text-muted">
          คุณอาจยังไม่ได้เข้าทริป หรือถูกนำออกจากทริปแล้ว โปรดขอลิงก์ชวนใหม่จากเจ้าของทริป
        </p>
        <Link href="/" className="btn mt-2 whitespace-nowrap">
          กลับหน้าแรก
        </Link>
      </main>
    );
  if ((!state.view || !s) && !state.online)
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <CloudOff className="size-6 text-muted" strokeWidth={1.75} aria-hidden />
        <p className="text-body font-bold">ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเปิดทริปนี้ครั้งแรก</p>
        <p className="max-w-[34ch] text-body text-muted">ทริปที่เคยเปิดในเครื่องนี้แล้วจะใช้ได้แม้ไม่มีสัญญาณ</p>
        <Link href="/" className="btn mt-2 whitespace-nowrap">
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
  // On a wide screen the settlement is always on the right, so the left shows expenses or members.
  const left = tab === "settle" ? "expenses" : tab;
  const tabs = wide ? TABS.filter((t) => t.key !== "settle") : TABS;

  const expenses = <ExpensesTab state={state} store={store} settlement={s} onOpenSettle={() => setTab("settle")} />;
  const settle = <SettleTab state={state} store={store} settlement={s} />;
  const members = <MembersTab state={state} store={store} settlement={s} />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col lg:max-w-none">
      <header ref={headerRef} className="ink-band sticky top-0 z-20 border-b border-t1/15 bg-ink pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white lg:pb-0">
        <InkBandWatermark variant="bar" />
        <div className="relative z-10 flex items-center gap-1 px-4 lg:mx-auto lg:max-w-6xl lg:gap-3 lg:px-8">
          <Link href="/" className="-ml-3 grid size-12 shrink-0 place-items-center rounded-lg hover:bg-white/10" aria-label="ทริปทั้งหมด">
            <ChevronLeft className="size-6" strokeWidth={1.75} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 break-words text-title font-bold leading-[1.3]" title={view.trip.name}>
              {view.trip.name}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-on-ink-muted">
              <span>
                <span className="num font-num">{view.members.length}</span> คน{view.trip.locked && " · ล็อกแล้ว"}
              </span>
              <span className="num font-num inline-flex items-center rounded-md border border-t1/20 bg-white/[0.08] px-1.5 py-0.5 text-meta font-semibold tracking-[0.04em] text-t1">
                เล่ม {tripSerial(view.trip.id)}
              </span>
            </p>
          </div>
          <SyncStatus state={state} />
          <Link href="/settings" className="-mr-3 grid size-12 shrink-0 place-items-center rounded-lg text-on-ink-muted hover:bg-white/10 hover:text-white" aria-label="ตั้งค่า" data-testid="settings-link">
            <Settings className="size-6" strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
        {wide && (
          <nav className="relative z-10 mx-auto mt-2 flex max-w-6xl gap-1 px-8" aria-label="ส่วนของทริป">
            {tabs.map(({ key, label, Icon }) => {
              const on = left === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex min-h-12 items-center gap-2 rounded-t-lg px-4 text-body font-semibold transition-colors duration-150 ${on ? "text-white" : "text-on-ink-muted hover:bg-white/10 hover:text-white"}`}
                >
                  <Icon className="size-5" strokeWidth={on ? 2.25 : 1.75} aria-hidden />
                  {label}
                  {on && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t bg-t1" aria-hidden />}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <div className="lg:mx-auto lg:w-full lg:max-w-6xl lg:px-4">
        <Notices state={state} onDismissError={(i) => store.dismissError(i)} />
      </div>

      {/* One tree at every width, with CSS hiding a column: if the width crossed 1024px and the tree
          changed, React would remount the tabs and an open sheet would close and drop its draft. */}
      <main className="mx-auto w-full flex-1 px-4 pb-32 pt-4 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:items-start lg:gap-8 lg:px-8 lg:pb-12 lg:pt-6">
        <div className={`min-w-0 flex-col lg:flex ${tab === "settle" ? "hidden" : "flex"}`}>{left === "members" ? members : expenses}</div>
        <aside
          className={`lg:sticky lg:top-[calc(var(--header-h,8rem)+1.5rem)] lg:-mx-2 lg:block lg:max-h-[calc(100dvh-var(--header-h,8rem)-3rem)] lg:overflow-y-auto lg:rounded-[var(--radius-coupon)] lg:px-2 lg:pb-2 ${tab === "settle" ? "" : "hidden"}`}
          aria-label="สรุปยอด"
        >
          {settle}
        </aside>
      </main>

      {!wide && (
        <nav className="fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)]" aria-label="ส่วนของทริป">
          <div className="mx-auto grid max-w-lg grid-cols-3 border-t border-line bg-paper sm:border-x">
            {TABS.map(({ key, label, Icon }) => {
              const on = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-meta font-semibold transition-colors duration-150 active:scale-[0.98] ${on ? "text-ink" : "text-muted"}`}
                >
                  {on && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-ink" aria-hidden />}
                  <Icon className="size-[22px]" strokeWidth={on ? 2.25 : 1.75} aria-hidden />
                  {label}
                  {key === "settle" && badge > 0 && (
                    <span className="num font-num absolute right-[calc(50%-1.9rem)] top-2 min-w-5 rounded-md bg-ink px-1 text-center text-meta leading-5 text-white">
                      {badge}
                      <span className="sr-only"> รายการรอคุณยืนยัน</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {state.conflicts[0] && <ConflictSheet conflict={state.conflicts[0]} state={state} store={store} />}
    </div>
  );
}

function SyncStatus({ state }: { state: TripState }) {
  const base = "chip shrink-0 text-meta";
  if (!state.online)
    return (
      <span className={`${base} bg-white/12 text-white`} role="status">
        <CloudOff className="size-3.5" strokeWidth={1.75} aria-hidden />
        ออฟไลน์{state.queued ? ` · รอส่ง ${state.queued} รายการ` : ""}
      </span>
    );
  if (state.queued)
    return (
      <span className={`${base} border border-dashed border-t3 text-t3`} role="status">
        <Clock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        กำลังส่ง <span className="num font-num">{state.queued}</span> รายการ
      </span>
    );
  if (state.live)
    return (
      <span className={`${base} paper-tint bg-t1 text-ink`} role="status" title="เห็นการแก้ไขของเพื่อนทันที">
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
              · ข้อมูลล่าสุดเมื่อ <span className="num font-num whitespace-nowrap">{new Date(state.lastSyncedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</span>
            </span>
          )}
        </p>
      )}
      {state.errors.map((e, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg bg-owe-soft px-3.5 py-3 text-body text-owe" role="alert">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
          <span className="flex-1">บันทึกไม่สำเร็จ: {friendlyError(e)} รายการนี้ยังไม่ถูกบันทึก</span>
          <button className="-my-2 -mr-2 grid size-12 shrink-0 place-items-center rounded-md" onClick={() => onDismissError(i)} aria-label="ปิดข้อความ">
            <X className="size-4" strokeWidth={1.75} />
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
