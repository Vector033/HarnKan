"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { promptPayKind } from "@/lib/core/promptpay";
import type { Settlement } from "@/lib/trip/derive";
import type { TripState, TripStore } from "@/lib/trip/store";
import { Avatar, Baht, PendingDot } from "../ui";

export function MembersTab({ state, store, settlement }: { state: TripState; store: TripStore; settlement: Settlement }) {
  const view = state.view!;
  const me = state.me;
  // Only rendered in the browser (the trip loads client-side), so location is available.
  const link = `${location.origin}/join/${view.trip.invite_code}`;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#1f1d19" } }).then(setQr);
  }, [link]);

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: view.trip.name, text: `มาหารค่า ${view.trip.name} กัน`, url: link }).catch(() => {});
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
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="font-semibold">ชวนเพื่อนเข้าทริป</h2>
        <p className="mt-1 text-sm text-muted">เพื่อนเปิดลิงก์หรือสแกน QR แล้วใส่ชื่อเล่น ไม่ต้องสมัคร</p>
        <div className="mt-4 flex items-center gap-4">
          <div
            className="aspect-square w-28 shrink-0 rounded-xl border border-line p-1.5 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={qr ? { __html: qr } : undefined}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate rounded-lg bg-stone-100 px-2.5 py-1.5 font-mono text-xs" data-testid="invite-link">
              {link}
            </p>
            <button className="btn-primary w-full" onClick={share}>
              {copied ? "คัดลอกแล้ว" : "ส่งลิงก์ชวน"}
            </button>
          </div>
        </div>
      </section>

      {me && <MyProfile key={me.id + (me.promptpay_id ?? "") + (me.payee_name ?? "")} state={state} store={store} />}

      <section>
        <h2 className="mb-2 text-sm font-semibold">สมาชิก {view.members.length} คน</h2>
        <ul className="card divide-y divide-line">
          {view.members.map((m) => {
            const net = settlement.net.get(m.id) ?? 0;
            return (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={m.nickname} id={m.id} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {m.nickname}
                    {m.id === me?.id && <span className="ml-1.5 text-xs text-muted">(คุณ)</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {m.user_id ? (m.promptpay_id ? "มีพร้อมเพย์" : "ยังไม่ใส่พร้อมเพย์") : "ยังไม่ได้เข้าทริป"}
                  </span>
                </span>
                <span className={`text-right text-sm font-semibold ${net < 0 ? "text-owe" : net > 0 ? "text-brand" : "text-muted"}`}>
                  {net === 0 ? "เคลียร์" : <Baht satang={net} />}
                </span>
                {m.pending && <PendingDot />}
              </li>
            );
          })}
        </ul>
        <form onSubmit={addPlaceholder} className="mt-3 flex gap-2">
          <input
            className="input"
            placeholder="เพิ่มชื่อเพื่อนที่ยังไม่ได้เข้า"
            maxLength={30}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="ชื่อเพื่อนที่จะเพิ่ม"
          />
          <button className="btn shrink-0" disabled={!newName.trim()}>
            เพิ่ม
          </button>
        </form>
        <p className="mt-1.5 text-xs text-muted">เพิ่มไว้ก่อนเพื่อจดรายจ่ายได้เลย พอเพื่อนเปิดลิงก์จะเลือกชื่อนี้ได้</p>
      </section>
    </div>
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
    <form onSubmit={save} className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">รับเงินของคุณ</h2>
        <p className="mt-1 text-sm text-muted">เพื่อนจะได้ QR พร้อมเพย์ที่ใส่ยอดให้แล้ว</p>
      </div>
      <div>
        <label className="label" htmlFor="promptpay">
          เบอร์พร้อมเพย์
        </label>
        <input
          id="promptpay"
          className="input num"
          inputMode="numeric"
          placeholder="08x-xxx-xxxx"
          value={promptpay}
          onChange={(e) => setPromptpay(e.target.value)}
        />
        {!valid && <p className="mt-1 text-sm text-owe">ใส่เบอร์มือถือ 10 หลัก (หรือเลขพร้อมเพย์ 13/15 หลัก)</p>}
        <p className="mt-1 text-xs text-muted">แนะนำให้ใช้เบอร์มือถือมากกว่าเลขบัตรประชาชน เพื่อนในทริปเห็นเลขนี้</p>
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
        <p className="mt-1 text-xs text-muted">ช่วยให้ AI จับคู่สลิปที่เพื่อนโอนมาได้แม่นขึ้น</p>
      </div>
      <button className="btn-primary w-full" disabled={!valid || !dirty}>
        บันทึก
      </button>
    </form>
  );
}
