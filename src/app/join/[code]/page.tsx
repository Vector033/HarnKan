"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureUser, supabase } from "@/lib/supabase/client";

interface Preview {
  trip_id: string;
  name: string;
  already_member: boolean;
  members: { id: string; nickname: string; claimed: boolean }[];
}

export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null | "missing" | "offline">(null);
  const [nickname, setNickname] = useState("");
  const [claim, setClaim] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await ensureUser();
      if (!user) return setPreview("offline");
      const { data, error } = await supabase().rpc("trip_preview", { p_code: code });
      if (error) return setPreview(error.code ? "missing" : "offline");
      if (!data) return setPreview("missing");
      const p = data as unknown as Preview;
      if (p.already_member) return router.replace(`/t/${p.trip_id}`);
      setPreview(p);
    })();
  }, [code, router]);

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
          ? "ชื่อเล่นนี้มีในทริปแล้ว ถ้าเป็นคุณให้เลือกชื่อด้านบน หรือใช้ชื่ออื่น"
          : /already_claimed/.test(error.message)
            ? "มีคนเลือกชื่อนี้ไปแล้ว"
            : "เข้าทริปไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
      return;
    }
    router.replace(`/t/${(data as { trip_id: string }).trip_id}`);
  }

  if (preview === null) return <Shell>กำลังเปิดลิงก์…</Shell>;
  if (preview === "missing") return <Shell>ไม่พบทริปนี้ ลิงก์อาจพิมพ์ผิด</Shell>;
  if (preview === "offline") return <Shell>ต้องต่ออินเทอร์เน็ตเพื่อเข้าทริปครั้งแรก</Shell>;

  const unclaimed = preview.members.filter((m) => !m.claimed);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-sm font-medium text-brand">หารกัน · คำชวนเข้าทริป</p>
      <h1 className="mt-1 text-3xl font-bold">{preview.name}</h1>
      <p className="mt-2 text-muted">
        ในทริปมี {preview.members.map((m) => m.nickname).join(", ")}
      </p>

      <form onSubmit={join} className="card mt-6 space-y-4 p-5">
        {unclaimed.length > 0 && (
          <fieldset>
            <legend className="label">เพื่อนเพิ่มชื่อคุณไว้แล้วหรือยัง?</legend>
            <div className="flex flex-wrap gap-2">
              {unclaimed.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setClaim(claim === m.id ? null : m.id)}
                  className={`btn ${claim === m.id ? "border-brand bg-brand-soft text-brand" : ""}`}
                  aria-pressed={claim === m.id}
                >
                  ฉันคือ {m.nickname}
                </button>
              ))}
            </div>
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
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
        )}
        {error && <p className="text-sm text-owe">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || (!claim && !nickname.trim())}>
          {busy ? "กำลังเข้า…" : "เข้าทริป"}
        </button>
      </form>
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-5 text-muted">{children}</main>;
}
