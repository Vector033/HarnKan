"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureUser, supabase } from "@/lib/supabase/client";
import { allSnapshots } from "@/lib/trip/idb";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Trips cached on this device show first and are all there is offline.
      const cached = (await allSnapshots().catch(() => [])).map((s) => s.trip);
      if (!cancelled) setTrips(sortTrips(cached));
      const user = await ensureUser();
      if (!user) return;
      const { data } = await supabase().from("trips").select("id,name,created_at");
      if (!cancelled && data) setTrips(sortTrips(mergeTrips(cached, data)));
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
      setError("ต้องต่ออินเทอร์เน็ตเพื่อสร้างทริป");
      setBusy(false);
      return;
    }
    const { data, error } = await supabase().rpc("create_trip", { p_name: name, p_nickname: nickname });
    if (error) {
      setError(error.code ? "สร้างทริปไม่สำเร็จ ลองตรวจชื่ออีกครั้ง" : "ต้องต่ออินเทอร์เน็ตเพื่อสร้างทริป");
      setBusy(false);
      return;
    }
    router.push(`/t/${(data as { trip_id: string }).trip_id}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <header className="mb-8">
        <p className="text-sm font-medium text-brand">HarnKan</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">หารกัน</h1>
        <p className="mt-2 text-muted">จดค่าใช้จ่ายทริปพร้อมกันทั้งแก๊ง แล้วสรุปให้ว่าใครโอนให้ใครเท่าไร โดยให้โอนน้อยครั้งที่สุด</p>
      </header>

      <form onSubmit={create} className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">สร้างทริปใหม่</h2>
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
            placeholder="ที่เพื่อนเรียก"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-owe">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !name.trim() || !nickname.trim()}>
          {busy ? "กำลังสร้าง…" : "สร้างทริป"}
        </button>
        <p className="text-xs text-muted">ไม่ต้องสมัครสมาชิก เพื่อนเข้าผ่านลิงก์หรือ QR แล้วใส่ชื่อเล่นได้เลย</p>
      </form>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-muted">ทริปของฉัน</h2>
        {trips === null ? (
          <p className="text-sm text-muted">กำลังโหลด…</p>
        ) : trips.length === 0 ? (
          <p className="text-sm text-muted">ยังไม่มีทริป สร้างใหม่หรือเปิดลิงก์ที่เพื่อนส่งมา</p>
        ) : (
          <ul className="space-y-2">
            {trips.map((t) => (
              <li key={t.id}>
                <Link href={`/t/${t.id}`} className="card flex items-center justify-between px-4 py-3.5 active:bg-stone-50">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-sm text-muted">
                    {new Date(t.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-auto pt-10 text-center text-xs text-muted">
        แอปนี้ไม่ได้ถือหรือโอนเงิน แค่จดบันทึกและสร้าง QR พร้อมเพย์ให้
      </footer>
    </main>
  );
}

function mergeTrips(a: TripItem[], b: TripItem[]) {
  const m = new Map(a.map((t) => [t.id, t]));
  for (const t of b) m.set(t.id, t);
  return [...m.values()];
}

function sortTrips(ts: TripItem[]) {
  return [...ts].sort((x, y) => y.created_at.localeCompare(x.created_at));
}
