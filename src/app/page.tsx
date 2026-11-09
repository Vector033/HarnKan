"use client";

import { Check, ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { tripSerial } from "@/components/trip/expenses-tab";
import { Baht, MemberTile, SettleStrip } from "@/components/ui";
import { settlement } from "@/lib/trip/derive";
import { ensureUser, supabase } from "@/lib/supabase/client";
import { allSnapshots, forgetAll } from "@/lib/trip/idb";

interface TripItem {
  id: string;
  name: string;
  created_at: string;
}

export default function Home() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripItem[] | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  // Trips opened on this device carry their data, so their coupon can show how settled they are.
  const [settled, setSettled] = useState<Map<string, { settled: number; toSettle: number }>>(new Map());
  // null until known; email is set once this browser is tied to a Google account.
  const [account, setAccount] = useState<{ email: string | null } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

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
      // Back from Google: the client has already traded the code for a session; tidy the URL.
      const back = new URLSearchParams(location.search);
      const user = await ensureUser(); // waits for the client to read the code from the URL
      if (back.size) history.replaceState(null, "", location.pathname);
      if (!user) return;
      if (back.get("error_code") === "identity_already_exists") setAuthError("taken");
      else if (back.get("error")) setAuthError("failed");
      const { data: s } = await supabase().auth.getSession();
      if (!cancelled) setAccount({ email: s.session?.user.is_anonymous ? null : (s.session?.user.email ?? "") });
      const { data } = await supabase().from("trips").select("id,name,created_at");
      if (!cancelled && data) setTrips(sortTrips(data));
      const { data: me } = await supabase().from("members").select("nickname").eq("user_id", user).limit(1);
      if (!cancelled && me?.[0]) setNickname((n) => n || me[0].nickname);
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

  // A guest with trips keeps them by linking Google to this same user; with none, it just signs in.
  async function google(signIn = false) {
    setAuthError(null);
    const auth = supabase().auth;
    const options = { redirectTo: `${location.origin}/` };
    // Switching to another account: this browser's guest trips will not open under it.
    if (signIn && trips?.length) await forgetAll();
    const { error } =
      signIn || !trips?.length
        ? await auth.signInWithOAuth({ provider: "google", options })
        : await auth.linkIdentity({ provider: "google", options });
    if (error) setAuthError("failed");
  }

  async function wipe() {
    await forgetAll();
    await supabase().auth.signOut({ scope: "local" });
    setConfirmWipe(false);
    setAccount({ email: null });
    setTrips([]);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg lg:grid lg:max-w-none lg:grid-cols-2">
      <header className="bg-ink px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))] text-white rounded-b-[28px] lg:rounded-none lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:items-end lg:justify-center lg:px-16 lg:py-16">
        <div className="lg:w-full lg:max-w-md">
          <h1 className="text-display font-bold">หารกัน</h1>
          <p className="mt-2 max-w-[30ch] text-body leading-relaxed text-on-ink-muted">
            บันทึกค่าใช้จ่ายร่วมกันได้จากมือถือของทุกคน แล้วสรุปให้ว่าใครต้องโอนให้ใคร <span className="whitespace-nowrap">โดยโอนน้อยครั้งที่สุด</span>
          </p>
          {trips !== null && trips.length === 0 && <ExampleCoupon />}
        </div>
      </header>

      <main className="flex flex-col gap-8 px-4 pb-12 pt-5 lg:w-full lg:max-w-xl lg:self-center lg:px-12 lg:py-16">
        <form onSubmit={create} className="coupon" aria-labelledby="create-h">
          <div className="space-y-5 p-4">
            <h2 id="create-h" className="text-body font-bold">
              สร้างทริปใหม่
            </h2>
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
                      <span className="text-meta text-muted">
                        สร้างเมื่อ {new Date(t.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {(settled.get(t.id)?.toSettle ?? 0) > 0 && (
                        <span className="mt-2 block">
                          <SettleStrip settled={settled.get(t.id)!.settled} total={settled.get(t.id)!.toSettle} compact />
                        </span>
                      )}
                    </span>
                    <span className="perf-y flex items-center gap-2 px-3.5">
                      <span className="serial">{tripSerial(t.id)}</span>
                      <ChevronRight className="size-5 text-muted" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {GOOGLE && account && (
          <section aria-labelledby="account-h" className="space-y-2.5" data-testid="account">
            <h2 id="account-h" className="text-body font-bold">
              บัญชี
            </h2>
            {account.email !== null ? (
              <p className="text-body text-muted">
                ทริปทั้งหมดเก็บไว้กับบัญชี Google <span className="font-semibold text-ink [overflow-wrap:anywhere]">{account.email}</span> เข้าสู่ระบบที่เครื่องอื่นเพื่อเปิดทริปเดิมได้
              </p>
            ) : authError === "taken" ? (
              <div className="space-y-2.5 rounded-lg bg-owe-soft px-3.5 py-3" role="alert">
                <p className="text-body text-owe">
                  บัญชี Google นี้ใช้กับเครื่องอื่นอยู่แล้ว เข้าสู่ระบบด้วยบัญชีนั้นได้ แต่ทริปที่เปิดไว้บนเครื่องนี้แบบไม่มีบัญชีจะเปิดไม่ได้อีก
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-danger" onClick={() => google(true)}>
                    เข้าสู่ระบบด้วยบัญชีนั้น
                  </button>
                  <button className="btn-quiet" onClick={() => setAuthError(null)}>
                    ยกเลิก
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-body text-muted">
                  {trips?.length
                    ? "ตอนนี้ทริปผูกกับเบราว์เซอร์นี้เท่านั้น เชื่อมกับ Google ไว้เพื่อเปิดทริปจากเครื่องอื่นหรือหลังล้างข้อมูลเบราว์เซอร์ได้"
                    : "หากเคยเชื่อมกับ Google ไว้ เข้าสู่ระบบเพื่อเปิดทริปเดิมได้ ถ้าไม่เข้าก็ใช้งานได้ตามปกติ"}
                </p>
                <button className="btn w-full" onClick={() => google()}>
                  <GoogleMark /> {trips?.length ? "เชื่อมกับ Google" : "เข้าสู่ระบบด้วย Google"}
                </button>
                {authError === "failed" && (
                  <p className="text-body text-owe" role="alert">
                    เชื่อมกับ Google ไม่สำเร็จ โปรดลองอีกครั้ง
                  </p>
                )}
              </>
            )}
          </section>
        )}

        <footer className="space-y-3 border-t border-line pt-5 text-meta text-muted">
          <p className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <span>
              แอปนี้ไม่ได้ถือหรือโอนเงิน เพียงบันทึกและสร้าง QR พร้อมเพย์ให้ ·{" "}
              <Link href="/privacy" className="-my-3 inline-flex min-h-12 items-center font-semibold text-ink underline">
                ข้อมูลที่เราเก็บ
              </Link>
            </span>
          </p>
          {confirmWipe ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-owe-soft px-3 py-2.5">
              <p className="flex-1 text-owe">
                {account?.email
                  ? "ออกจากระบบและลบทริปที่เก็บไว้ในเครื่องนี้? ทริปยังอยู่ในบัญชี Google เข้าสู่ระบบใหม่เพื่อเปิดอีกครั้ง"
                  : "ลบทริปทั้งหมดที่เก็บไว้ในเครื่องนี้และออกจากระบบ? ข้อมูลบนเซิร์ฟเวอร์ยังอยู่ แต่เครื่องนี้จะเข้าทริปเดิมไม่ได้อีก"}
              </p>
              <button className="btn-danger" onClick={wipe} autoFocus>
                ลบและออกจากระบบ
              </button>
              <button className="btn-quiet" onClick={() => setConfirmWipe(false)}>
                ยกเลิก
              </button>
            </div>
          ) : (
            <button className="btn-quiet -ml-3 text-muted" onClick={() => setConfirmWipe(true)}>
              {account?.email ? "ออกจากระบบ" : "ใช้เครื่องคนอื่นอยู่? ลบข้อมูลบนเครื่องนี้"}
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

/** Google sign-in shows only where the provider is set up (README "Google sign-in"). */
const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true";

/** Google's "G", in its own colours as its brand rules ask. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function sortTrips(ts: TripItem[]) {
  return [...ts].sort((x, y) => y.created_at.localeCompare(x.created_at));
}

const EXAMPLE = [
  { name: "ต้น", tint: "var(--color-t0)" },
  { name: "ฝน", tint: "var(--color-t1)" },
  { name: "บีม", tint: "var(--color-t2)" },
];

/**
 * First visit only: one example coupon shows what the app does, in its own
 * language. Three friends, one bill, one share each, and the stamp the
 * receiver puts on a payment. Labelled as an example; it is not data.
 */
function ExampleCoupon() {
  return (
    <figure className="example-coupon mt-5 max-w-sm" aria-label="ตัวอย่าง: ค่าหมูกระทะ 450 บาท หาร 3 คน ได้คนละ 150 บาท">
      <div className="coupon flex items-stretch text-ink" aria-hidden>
        <div className="relative min-w-0 flex-1 px-3.5 py-3">
          <p className="flex items-baseline justify-between gap-2 text-meta font-semibold text-muted">
            ตัวอย่าง <span className="serial">No. 0450-03</span>
          </p>
          <p className="mt-0.5 text-body font-semibold">
            ค่าหมูกระทะ <span className="text-meta font-medium text-muted">รวม <Baht satang={45000} /></span>
          </p>
          <p className="mt-2 flex items-center gap-1.5">
            {EXAMPLE.map((m) => (
              <MemberTile key={m.name} name={m.name} tint={m.tint} size={28} />
            ))}
          </p>
          <span className="stamp pointer-events-none absolute bottom-2.5 right-2 inline-flex items-center gap-1 rounded-md border-[2.5px] border-ok bg-paper/90 px-2 py-0.5 text-meta font-bold text-ok">
            <Check className="size-4" strokeWidth={3} />
            ได้รับเงินแล้ว
          </span>
        </div>
        <div className="perf-y flex shrink-0 flex-col items-end justify-center border-ink/30 px-3.5">
          <span className="text-meta text-muted">คนละ</span>
          <Baht satang={15000} className="text-title font-semibold leading-tight" />
        </div>
      </div>
    </figure>
  );
}
