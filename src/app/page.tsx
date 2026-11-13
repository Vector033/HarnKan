"use client";

import { Check, ChevronRight, MapPin, Pause, Play, RotateCcw, Settings, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { tripSerial } from "@/components/trip/expenses-tab";
import { CouponShader } from "@/components/coupon-shader";
import { Baht, MemberTile, SettleStrip } from "@/components/ui";
import { formatBaht } from "@/lib/core/money";
import { playStampThud } from "@/lib/sound";
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
      <header className="ink-band relative overflow-hidden rounded-b-[28px] bg-ink px-5 pb-8 pt-[max(2.25rem,env(safe-area-inset-top))] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:items-center lg:justify-center lg:overflow-y-auto lg:rounded-none lg:px-12 lg:py-10">
        <CouponShader className="absolute inset-0 opacity-[0.11] mix-blend-screen" />
        <HeroContourBackdrop />
        {/* Hack 8 Radial Text Scrim: protects Hero headline contrast over contours and GPU shader. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 85% 60% at 50% 24%, rgb(20 48 43 / 0.72) 0%, transparent 100%)",
          }}
        />
        <div className="relative z-10 w-full lg:max-w-lg">
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
            หารค่ากิน <span className="whitespace-nowrap">ค่าเที่ยว</span>กับเพื่อน
            <span className="whitespace-nowrap">ได้ทันที</span>{" "}
            <span className="whitespace-nowrap">สลิปเดียวรู้เรื่อง</span>
          </h1>
          <p className="mt-2 max-w-[38ch] text-body leading-relaxed text-on-ink-muted">
            ไม่ต้องทวงเพื่อนให้เกรงใจ ไม่ต้องคิดเลขเอง สรุปยอดโอน<span className="whitespace-nowrap">ให้น้อยครั้งที่สุด</span>{" "}
            พร้อม <span className="whitespace-nowrap">QR พร้อมเพย์</span>
          </p>
          <div className={showMobileDemo ? "block" : "hidden lg:block"}>
            <ExampleCoupon />
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-8 px-4 pb-12 pt-5 lg:mx-auto lg:w-full lg:max-w-xl lg:self-center lg:px-12 lg:py-14">
        <form onSubmit={create} className="coupon" aria-labelledby="create-h">
          <div className="relative space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="create-h" className="text-body font-bold">
                สร้างทริปใหม่
              </h2>
              <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-meta text-muted" aria-label="ขั้นตอนใช้งาน">
                {ONBOARDING_STEPS.map((step) => (
                  <li key={step.n} className="inline-flex items-center gap-1">
                    <span className="num font-num inline-grid size-5 place-items-center rounded-[4px] bg-ground text-meta leading-none font-semibold text-ink">
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
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="ตัวอย่างคำที่ใช้บ่อย">
                {QUICK_TRIPS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setName(preset)}
                    className={`min-h-12 rounded-lg border px-3 py-1.5 text-meta font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] ${
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
              <p className="flex items-start gap-2 rounded-lg bg-owe-soft px-3.5 py-2.5 text-body text-owe" role="alert">
                <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>{error}</span>
              </p>
            )}
            <button className="btn-primary w-full" disabled={busy || !name.trim() || !nickname.trim()}>
              {busy ? "กำลังสร้าง…" : "สร้างทริป"}
            </button>
          </div>
          <p className="perf-x px-4 py-3 text-meta text-muted">
            <span className="whitespace-nowrap font-semibold text-ink">สร้างทริปใน 2 แตะ</span> ·{" "}
            <span className="whitespace-nowrap">ไม่ต้องล็อกอิน</span> ·{" "}
            <span className="whitespace-nowrap">ใช้ได้แม้ออฟไลน์</span> — เพื่อนเข้าลิงก์แล้วใส่<span className="whitespace-nowrap">ชื่อเล่นได้เลย</span>
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
                      <span className="line-clamp-2 break-words text-body font-semibold leading-snug">{t.name}</span>
                      <span className="block text-meta text-muted">
                        สร้างเมื่อ <span className="num font-num">{new Date(t.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </span>
                      {(settled.get(t.id)?.toSettle ?? 0) > 0 && (
                        <span className="mt-2 block">
                          <SettleStrip settled={settled.get(t.id)!.settled} total={settled.get(t.id)!.toSettle} compact />
                        </span>
                      )}
                    </span>
                    <span className="perf-y perf-notch relative flex items-center gap-2 px-3.5">
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
              แอปนี้ไม่ได้ถือหรือโอนเงิน เพียงบันทึกและสร้าง{" "}
              <span className="whitespace-nowrap">QR พร้อมเพย์ให้</span> ·{" "}
              <Link href="/privacy" className="-my-3 inline-flex min-h-12 items-center whitespace-nowrap font-semibold text-ink underline">
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

/** #13 Contour Lines: lightweight inline SVG elevation lines behind the ink hero. */
function HeroContourBackdrop() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
      style={{
        WebkitMaskImage: "radial-gradient(ellipse 90% 85% at 50% 50%, #000 35%, transparent 100%)",
        maskImage: "radial-gradient(ellipse 90% 85% at 50% 50%, #000 35%, transparent 100%)",
      }}
    >
      <g fill="none" stroke="var(--color-t1)" strokeWidth="1.25">
        <path d="M-80,140 C120,60 280,220 480,150 C660,90 740,210 880,160" />
        <path d="M-60,210 C130,130 270,290 490,220 C670,160 760,270 890,230" />
        <path d="M-90,300 C110,230 260,380 510,310 C690,260 760,360 900,330" />
        <path d="M-70,420 C140,350 280,490 500,430 C690,380 750,470 880,440" />
        <path d="M-80,560 C130,490 300,640 520,570 C700,515 760,600 900,560" />
        <path d="M-60,690 C150,620 290,760 510,695 C690,640 770,730 890,690" />
        <path d="M-90,810 C120,740 310,870 530,810 C710,760 760,840 900,805" />
      </g>
    </svg>
  );
}

