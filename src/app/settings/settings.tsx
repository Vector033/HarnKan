"use client";

import { Check, ShieldCheck, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { InkBandWatermark } from "@/components/ui";
import { promptPayKind } from "@/lib/core/promptpay";
import { useStampSound } from "@/lib/sound";
import { ensureUser, supabase } from "@/lib/supabase/client";
import { forgetAll } from "@/lib/trip/idb";

/** Google sign-in shows only where the provider is set up (README "Google sign-in"). */
const GOOGLE = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true";

interface Me {
  id: string;
  email: string | null; // null for a guest
  hasTrips: boolean;
}

export function Settings() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null | "offline">(null);
  const [authError, setAuthError] = useState<"taken" | "failed" | null>(null);
  const [profile, setProfile] = useState({ nickname: "", promptpay: "", payee: "" });
  const [saved, setSaved] = useState(profile);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [others, setOthers] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [soundOn, setSoundOn] = useStampSound();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const back = new URLSearchParams(location.search);
      const id = await ensureUser(); // waits for the client to read a Google code from the URL
      if (back.size) history.replaceState(null, "", location.pathname);
      if (cancelled) return;
      if (!id) return setMe("offline");
      if (back.get("error_code") === "identity_already_exists") setAuthError("taken");
      else if (back.get("error")) setAuthError("failed");
      const sb = supabase();
      const [{ data: s }, { count }, { data: p }] = await Promise.all([
        sb.auth.getSession(),
        sb.from("members").select("id", { count: "exact", head: true }).eq("user_id", id),
        sb.from("profiles").select("nickname,promptpay_id,payee_name").maybeSingle(),
      ]);
      if (cancelled) return;
      const user = s.session?.user;
      setMe({ id, email: user && !user.is_anonymous ? (user.email ?? "") : null, hasTrips: (count ?? 0) > 0 });
      const loaded = { nickname: p?.nickname ?? "", promptpay: p?.promptpay_id ?? "", payee: p?.payee_name ?? "" };
      setProfile(loaded);
      setSaved(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A guest with trips keeps them by linking Google to this same user; with none, it just signs in.
  async function google(signIn = false) {
    if (me === null || me === "offline") return;
    setAuthError(null);
    const auth = supabase().auth;
    const options = { redirectTo: `${location.origin}/settings` };
    // Switching to another account: this browser's guest trips will not open under it.
    if (signIn && me.hasTrips) await forgetAll();
    const { error } =
      signIn || !me.hasTrips
        ? await auth.signInWithOAuth({ provider: "google", options })
        : await auth.linkIdentity({ provider: "google", options });
    if (error) setAuthError("failed");
  }

  const digits = profile.promptpay.replace(/\D/g, "");
  const ppValid = digits === "" || promptPayKind(digits) !== null;
  const dirty = profile.nickname.trim() !== saved.nickname || digits !== saved.promptpay || profile.payee.trim() !== saved.payee;

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (me === null || me === "offline" || !ppValid) return;
    const row = {
      user_id: me.id,
      nickname: profile.nickname.trim() || null,
      promptpay_id: digits || null,
      payee_name: profile.payee.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase().from("profiles").upsert(row);
    if (error) return setStatus({ ok: false, text: "บันทึกไม่สำเร็จ โปรดลองอีกครั้ง" });
    const next = { nickname: row.nickname ?? "", promptpay: row.promptpay_id ?? "", payee: row.payee_name ?? "" };
    setProfile(next);
    setSaved(next);
    setStatus({ ok: true, text: "บันทึกแล้ว ใช้กับทริปที่สร้างหรือเข้าหลังจากนี้" });
  }

  async function signOutOthers() {
    const { error } = await supabase().auth.signOut({ scope: "others" });
    setOthers(error ? "ทำรายการไม่สำเร็จ โปรดลองอีกครั้ง" : "ออกจากระบบเครื่องอื่นทั้งหมดแล้ว");
  }

  async function wipe() {
    await forgetAll();
    await supabase().auth.signOut({ scope: "local" });
    router.push("/");
  }

  const ready = me !== null && me !== "offline";
  const account = ready ? me : null;

  return (
    <div className="min-h-dvh">
      <header className="ink-band rounded-b-[28px] bg-ink px-5 pb-7 pt-[max(2.5rem,env(safe-area-inset-top))] text-white">
        <InkBandWatermark variant="bar" />
        <div className="relative z-10 mx-auto max-w-lg lg:max-w-3xl lg:px-4">
          <Link href="/" className="-ml-2 inline-flex min-h-12 items-center whitespace-nowrap px-2 text-body font-medium text-on-ink-muted underline">
            หารกัน
          </Link>
          <h1 className="mt-1 text-display font-bold leading-tight">ตั้งค่า</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-8 px-4 pb-14 pt-6 lg:max-w-3xl">
        {me === null && <p className="text-body text-muted">กำลังโหลด…</p>}
        {me === "offline" && <p className="text-body text-muted">ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเปิดหน้าตั้งค่า</p>}

        {account && (
          <>
            <Section id="account-h" title="บัญชี">
              <Row
                title="วิธีเข้าใช้"
                hint={account.email !== null ? "เข้าสู่ระบบที่เครื่องอื่นด้วยบัญชีนี้ เพื่อเปิดทริปเดิมได้" : "ทริปผูกกับเบราว์เซอร์นี้เท่านั้น ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่องจะเปิดไม่ได้"}
              >
                {account.email !== null ? (
                  <p className="flex items-center gap-2.5 text-body" data-testid="signed-in">
                    <GoogleMark />
                    <span className="min-w-0 break-all font-semibold">{account.email}</span>
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-body font-semibold">ไม่มีบัญชี (ใช้แบบ guest)</p>
                    {GOOGLE && authError === "taken" ? (
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
                    ) : GOOGLE ? (
                      <>
                        <button className="btn w-full lg:w-auto" onClick={() => google()}>
                          <GoogleMark /> {account.hasTrips ? "เชื่อมกับ Google" : "เข้าสู่ระบบด้วย Google"}
                        </button>
                        {!account.hasTrips && <p className="text-meta text-muted">หากเคยเชื่อมกับ Google ไว้ เข้าสู่ระบบเพื่อเปิดทริปเดิมได้ ถ้าไม่เข้าก็ใช้งานได้ตามปกติ</p>}
                        {authError === "failed" && (
                          <p className="text-body text-owe" role="alert">
                            เชื่อมกับ Google ไม่สำเร็จ โปรดลองอีกครั้ง
                          </p>
                        )}
                      </>
                    ) : null}
                  </div>
                )}
              </Row>
            </Section>

            <Section id="defaults-h" title="ข้อมูลตั้งต้นสำหรับทริปใหม่" note="ใส่ให้อัตโนมัติเมื่อสร้างหรือเข้าทริปหลังจากนี้ ทริปเดิมไม่เปลี่ยน แก้ได้ในแท็บสมาชิกของแต่ละทริป">
              <form onSubmit={saveProfile} aria-labelledby="defaults-h">
                <Row title="ชื่อเล่น" hint="ชื่อที่เพื่อนในทริปเห็น" htmlFor="d-nickname">
                  <input
                    id="d-nickname"
                    className="input"
                    maxLength={30}
                    autoComplete="nickname"
                    placeholder="ชื่อที่เพื่อนเรียก"
                    value={profile.nickname}
                    onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                  />
                </Row>
                <Row title="เบอร์มือถือหรือเลขพร้อมเพย์" hint="เพื่อนจะได้ QR ที่ใส่ยอดไว้ให้แล้ว แนะนำให้ใช้เบอร์มือถือ เพราะสมาชิกในทริปจะเห็นเลขนี้" htmlFor="d-promptpay">
                  <input
                    id="d-promptpay"
                    className="input num"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="08x-xxx-xxxx"
                    value={profile.promptpay}
                    aria-invalid={!ppValid}
                    aria-describedby={!ppValid ? "d-promptpay-error" : undefined}
                    onChange={(e) => setProfile({ ...profile, promptpay: e.target.value })}
                  />
                  {!ppValid && (
                    <p id="d-promptpay-error" className="mt-1.5 text-meta text-owe">
                      โปรดใส่เบอร์มือถือ 10 หลัก หรือเลขพร้อมเพย์ 13 หรือ 15 หลัก
                    </p>
                  )}
                </Row>
                <Row title="ชื่อที่ขึ้นในสลิป (ไม่บังคับ)" hint="ช่วยให้จับคู่สลิปที่เพื่อนโอนมาได้แม่นยำขึ้น" htmlFor="d-payee">
                  <input
                    id="d-payee"
                    className="input"
                    maxLength={80}
                    placeholder="เช่น ณวัฒน์ ว."
                    value={profile.payee}
                    onChange={(e) => setProfile({ ...profile, payee: e.target.value })}
                  />
                </Row>
                <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3.5">
                  <p className="flex-1 text-meta text-muted" role="status">
                    {status?.ok && !dirty && (
                      <span className="inline-flex items-center gap-1.5 text-ok">
                        <Check className="size-4" aria-hidden /> {status.text}
                      </span>
                    )}
                    {status && !status.ok && <span className="text-owe">{status.text}</span>}
                  </p>
                  <button className="btn-primary w-full lg:w-auto" disabled={!ppValid || !dirty}>
                    บันทึก
                  </button>
                </div>
              </form>
            </Section>

            <Section id="security-h" title="ความปลอดภัย">
              <Row title="รหัสผ่าน" hint="หารกันไม่ใช้รหัสผ่าน จึงไม่มีรหัสให้หลุดหรือต้องจำ">
                <p className="flex items-center gap-2 text-body">
                  <ShieldCheck className="size-5 shrink-0 text-ok" aria-hidden />
                  {account.email !== null ? "เข้าด้วย Google ความปลอดภัยของบัญชีตามที่ตั้งไว้ใน Google" : "เข้าได้เฉพาะจากเบราว์เซอร์นี้"}
                </p>
              </Row>
              {account.email !== null && (
                <Row title="เครื่องอื่นที่เข้าสู่ระบบอยู่" hint="ทำเมื่อลืมออกจากระบบบนเครื่องของผู้อื่น หรือทำเครื่องหาย">
                  <button className="btn w-full lg:w-auto" onClick={signOutOthers}>
                    ออกจากระบบทุกเครื่อง ยกเว้นเครื่องนี้
                  </button>
                  {others && (
                    <p className="mt-2 text-meta text-muted" role="status">
                      {others}
                    </p>
                  )}
                </Row>
              )}
            </Section>

            <Section id="device-h" title="เครื่องนี้">
              <Row
                title="เสียงตราประทับ PAID"
                hint="เล่นเสียงประทับตราเบาๆ เมื่อยืนยันว่าได้รับเงินแล้ว (ปิดเป็นค่าเริ่มต้น)"
              >
                <button
                  type="button"
                  onClick={() => setSoundOn(!soundOn)}
                  aria-pressed={soundOn}
                  className={`btn w-full lg:w-auto ${soundOn ? "border-ok/45 text-ok" : ""}`}
                >
                  {soundOn ? <Volume2 className="size-4" strokeWidth={1.75} aria-hidden /> : <VolumeX className="size-4" strokeWidth={1.75} aria-hidden />}
                  {soundOn ? "เปิดเสียงตราประทับอยู่" : "ปิดเสียงตราประทับ"}
                </button>
              </Row>
              <Row
                title={account.email !== null ? "ออกจากระบบ" : "ล้างข้อมูลบนเครื่องนี้"}
                hint={
                  account.email !== null
                    ? "ลบทริปที่เก็บไว้ในเครื่องนี้ ทริปยังอยู่ในบัญชี Google เข้าสู่ระบบใหม่เพื่อเปิดอีกครั้ง"
                    : "เหมาะเมื่อใช้เครื่องของผู้อื่น ข้อมูลบนเซิร์ฟเวอร์ยังอยู่ แต่เครื่องนี้จะเข้าทริปเดิมไม่ได้อีก"
                }
              >
                {confirmWipe ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="btn-danger" onClick={wipe} autoFocus>
                      {account.email !== null ? "ยืนยัน ออกจากระบบ" : "ยืนยัน ลบและออกจากระบบ"}
                    </button>
                    <button className="btn-quiet" onClick={() => setConfirmWipe(false)}>
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <button className="btn-danger w-full lg:w-auto" onClick={() => setConfirmWipe(true)}>
                    {account.email !== null ? "ออกจากระบบ" : "ลบข้อมูลและออกจากระบบ"}
                  </button>
                )}
              </Row>
            </Section>

            <p className="text-meta text-muted">
              <Link href="/privacy" className="-my-3 inline-flex min-h-12 items-center whitespace-nowrap font-semibold text-ink underline">
                ข้อมูลที่เราเก็บ
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-body font-bold">
        {title}
      </h2>
      {note && <p className="mt-0.5 text-meta text-muted">{note}</p>}
      <div className="coupon mt-2.5 divide-y divide-line [&>form]:divide-y [&>form]:divide-line">{children}</div>
    </section>
  );
}

/** Label and help on the left, the control on the right (stacked on a phone). */
function Row({ title, hint, htmlFor, children }: { title: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  const Label = htmlFor ? "label" : "p";
  return (
    <div className="gap-x-8 px-4 py-4 lg:grid lg:grid-cols-[minmax(0,15rem)_1fr]">
      <div>
        <Label htmlFor={htmlFor} className="block text-body font-semibold">
          {title}
        </Label>
        {hint && <p className="mt-0.5 text-meta text-muted">{hint}</p>}
      </div>
      <div className="mt-3 min-w-0 lg:mt-0">{children}</div>
    </div>
  );
}

/** Google's "G", in its own colours as its brand rules ask. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
