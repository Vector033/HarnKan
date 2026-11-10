"use client";

import { Check, Link2, Lock, LockOpen, RefreshCw, Share2, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { promptPayKind } from "@/lib/core/promptpay";
import type { Settlement } from "@/lib/trip/derive";
import type { TripState, TripStore } from "@/lib/trip/store";
import type { Member } from "@/lib/trip/types";
import { Baht, MemberTile, PendingMark, memberTint } from "../ui";

export function MembersTab({ state, store, settlement }: { state: TripState; store: TripStore; settlement: Settlement }) {
  const view = state.view!;
  const me = state.me;
  const isOwner = view.trip.created_by === state.userId;
  // Only rendered in the browser (the trip loads client-side), so location is available.
  const link = `${location.origin}/join/${view.trip.invite_code}`;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState("");
  const [openedAt] = useState(() => Date.now());
  const expired = new Date(view.trip.invite_expires_at).getTime() < openedAt;
  const closed = view.trip.locked || expired;
  const claims = view.members.filter((m) => m.pending_user_id && !m.user_id);

  useEffect(() => {
    QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#14302b" } }).then(setQr);
  }, [link]);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: view.trip.name, text: `เชิญเข้าทริป ${view.trip.name}`, url: link }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function addPlaceholder(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    void store.do({ kind: "add_member", member: { id: crypto.randomUUID(), trip_id: view.trip.id, nickname: newName.trim() } });
    setNewName("");
  }

  return (
    <div className="space-y-7">
      <section className="coupon" aria-labelledby="invite-h">
        <div className="px-4 pt-4">
          <h2 id="invite-h" className="text-body font-bold">
            เชิญเข้าทริป
          </h2>
          <p className="mt-0.5 text-meta text-muted">
            {view.trip.locked
              ? "ทริปนี้ล็อกอยู่ คนใหม่เข้าไม่ได้ แม้มีลิงก์"
              : expired
                ? "ลิงก์นี้หมดอายุแล้ว สร้างลิงก์ใหม่เพื่อเชิญเพิ่ม"
                : <>เพื่อนเปิดลิงก์หรือสแกน QR แล้วใส่ชื่อเล่น ลิงก์ใช้ได้ถึง{" "}<span className="num font-num whitespace-nowrap">{new Date(view.trip.invite_expires_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</span></>}
          </p>
        </div>
        <div className={`flex items-center gap-4 px-4 py-4 ${closed ? "opacity-45" : ""}`}>
          <div
            className="aspect-square w-28 shrink-0 rounded-lg bg-paper p-1.5 ring-1 ring-line [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label="QR ลิงก์เชิญเข้าทริป"
            dangerouslySetInnerHTML={qr ? { __html: qr } : undefined}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="flex items-center gap-1.5 truncate rounded-md bg-ground px-2.5 py-2 text-meta" data-testid="invite-link">
              <Link2 className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{link}</span>
            </p>
            <button className="btn-primary w-full" onClick={share} disabled={closed}>
              <Share2 className="size-4" aria-hidden /> {copied ? "คัดลอกลิงก์แล้ว" : "ส่งลิงก์เชิญ"}
            </button>
          </div>
        </div>
        {isOwner && <OwnerControls state={state} store={store} />}
      </section>

      {isOwner && claims.length > 0 && (
        <section aria-labelledby="claims-h">
          <h2 id="claims-h" className="mb-2.5 text-body font-bold">
            มีคนขอเข้าทริปด้วยชื่อที่เพิ่มไว้
          </h2>
          <ul className="space-y-2.5">
            {claims.map((m) => (
              <ClaimRequest key={m.id} m={m} state={state} store={store} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-h">
        <h2 id="members-h" className="mb-2.5 text-body font-bold">
          สมาชิก {view.members.length} คน
        </h2>
        <ul className="coupon divide-y divide-line">
          {view.members.map((m) => (
            <MemberRow key={m.id} m={m} state={state} store={store} net={settlement.net.get(m.id) ?? 0} canRemove={isOwner && m.id !== me?.id} />
          ))}
        </ul>
        <label className="label mt-4" htmlFor="new-member">
          เพิ่มชื่อเพื่อน
        </label>
        <form onSubmit={addPlaceholder} className="flex gap-2">
          <input
            id="new-member"
            className="input"
            placeholder="ชื่อเพื่อนที่ยังไม่ได้เข้าทริป"
            maxLength={30}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn shrink-0" disabled={!newName.trim()}>
            <UserPlus className="size-4" aria-hidden /> เพิ่ม
          </button>
        </form>
        <p className="hint">เพิ่มชื่อไว้ก่อนเพื่อบันทึกรายจ่ายได้ทันที เมื่อเพื่อนเปิดลิงก์ จะเลือกชื่อนี้และใส่พร้อมเพย์ของตัวเองได้</p>
      </section>

      {me && <MyProfile key={me.id + (me.promptpay_id ?? "") + (me.payee_name ?? "")} state={state} store={store} />}
    </div>
  );
}

function OwnerControls({ state, store }: { state: TripState; store: TripStore }) {
  const trip = state.view!.trip;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();

  async function deleteTrip() {
    setBusy("delete");
    const err = await store.deleteTrip();
    setBusy(null);
    if (err) setMsg(err === "offline" ? "ต้องเชื่อมต่ออินเทอร์เน็ตก่อน" : "ลบทริปไม่สำเร็จ");
    else router.replace("/");
  }

  async function run(key: string, fn: Parameters<TripStore["admin"]>[0], args: Record<string, unknown>, done: string) {
    setBusy(key);
    setMsg(null);
    const err = await store.admin(fn, args);
    setBusy(null);
    setMsg(err ? (err === "offline" ? "ต้องเชื่อมต่ออินเทอร์เน็ตก่อน" : "ทำรายการไม่สำเร็จ") : done);
  }

  return (
    <div className="perf-x space-y-2 px-4 py-3.5">
      <p className="text-meta font-semibold text-muted">สำหรับเจ้าของทริป</p>
      <div className="flex flex-wrap gap-2">
        <button
          className="btn"
          disabled={!!busy}
          onClick={() =>
            run("lock", "set_trip_locked", { p_trip: trip.id, p_locked: !trip.locked }, trip.locked ? "เปิดรับสมาชิกใหม่แล้ว" : "ล็อกทริปแล้ว")
          }
        >
          {trip.locked ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
          {trip.locked ? "เปิดรับสมาชิกใหม่" : "ล็อกทริป"}
        </button>
        {confirmRotate ? (
          <button
            className="btn-danger"
            disabled={!!busy}
            autoFocus
            onClick={() => {
              setConfirmRotate(false);
              void run("rotate", "rotate_invite", { p_trip: trip.id }, "สร้างลิงก์ใหม่แล้ว ลิงก์เดิมใช้ไม่ได้อีก");
            }}
          >
            <RefreshCw className="size-4" aria-hidden /> ยืนยัน ลิงก์เดิมจะใช้ไม่ได้
          </button>
        ) : null}
        {confirmRotate ? (
          <button className="btn-quiet" onClick={() => setConfirmRotate(false)}>
            ยกเลิก
          </button>
        ) : (
          <button className="btn" disabled={!!busy} onClick={() => setConfirmRotate(true)}>
            <RefreshCw className="size-4" aria-hidden /> สร้างลิงก์ใหม่
          </button>
        )}
      </div>
      <p className="text-meta text-muted" role="status">
        {msg ?? "ล็อกเมื่อทุกคนเข้าครบแล้ว หากลิงก์หลุดออกไปนอกกลุ่ม ให้สร้างลิงก์ใหม่ (ลิงก์ใหม่ใช้ได้ 7\u00A0วัน)"}
      </p>
      {confirmDelete ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-owe-soft px-3 py-2.5">
          <p className="flex-1 text-meta text-owe">ลบทริปนี้ถาวร? รายจ่าย การโอน และสมาชิกทั้งหมดจะถูกลบ และกู้คืนไม่ได้</p>
          <button className="btn-danger" disabled={!!busy} onClick={deleteTrip} autoFocus>
            ลบถาวร
          </button>
          <button className="btn-quiet" onClick={() => setConfirmDelete(false)}>
            ยกเลิก
          </button>
        </div>
      ) : (
        <button className="btn-quiet -ml-3 text-owe" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-4" aria-hidden /> ลบทริปนี้
        </button>
      )}
    </div>
  );
}

function ClaimRequest({ m, state, store }: { m: Member; state: TripState; store: TripStore }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function decide(accept: boolean) {
    setBusy(true);
    const e = await store.admin("decide_claim", { p_member: m.id, p_accept: accept });
    setBusy(false);
    setErr(e ? (e === "offline" ? "ต้องเชื่อมต่ออินเทอร์เน็ตก่อน" : "ทำรายการไม่สำเร็จ") : null);
  }
  return (
    <li className="coupon border-2 border-dashed border-wait p-3.5" data-testid="claim-request">
      <div className="flex items-center gap-3">
        <MemberTile name={m.nickname} tint={memberTint(state.view!.members, m.id)} />
        <p className="flex-1 text-body">
          มีคนขอเข้าทริปในชื่อ “<b>{m.nickname}</b>” คนนี้คือ {m.nickname} จริงหรือไม่
        </p>
      </div>
      <p className="hint">ยืนยันเมื่อแน่ใจเท่านั้น ผู้ที่ได้ชื่อนี้จะเห็นทริปและใส่พร้อมเพย์รับเงินแทน {m.nickname} ได้</p>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary flex-1" disabled={busy} onClick={() => decide(true)} data-testid="approve-claim">
          <Check className="size-5" aria-hidden /> ใช่ ให้เข้าทริป
        </button>
        <button className="btn" disabled={busy} onClick={() => decide(false)}>
          <X className="size-4" aria-hidden /> ไม่ใช่
        </button>
      </div>
      {err && (
        <p className="mt-1.5 text-meta text-owe" role="alert">
          {err}
        </p>
      )}
    </li>
  );
}

function MemberRow({
  m,
  state,
  store,
  net,
  canRemove,
}: {
  m: Member & { pending?: boolean };
  state: TripState;
  store: TripStore;
  net: number;
  canRemove: boolean;
}) {
  const members = state.view!.members;
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    const e = await store.admin("remove_member", { p_member: m.id });
    setConfirm(false);
    setErr(e ? (e === "offline" ? "ต้องเชื่อมต่ออินเทอร์เน็ตก่อน" : "นำออกไม่สำเร็จ") : null);
  }

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-center gap-3">
        <MemberTile name={m.nickname} tint={memberTint(members, m.id)} />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-body font-semibold">
            {m.nickname}
            {m.id === state.me?.id && <span className="ml-1.5 whitespace-nowrap text-meta font-medium text-muted">(คุณ)</span>}
            {m.user_id === state.view!.trip.created_by && <span className="ml-1.5 whitespace-nowrap text-meta font-medium text-muted">เจ้าของทริป</span>}
          </span>
          <span className="block text-meta text-muted">
            {m.user_id
              ? m.promptpay_id
                ? "มีพร้อมเพย์แล้ว"
                : "ยังไม่ได้ใส่พร้อมเพย์"
              : m.pending_user_id
                ? "รอเจ้าของทริปยืนยัน"
                : "ยังไม่ได้เข้าทริป"}
          </span>
        </span>
        <span className="text-right">
          {net === 0 ? (
            <span className="text-meta text-muted">ไม่มียอดค้าง</span>
          ) : (
            <>
              <span className="block text-meta text-muted">{net > 0 ? "ได้คืน" : "ต้องโอน"}</span>
              <Baht satang={Math.abs(net)} className="text-body font-semibold" />
            </>
          )}
        </span>
        {m.pending && <PendingMark />}
        {canRemove && !confirm && (
          <button className="-mr-2 grid size-12 place-items-center rounded-lg text-muted hover:bg-ground hover:text-owe" onClick={() => setConfirm(true)} aria-label={`นำ ${m.nickname} ออกจากทริป`}>
            <UserMinus className="size-[18px]" />
          </button>
        )}
      </div>
      {confirm && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-owe-soft px-3 py-2.5">
          <p className="flex-1 text-meta text-owe">
            นำ {m.nickname} ออก? {m.nickname} จะเข้าทริปนี้ไม่ได้อีก ลิงก์เชิญจะเปลี่ยนใหม่ ยอดที่เคยบันทึกยังอยู่ครบ
          </p>
          <button className="btn-danger" onClick={remove} autoFocus>
            นำออก
          </button>
          <button className="btn-quiet" onClick={() => setConfirm(false)}>
            ยกเลิก
          </button>
        </div>
      )}
      {err && (
        <p className="mt-1.5 text-meta text-owe" role="alert">
          {err}
        </p>
      )}
    </li>
  );
}

function MyProfile({ state, store }: { state: TripState; store: TripStore }) {
  const me = state.me!;
  const [promptpay, setPromptpay] = useState(me.promptpay_id ?? "");
  const [payee, setPayee] = useState(me.payee_name ?? "");
  const digits = promptpay.replace(/\D/g, "");
  const valid = digits === "" || promptPayKind(digits) !== null;
  const dirty = digits !== (me.promptpay_id ?? "") || payee.trim() !== (me.payee_name ?? "");

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    void store.do({ kind: "update_member", id: me.id, patch: { promptpay_id: digits || null, payee_name: payee.trim() || null } });
  }

  return (
    <form onSubmit={save} className="coupon space-y-5 p-4" aria-labelledby="receive-h">
      <div>
        <h2 id="receive-h" className="text-body font-bold">
          บัญชีรับเงินของคุณ
        </h2>
        <p className="mt-0.5 text-meta text-muted">เพื่อนจะได้ QR พร้อมเพย์ที่ใส่ยอดไว้ให้แล้ว มีเพียงคุณที่แก้ไขข้อมูลนี้ได้</p>
      </div>
      <div>
        <label className="label" htmlFor="promptpay">
          เบอร์มือถือหรือเลขพร้อมเพย์
        </label>
        <input
          id="promptpay"
          className="input num"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="08x-xxx-xxxx"
          value={promptpay}
          aria-invalid={!valid}
          aria-describedby={!valid ? "promptpay-error" : undefined}
          onChange={(e) => setPromptpay(e.target.value)}
        />
        {!valid && <p id="promptpay-error" className="mt-1.5 text-meta text-owe">โปรดใส่เบอร์มือถือ 10 หลัก หรือเลขพร้อมเพย์ 13 หรือ 15 หลัก</p>}
        <p className="hint">แนะนำให้ใช้เบอร์มือถือแทนเลขบัตรประชาชน เพราะสมาชิกในทริปจะเห็นเลขนี้</p>
      </div>
      <div>
        <label className="label" htmlFor="payee">
          ชื่อที่ขึ้นในสลิป (ไม่บังคับ)
        </label>
        <input
          id="payee"
          className="input"
          placeholder="เช่น ณวัฒน์ ว."
          maxLength={80}
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
        />
        <p className="hint">ช่วยให้ระบบจับคู่สลิปที่เพื่อนโอนมาได้แม่นยำขึ้น</p>
      </div>
      <button className="btn-primary w-full" disabled={!valid || !dirty}>
        บันทึก
      </button>
    </form>
  );
}