const DEMO_FRIENDS = [
  { name: "ต้น", tint: "var(--color-t0)" },
  { name: "ฝน", tint: "var(--color-t1)" },
  { name: "บีม", tint: "var(--color-t2)" },
  { name: "มายด์", tint: "var(--color-t3)" },
];

const TRIP_STOPS = [
  {
    id: "dinner",
    short: "อาหาร",
    title: "ค่าอาหารเย็น",
    amountSatang: 45000,
    payer: "ต้น",
    payerTint: "var(--color-t0)",
    serialPrefix: "0450",
    posClass: "left-2.5 bottom-2.5",
    cx: 66,
    cy: 78,
  },
  {
    id: "cafe",
    short: "คาเฟ่",
    title: "ค่ากาแฟชมวิว",
    amountSatang: 24000,
    payer: "ฝน",
    payerTint: "var(--color-t1)",
    serialPrefix: "0240",
    posClass: "left-1/2 top-2.5 -translate-x-1/2",
    cx: 210,
    cy: 30,
  },
  {
    id: "stay",
    short: "ที่พัก",
    title: "ที่พักบ้านสวน",
    amountSatang: 180000,
    payer: "บีม",
    payerTint: "var(--color-t2)",
    serialPrefix: "1800",
    posClass: "right-2.5 bottom-3",
    cx: 354,
    cy: 72,
  },
] as const;

const TOTAL_DEMO_SATANG = TRIP_STOPS.reduce((sum, s) => sum + s.amountSatang, 0);

/**
 * Hybrid interactive hero showcase:
 * 1) Mini Trip Route Map (3 clickable expense pins along an animated dashed route)
 * 2) Connected Interactive Coupon Ticket (2/3/4 friends split + tactile PAID rubber stamp)
 */
