"use client";

import { Check, ChevronRight, RotateCcw, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { tripSerial } from "@/components/trip/expenses-tab";
import { Baht, MemberTile, SettleStrip } from "@/components/ui";
import { settlement } from "@/lib/trip/derive";
import { ensureUser, supabase } from "@/lib/supabase/client";
import { allSnapshots } from "@/lib/trip/idb";

interface TripItem {
  id: string;
  name: string;
  created_at: string;
}

const QUICK_TRIPS = ["หมูกระทะเย็นนี้", "เที่ยวทะเลเสาร์อาทิตย์", "คาเฟ่กับแก๊ง", "หารค่าห้องพัก"];

const ONBOARDING_STEPS = [
  { n: "1", label: "ตั้งชื่อ" },
  { n: "2", label: "ส่งลิงก์" },
  { n: "3", label: "สแกนจ่าย" },
];

export default function Home() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripItem[] | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Trips opened on this device carry their data, so their coupon can show how settled they are.
  const [settled, setSettled] = useState<Map<string, { settled: number; toSettle: number }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Trips cached on this device show first and are all there is offline.
      const snaps = await allSnapshots().catch(() => []);
      const cached = snaps.map((s) => s.trip);
      if (!cancelled) {
        setTrips(sortTrips(cached));
        setSettled(new Map(snaps.map((s) => {
          const r = settlement(s, null);
          return [s.trip.id, { settled: r.settled, toSettle: r.toSettle }];
        })));
      }
      const user = await ensureUser();
      if (!user) return;
      const { data } = await supabase().from("trips").select("id,name,created_at");
      if (!cancelled && data) setTrips(sortTrips(data));
      // The nickname from settings, else the one used in an earlier trip.
      const [{ data: p }, { data: me }] = await Promise.all([
        supabase().from("profiles").select("nickname").maybeSingle(),
        supabase().from("members").select("nickname").eq("user_id", user).limit(1),
      ]);
      const known = p?.nickname ?? me?.[0]?.nickname;
      if (!cancelled && known) setNickname((n) => n || known);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const user = await ensureUser();
    if (!user) {
      setError("ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อสร้างทริป");
      setBusy(false);
      return;
    }
    const { data, error } = await supabase().rpc("create_trip", { p_name: name, p_nickname: nickname });
    if (error) {
      setError(
        /rate_limited/.test(error.message)
          ? "วันนี้สร้างทริปครบจำนวนแล้ว โปรดลองใหม่พรุ่งนี้"
          : error.code
            ? "สร้างทริปไม่สำเร็จ โปรดลองอีกครั้ง"
            : "ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อสร้างทริป",
      );
      setBusy(false);
      return;
    }
    router.push(`/t/${(data as { trip_id: string }).trip_id}`);
  }

  const showMobileDemo = trips !== null && trips.length === 0;

  return (
    <div className="mx-auto min-h-dvh max-w-lg lg:grid lg:max-w-none lg:grid-cols-2">
      <header className="rounded-b-[28px] bg-ink px-5 pb-8 pt-[max(2.25rem,env(safe-area-inset-top))] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:items-end lg:justify-center lg:rounded-none lg:px-14 lg:py-12">
        <div className="lg:w-full lg:max-w-md">
          <div className="flex items-center justify-between gap-4">
            <span className="text-title font-bold tracking-tight text-white">หารกัน</span>
            <Link
              href="/settings"
              className="-mr-2 grid size-12 place-items-center rounded-lg text-on-ink-muted transition-colors duration-150 hover:bg-white/10 hover:text-white"
              aria-label="ตั้งค่า"
              data-testid="settings-link"
            >
              <Settings className="size-6" strokeWidth={1.75} aria-hidden />
            </Link>
          </div>
          <h1 className="mt-2 text-display font-bold text-balance">
            หารค่างวด <span className="whitespace-nowrap">ค่ากินเที่ยว</span>กับเพื่อนได้ทันที{" "}
            <span className="whitespace-nowrap">สลิปเดียวรู้เรื่อง</span>
          </h1>
          <p className="mt-2.5 max-w-[34ch] text-body leading-relaxed text-on-ink-muted">
            จดค่าใช้จ่ายร่วมกันจากมือถือทุกคน สรุปยอดโอนให้น้อยครั้งที่สุด พร้อม QR พร้อมเพย์
          </p>
          <div className={showMobileDemo ? "block" : "hidden lg:block"}>
            <ExampleCoupon />
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-8 px-4 pb-12 pt-5 lg:w-full lg:max-w-xl lg:self-center lg:px-12 lg:py-14">
        <form onSubmit={create} className="coupon" aria-labelledby="create-h">
          <div className="relative space-y-5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="create-h" className="text-body font-bold">
                สร้างทริปใหม่
              </h2>
              <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-muted" aria-label="ขั้นตอนใช้งาน">
                {ONBOARDING_STEPS.map((step) => (
                  <li key={step.n} className="inline-flex items-center gap-1">
                    <span className="num font-num inline-grid size-5 place-items-center rounded-[4px] bg-ground text-[13px] font-semibold text-ink">
                      {step.n}
                    </span>
                    <span>{step.label}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <label className="label" htmlFor="trip-name">
                ชื่อทริป
              </label>
              <input
                id="trip-name"
                className="input"
                required
                maxLength={80}
                autoComplete="off"
                placeholder="เช่น เชียงดาว ปีใหม่"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="ตัวอย่างคำที่ใช้บ่อย">
                {QUICK_TRIPS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setName(preset)}
                    className={`rounded-[6px] border px-2.5 py-1 text-meta font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] ${
                      name === preset
                        ? "border-ink bg-ink text-white"
                        : "border-line bg-ground/70 text-ink hover:border-ink/40"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="nickname">
                ชื่อเล่นของคุณ
              </label>
              <input
                id="nickname"
                className="input"
                required
                maxLength={30}
                autoComplete="nickname"
                placeholder="ชื่อที่เพื่อนเรียก"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-body text-owe" role="alert">
                {error}
              </p>
            )}
            <button className="btn-primary w-full" disabled={busy || !name.trim() || !nickname.trim()}>
              {busy ? "กำลังสร้าง…" : "สร้างทริป"}
            </button>
          </div>
          <p className="perf-x px-4 py-3 text-meta text-muted">
            ไม่ต้องสมัครสมาชิก เพื่อนเข้าผ่านลิงก์หรือ QR แล้วใส่ชื่อเล่นได้เลย
          </p>
        </form>

        {/* Returning people come for their trips; the form moves below them. */}
        <section aria-labelledby="mine-h" className={trips?.length ? "order-first" : undefined}>
          <h2 id="mine-h" className="mb-2.5 text-body font-bold">
            ทริปของฉัน
          </h2>
          {trips === null ? (
            <p className="text-body text-muted">กำลังโหลด…</p>
          ) : trips.length === 0 ? (
            <p className="text-body text-muted">ยังไม่มีทริป สร้างทริปใหม่ หรือเปิดลิงก์ที่เพื่อนส่งมา</p>
          ) : (
            <ul className="space-y-2">
              {trips.map((t) => (
                <li key={t.id}>
                  <Link href={`/t/${t.id}`} data-testid="trip-link" className="coupon coupon-press flex min-h-16 items-stretch hover:ring-1 hover:ring-ink/25" title={t.name}>
                    <span className="min-w-0 flex-1 px-4 py-3.5">
                      <span className="line-clamp-2 text-body font-semibold leading-snug [overflow-wrap:anywhere]">{t.name}</span>
                      <span className="block text-meta text-muted">
                        สร้างเมื่อ <span className="num font-num">{new Date(t.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </span>
                      {(settled.get(t.id)?.toSettle ?? 0) > 0 && (
                        <span className="mt-2 block">
                          <SettleStrip settled={settled.get(t.id)!.settled} total={settled.get(t.id)!.toSettle} compact />
                        </span>
                      )}
                    </span>
                    <span className="perf-y relative flex items-center gap-2 px-3.5">
                      <span className="halftone-stub absolute inset-y-0 left-0 w-10" aria-hidden />
                      <span className="serial relative">{tripSerial(t.id)}</span>
                      <ChevronRight className="relative size-5 text-muted" strokeWidth={1.75} aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="space-y-3 border-t border-line pt-5 text-meta text-muted">
          <p className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={1.75} aria-hidden />
            <span>
              แอปนี้ไม่ได้ถือหรือโอนเงิน เพียงบันทึกและสร้าง QR พร้อมเพย์ให้ ·{" "}
              <Link href="/privacy" className="-my-3 inline-flex min-h-12 items-center font-semibold text-ink underline">
                ข้อมูลที่เราเก็บ
              </Link>
            </span>
          </p>
          <Link href="/settings" className="btn-quiet -ml-3 text-muted">
            ตั้งค่า บัญชี และข้อมูลบนเครื่องนี้
          </Link>
        </footer>
      </main>
    </div>
  );
}

function sortTrips(ts: TripItem[]) {
  return [...ts].sort((x, y) => y.created_at.localeCompare(x.created_at));
}

const DEMO_FRIENDS = [
  { name: "ต้น", tint: "var(--color-t0)" },
  { name: "ฝน", tint: "var(--color-t1)" },
  { name: "บีม", tint: "var(--color-t2)" },
  { name: "มายด์", tint: "var(--color-t3)" },
];

const DEMO_DINNER_SATANG = 45000;

/**
 * Interactive coupon ticket demo: "฿450 dinner split among 3 friends -> ฿150 each"
 * with perforated edges, red serial, halftone shading, and a tactile green PAID stamp.
 */
function ExampleCoupon() {
  const [friends, setFriends] = useState<2 | 3 | 4>(3);
  const [stamped, setStamped] = useState(true);
  const [stampCount, setStampCount] = useState(0);

  const shareSatang = Math.round(DEMO_DINNER_SATANG / friends);
  const visibleFriends = DEMO_FRIENDS.slice(0, friends);
  const serial = `No. 0450-0${friends}`;

  function toggleStamp() {
    if (stamped) {
      setStamped(false);
    } else {
      setStampCount((c) => c + 1);
      setStamped(true);
    }
  }

  return (
    <figure className="example-coupon mt-5 max-w-md" aria-label="ตัวอย่างคูปอง: ค่าอาหารเย็น 450 บาท หาร 3 คน ได้คนละ 150 บาท">
      <div className="coupon text-ink">
        {stamped && <div className="halftone-header absolute inset-x-0 top-0 h-11" aria-hidden />}
        <div className="flex items-stretch">
          <div className="relative min-w-0 flex-1 px-3.5 py-3">
            <p className="flex items-baseline justify-between gap-2 text-meta font-semibold text-muted">
              <span>ตัวอย่างคูปอง</span>
              <span className="serial">{serial}</span>
            </p>
            <p className="mt-0.5 text-body font-semibold">
              ค่าอาหารเย็น{" "}
              <span className="text-meta font-medium text-muted">
                รวม <Baht satang={DEMO_DINNER_SATANG} className="font-semibold text-ink" />
              </span>
            </p>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {visibleFriends.map((m) => (
                  <MemberTile key={m.name} name={m.name} tint={m.tint} size={28} />
                ))}
                <span className="num font-num ml-1 text-meta font-medium text-muted">หาร {friends} คน</span>
              </div>

              {stamped ? (
                <span
                  key={stampCount}
                  className={`animate-stamp pointer-events-none inline-flex items-center gap-1 rounded-[6px] border-[2.5px] border-ok bg-paper/95 px-2 py-0.5 text-meta font-bold text-ok ${
                    stampCount === 0 ? "stamp-delayed" : ""
                  }`}
                >
                  <Check className="size-4" strokeWidth={2.5} aria-hidden />
                  <span>PAID · ได้รับเงินแล้ว</span>
                </span>
              ) : (
                <span className="chip border border-dashed border-wait bg-wait-soft text-wait">
                  รอประทับตรา PAID
                </span>
              )}
            </div>
          </div>

          <div
            className={`perf-y relative flex shrink-0 flex-col items-end justify-center px-3.5 transition-colors duration-150 ${
              stamped ? "border-ink/30" : "border-wait"
            }`}
          >
            <span className="halftone-stub absolute inset-y-0 left-0 w-10" aria-hidden />
            <span className="relative text-meta text-muted">คนละ</span>
            <Baht satang={shareSatang} className="relative text-title font-semibold leading-tight" />
          </div>
        </div>

        {/* Interactive controls inside coupon (outer 14px - 8px padding = 6px inner radius). */}
        <div className="perf-x flex flex-wrap items-center justify-between gap-2 bg-ground/60 p-2">
          <div className="flex items-center gap-1" role="group" aria-label="เลือกจำนวนคนหารตัวอย่าง">
            {([2, 3, 4] as const).map((count) => {
              const active = friends === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => setFriends(count)}
                  aria-pressed={active}
                  className={`num font-num min-h-10 rounded-[6px] px-2.5 text-meta font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                    active ? "bg-ink text-white" : "bg-paper text-ink ring-1 ring-line hover:ring-ink/35"
                  }`}
                >
                  {count} คน
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={toggleStamp}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-[6px] px-2.5 text-meta font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
              stamped
                ? "bg-paper text-muted ring-1 ring-line hover:text-ink"
                : "bg-ok text-white hover:bg-ok/90"
            }`}
          >
            {stamped ? (
              <>
                <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden />
                ลองประทับตราใหม่
              </>
            ) : (
              <>
                <Check className="size-3.5" strokeWidth={2} aria-hidden />
                ประทับตรา PAID
              </>
            )}
          </button>
        </div>
      </div>
    </figure>
  );
}
