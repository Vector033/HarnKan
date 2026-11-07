"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { tripSerial } from "@/components/trip/expenses-tab";
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Trips cached on this device show first and are all there is offline.
      const cached = (await allSnapshots().catch(() => [])).map((s) => s.trip);
      if (!cancelled) setTrips(sortTrips(cached));
      const user = await ensureUser();
      if (!user) return;
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
            ? "สร้างทริปไม่สำเร็จ โปรดตรวจชื่ออีกครั้ง"
            : "ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อสร้างทริป",
      );
      setBusy(false);
      return;
    }
    router.push(`/t/${(data as { trip_id: string }).trip_id}`);
  }

  async function wipe() {
    await forgetAll();
    await supabase().auth.signOut({ scope: "local" });
    setConfirmWipe(false);
    setTrips([]);
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <header className="bg-ink px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))] text-white">
        <h1 className="text-display font-bold leading-none">หารกัน</h1>
        <p className="mt-3 max-w-[30ch] text-body leading-relaxed text-[#cfe0da]">
          บันทึกค่าใช้จ่ายร่วมกันได้จากมือถือของทุกคน แล้วสรุปให้ว่าใครต้องโอนให้ใคร โดยโอนน้อยครั้งที่สุด
        </p>
      </header>

      <main className="space-y-8 px-4 pb-12 pt-5">
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

        <section aria-labelledby="mine-h">
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
                  <Link href={`/t/${t.id}`} className="coupon flex items-stretch hover:ring-1 hover:ring-ink/25">
                    <span className="min-w-0 flex-1 px-4 py-3.5">
                      <span className="block truncate text-body font-semibold">{t.name}</span>
                      <span className="text-meta text-muted">
                        สร้างเมื่อ {new Date(t.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
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

        <footer className="space-y-3 border-t border-line pt-5 text-meta text-muted">
          <p className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <span>
              แอปนี้ไม่ได้ถือหรือโอนเงิน เพียงบันทึกและสร้าง QR พร้อมเพย์ให้ ·{" "}
              <Link href="/privacy" className="font-semibold text-ink underline">
                ข้อมูลที่เราเก็บ
              </Link>
            </span>
          </p>
          {confirmWipe ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-owe-soft px-3 py-2.5">
              <p className="flex-1 text-owe">ลบทริปทั้งหมดที่เก็บไว้ในเครื่องนี้และออกจากระบบ? ข้อมูลบนเซิร์ฟเวอร์ยังอยู่ แต่เครื่องนี้จะเข้าทริปเดิมไม่ได้อีก</p>
              <button className="btn-danger" onClick={wipe}>
                ลบและออกจากระบบ
              </button>
              <button className="btn-quiet" onClick={() => setConfirmWipe(false)}>
                ยกเลิก
              </button>
            </div>
          ) : (
            <button className="btn-quiet -ml-3 text-muted" onClick={() => setConfirmWipe(true)}>
              ใช้เครื่องคนอื่นอยู่? ลบข้อมูลบนเครื่องนี้
            </button>
          )}
        </footer>
      </main>
    </div>
  );
}

function sortTrips(ts: TripItem[]) {
  return [...ts].sort((x, y) => y.created_at.localeCompare(x.created_at));
}
