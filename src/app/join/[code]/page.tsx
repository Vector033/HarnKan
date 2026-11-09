"use client";

import { Clock, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MemberTile, memberTint } from "@/components/ui";
import { ensureUser, supabase } from "@/lib/supabase/client";

interface Preview {
  trip_id: string;
  name: string;
  locked: boolean;
  already_member: boolean;
  pending_member: string | null;
  members: { id: string; nickname: string; claimed: boolean }[];
}

const PENDING_POLL_MS = 5000;
const MAX_CHIPS = 8;

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null | "missing" | "offline">(null);
  const [nickname, setNickname] = useState("");
  const [claim, setClaim] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const user = await ensureUser();
    if (!user) return setPreview("offline");
    const { data, error } = await supabase().rpc("trip_preview", { p_code: code });
    if (error) return setPreview(error.code ? "missing" : "offline");
    if (!data) return setPreview("missing");
    const p = data as unknown as Preview;
    if (p.already_member) return router.replace(`/t/${p.trip_id}`);
    setPreview(p);
    const { data: profile } = await supabase().from("profiles").select("nickname").maybeSingle();
    if (profile?.nickname) setNickname((n) => n || profile.nickname!);
  }, [code, router]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // While a claim waits for the owner, check back until it is approved or turned down.
  const waiting = typeof preview === "object" && preview?.pending_member;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void load(), PENDING_POLL_MS);
    return () => clearInterval(t);
  }, [waiting, load]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase().rpc("join_trip", {
      p_code: code,
      ...(claim ? { p_member_id: claim } : { p_nickname: nickname }),
    });
    setBusy(false);
    if (error) {
      setError(
        /nickname_taken/.test(error.message)
          ? "ชื่อเล่นนี้มีอยู่ในทริปแล้ว หากเป็นคุณ โปรดเลือกชื่อด้านบน หรือใช้ชื่ออื่น"
          : /already_claimed/.test(error.message)
            ? "มีผู้เลือกชื่อนี้ไปแล้ว"
            : /trip_locked/.test(error.message)
              ? "ทริปนี้ปิดรับสมาชิกใหม่แล้ว โปรดติดต่อเจ้าของทริป"
              : /trip_full/.test(error.message)
                ? "ทริปนี้มีสมาชิกครบ 50 คนแล้ว"
                : "เข้าทริปไม่สำเร็จ โปรดลองอีกครั้ง",
      );
      return;
    }
    const r = data as { trip_id: string; status: string };
    if (r.status === "pending") return void load();
    router.replace(`/t/${r.trip_id}`);
  }

  if (preview === null) return <Shell>กำลังเปิดลิงก์…</Shell>;
  if (preview === "missing")
    return <Shell>ไม่พบทริปนี้ ลิงก์อาจไม่ถูกต้อง หรือเจ้าของทริปสร้างลิงก์ใหม่แล้ว</Shell>;
  if (preview === "offline") return <Shell>ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเข้าทริปครั้งแรก</Shell>;

  const tint = (id: string) => memberTint(preview.members, id);
  const unclaimed = preview.members.filter((m) => !m.claimed);
  const pendingName = preview.members.find((m) => m.id === preview.pending_member)?.nickname;

  return (
    <div className="mx-auto min-h-dvh max-w-lg lg:grid lg:max-w-none lg:grid-cols-2">
      <header className="bg-ink px-5 pb-7 pt-[max(2.5rem,env(safe-area-inset-top))] text-white rounded-b-[28px] lg:rounded-none lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:items-end lg:justify-center lg:px-16 lg:py-16">
        <div className="lg:w-full lg:max-w-md">
          <h1 className={`font-bold [overflow-wrap:anywhere] ${[...preview.name].length > 24 ? "text-title" : "text-display"}`}>{preview.name}</h1>
          <p className="mt-2 text-body text-on-ink-muted">คุณได้รับเชิญเข้าทริปนี้</p>
          {!preview.locked && preview.members.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="สมาชิกในทริป">
              {preview.members.slice(0, MAX_CHIPS).map((m) => (
                <li key={m.id} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-white/10 py-1 pl-1 pr-2.5 text-meta">
                  <MemberTile name={m.nickname} tint={tint(m.id)} size={24} />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{m.nickname}</span>
                </li>
              ))}
              {preview.members.length > MAX_CHIPS && (
                <li className="flex items-center px-1 text-meta text-on-ink-muted">และอีก {preview.members.length - MAX_CHIPS} คน</li>
              )}
            </ul>
          )}
        </div>
      </header>

      <main className="px-4 pt-5 lg:w-full lg:max-w-xl lg:self-center lg:px-12 lg:py-16">
        {preview.pending_member ? (
          <div className="coupon flex gap-3 p-4" role="status">
            <Clock className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-bold">ส่งคำขอเป็น “{pendingName}” แล้ว</p>
              <p className="mt-1 text-body text-muted">
                เพื่อความปลอดภัย เจ้าของทริปต้องยืนยันก่อนว่าคุณคือ {pendingName} หน้านี้จะเปิดทริปให้เองเมื่อได้รับการยืนยัน
              </p>
            </div>
          </div>
        ) : preview.locked ? (
          <div className="coupon flex gap-3 p-4">
            <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-bold">ทริปนี้ปิดรับสมาชิกใหม่แล้ว</p>
              <p className="mt-1 text-body text-muted">
                ลิงก์อาจหมดอายุ (ลิงก์ใช้ได้ 7 วัน) หรือเจ้าของทริปล็อกไว้ โปรดขอลิงก์ใหม่จากเจ้าของทริป
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={join} className="coupon space-y-5 p-4">
            {unclaimed.length > 0 && (
              <fieldset>
                <legend className="label">เพื่อนเพิ่มชื่อคุณไว้แล้วหรือยัง</legend>
                <div className="flex flex-wrap gap-2">
                  {unclaimed.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setClaim(claim === m.id ? null : m.id)}
                      className={`btn pl-2 ${claim === m.id ? "border-ink ring-2 ring-ink" : ""}`}
                      aria-pressed={claim === m.id}
                    >
                      <MemberTile name={m.nickname} tint={tint(m.id)} size={28} />
                      <span className="min-w-0 [overflow-wrap:anywhere]">ฉันคือ {m.nickname}</span>
                    </button>
                  ))}
                </div>
                {claim && <p className="hint">เจ้าของทริปจะยืนยันก่อน แล้วคุณจะเข้าทริปได้</p>}
              </fieldset>
            )}
            {!claim && (
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
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </div>
            )}
            {error && (
              <p className="text-body text-owe" role="alert">
                {error}
              </p>
            )}
            <button className="btn-primary w-full" disabled={busy || (!claim && !nickname.trim())}>
              {busy ? "กำลังส่ง…" : claim ? "ขอเข้าทริปด้วยชื่อนี้" : "เข้าทริป"}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-meta text-muted">
          <Link href="/privacy" className="inline-flex min-h-12 items-center px-2 underline">
            ข้อมูลที่เราเก็บ
          </Link>
        </p>
      </main>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-6 text-center text-body text-muted">{children}</main>
  );
}