function ExampleCoupon() {
  const [stopIdx, setStopIdx] = useState(0);
  const [friends, setFriends] = useState<2 | 3 | 4>(3);
  const [stamped, setStamped] = useState(true);
  const [stampCount, setStampCount] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    if (!autoPlay) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setStopIdx((i) => (i + 1) % TRIP_STOPS.length);
      setStamped(true);
      setStampCount((c) => c + 1);
    }, 4500);
    return () => clearInterval(t);
  }, [autoPlay]);

  const stop = TRIP_STOPS[stopIdx];
  const shareSatang = Math.round(stop.amountSatang / friends);
  const visibleFriends = DEMO_FRIENDS.slice(0, friends);
  const serial = `No. ${stop.serialPrefix}-0${friends}`;

  function selectStop(idx: number) {
    setAutoPlay(false);
    setStopIdx(idx);
    setStamped(true);
    setStampCount((c) => c + 1);
  }

  function selectFriends(count: 2 | 3 | 4) {
    setAutoPlay(false);
    setFriends(count);
  }

  function toggleStamp() {
    setAutoPlay(false);
    if (stamped) {
      setStamped(false);
    } else {
      setStampCount((c) => c + 1);
      setStamped(true);
      playStampThud();
    }
  }

  return (
    <figure className="mt-5 w-full space-y-2.5" aria-label="แผนที่ทริปตัวอย่างและคูปองหารค่าใช้จ่าย">
      {/* Mini Interactive Trip Route Map (outer 14px - 8px padding = 6px inner radius). */}
      <div className="rounded-[var(--radius-coupon)] border border-white/15 bg-black/25 p-2">
        <div className="flex items-center justify-between gap-2 px-1.5 pb-2 text-meta text-on-ink-muted">
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold text-white">
            <MapPin className="size-4 text-t1" strokeWidth={1.75} aria-hidden />
            เส้นทางทริป
          </span>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <span className="num font-num text-on-ink-muted">
              รวม <span className="font-semibold text-white">{formatBaht(TOTAL_DEMO_SATANG)} ฿</span> · โอน <span className="font-semibold text-t1">2</span> ครั้ง
            </span>
            <button
              type="button"
              onClick={() => setAutoPlay((v) => !v)}
              aria-label={autoPlay ? "หยุดเล่นอัตโนมัติ" : "เล่นอัตโนมัติ"}
              className="relative grid size-8 place-items-center rounded-md border border-white/15 bg-white/10 after:absolute after:-inset-[9px] after:content-[''] text-white transition-transform duration-150 hover:bg-white/15 active:scale-95"
            >
              {autoPlay ? <Pause className="size-3.5" strokeWidth={1.75} aria-hidden /> : <Play className="size-3.5" strokeWidth={1.75} aria-hidden />}
            </button>
          </div>
        </div>

        <div className="relative h-28 overflow-hidden rounded-md border border-white/12 bg-ink/80">
          {/* Vector terrain & animated dashed route connecting the 3 stops */}
          <svg viewBox="0 0 420 112" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            <g fill="none" stroke="var(--color-t1)" strokeOpacity="0.07" strokeWidth="0.75">
              <line x1="105" y1="0" x2="105" y2="112" />
              <line x1="210" y1="0" x2="210" y2="112" />
              <line x1="315" y1="0" x2="315" y2="112" />
              <line x1="0" y1="56" x2="420" y2="56" />
            </g>
            <g fill="none" stroke="var(--color-t1)" strokeOpacity="0.14" strokeWidth="1">
              <path d="M-20,32 Q110,12 220,44 T440,26" />
              <path d="M-20,86 Q130,62 250,92 T440,74" />
            </g>
            {/* Base route path */}
            <path
              d="M 66 78 C 128 66, 148 30, 210 30 C 272 30, 294 64, 354 72"
              fill="none"
              stroke="var(--color-on-ink-muted)"
              strokeOpacity="0.32"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            {/* Animated dashed flow */}
            <path
              d="M 66 78 C 128 66, 148 30, 210 30 C 272 30, 294 64, 354 72"
              fill="none"
              stroke="var(--color-t1)"
              strokeWidth="2.2"
              strokeDasharray="6 6"
              className="route-flow"
            />
            {/* Active pin beacon ring */}
            <circle
              cx={stop.cx}
              cy={stop.cy}
              r="14"
              fill="none"
              stroke="var(--color-t1)"
              strokeWidth="1.75"
              className="pin-ripple"
            />
          </svg>

          {/* 3 Clickable Map Pins */}
          {TRIP_STOPS.map((item, idx) => {
            const active = idx === stopIdx;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectStop(idx)}
                aria-pressed={active}
                className={`absolute ${item.posClass} inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 py-1 text-meta font-semibold shadow-sm after:absolute after:-inset-1.5 after:content-[''] transition-[transform,background-color,box-shadow] duration-200 active:scale-95 ${
                  active
                    ? "z-10 scale-[1.03] bg-paper text-ink ring-2 ring-t1"
                    : "bg-ink-2/95 text-white ring-1 ring-white/25 hover:bg-ink-2"
                }`}
              >
                <span
                  className="paper-tint inline-grid size-5 shrink-0 place-items-center rounded-[4px] text-meta leading-none font-bold text-ink"
                  style={{ background: item.payerTint }}
                >
                  {idx + 1}
                </span>
                <span className="whitespace-nowrap">
                  {item.short} <span className="num font-num">{formatBaht(item.amountSatang)}฿</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Connected Interactive Coupon Ticket */}
      <div key={stop.id} className="example-coupon coupon text-ink">
        {stamped && <div className="halftone-header absolute inset-x-0 top-0 h-11" aria-hidden />}
        <div className="flex items-stretch">
          <div className="relative min-w-0 flex-1 px-3.5 py-3">
            <p className="flex items-baseline justify-between gap-2 text-meta font-semibold text-muted">
              <span>จุดที่ <span className="num font-num">{stopIdx + 1}/3</span> · {stop.payer}จ่ายก่อน</span>
              <span className="serial">{serial}</span>
            </p>
            <p className="mt-0.5 text-body font-semibold">
              {stop.title}{" "}
              <span className="text-meta font-medium text-muted">
                รวม <Baht satang={stop.amountSatang} className="font-semibold text-ink" />
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
                  className={`animate-stamp pointer-events-none inline-flex items-center gap-1 rounded-md border-[2.5px] border-ok bg-paper/95 px-2 py-0.5 text-meta font-bold text-ok ${
                    stampCount === 0 ? "stamp-delayed" : ""
                  }`}
                >
                  <Check className="size-4" strokeWidth={2.5} aria-hidden />
                  <span>ได้รับเงินแล้ว</span>
                </span>
              ) : (
                <span className="chip border border-dashed border-wait bg-wait-soft text-wait">
                  รอประทับตรา
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
                  onClick={() => selectFriends(count)}
                  aria-pressed={active}
                  className={`num font-num min-h-12 rounded-md px-3 text-meta font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
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
            className={`inline-flex min-h-12 items-center gap-1.5 rounded-md px-3 text-meta font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
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
                ประทับตรา
              </>
            )}
          </button>
        </div>
      </div>
    </figure>
  );
}
