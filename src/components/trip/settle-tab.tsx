"use client";

import { useState } from "react";
import { maskPromptPay } from "@/lib/core/promptpay";
import type { PlannedTransfer, Settlement } from "@/lib/trip/derive";
import type { TripState, TripStore } from "@/lib/trip/store";
import type { Payment } from "@/lib/trip/types";
import { Avatar, Baht, Empty, PendingDot } from "../ui";
import { QrSheet } from "./qr-sheet";
import { SlipSheet } from "./slip-sheet";

export function SettleTab({ state, store, settlement }: { state: TripState; store: TripStore; settlement: Settlement }) {
  const view = state.view!;
  const me = state.me;
  const byId = new Map(view.members.map((m) => [m.id, m]));
  const name = (id: string) => byId.get(id)?.nickname ?? "?";
  const [qr, setQr] = useState<PlannedTransfer | null>(null);
  const [slip, setSlip] = useState<PlannedTransfer | null>(null);
  const myNet = me ? (settlement.net.get(me.id) ?? 0) : 0;
  const tripCreator = view.trip.created_by === state.userId;

  const mine = settlement.transfers.filter((t) => me && (t.from === me.id || t.to === me.id));
  const others = settlement.transfers.filter((t) => !mine.includes(t));
  const history = view.payments.filter((p) => p.status !== "claimed");

  function payManually(t: PlannedTransfer) {
    void store.do({
      kind: "record_payment",
      payment: { id: crypto.randomUUID(), trip_id: view.trip.id, from_member: t.from, to_member: t.to, amount: t.amount - t.claimedAmount, source: "manual" },
    });
  }

  return (
    <div className="space-y-6">
      {me && (
        <section
          className={`rounded-2xl p-5 ${myNet < 0 ? "bg-owe-soft text-owe" : myNet > 0 ? "bg-brand-soft text-brand-dark" : "bg-white text-ink"} border border-line`}
          data-testid="my-balance"
        >
          <p className="text-sm font-medium">{myNet < 0 ? "คุณต้องโอนรวม" : myNet > 0 ? "เพื่อนต้องโอนให้คุณรวม" : "คุณเคลียร์ครบแล้ว"}</p>
          {myNet !== 0 && <Baht satang={Math.abs(myNet)} className="mt-1 block text-3xl font-bold" />}
        </section>
      )}

      {settlement.awaitingMe.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">รอคุณยืนยันว่าได้รับเงิน</h2>
          <ul className="space-y-2">
            {settlement.awaitingMe.map((p) => (
              <ClaimCard key={p.id} p={p} name={name} canDecide store={store} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-sm font-semibold">ใครโอนให้ใคร</h2>
        <p className="mb-3 text-xs text-muted">
          จัดให้โอนน้อยครั้งที่สุดแล้ว ({settlement.transfers.length} ครั้ง)
        </p>
        {settlement.transfers.length === 0 ? (
          <Empty title={settlement.total ? "ทุกคนเคลียร์กันครบแล้ว 🎉" : "ยังไม่มีอะไรต้องโอน"} />
        ) : (
          <ul className="space-y-2">
            {[...mine, ...others].map((t) => {
              const to = byId.get(t.to);
              const iPay = me?.id === t.from;
              const iReceive = me?.id === t.to;
              const waiting = t.claimedAmount >= t.amount;
              return (
                <li key={`${t.from}-${t.to}`} className={`card p-4 ${iPay || iReceive ? "" : "opacity-80"}`} data-testid="transfer">
                  <div className="flex items-center gap-2">
                    <Avatar name={name(t.from)} id={t.from} size={30} />
                    <span className="font-medium">{iPay ? "คุณ" : name(t.from)}</span>
                    <span className="text-muted">→</span>
                    <Avatar name={name(t.to)} id={t.to} size={30} />
                    <span className="min-w-0 flex-1 truncate font-medium">{iReceive ? "คุณ" : name(t.to)}</span>
                    <Baht satang={t.amount} className="text-lg font-bold" />
                  </div>
                  {t.claims.length > 0 && (
                    <p className="mt-2 text-sm text-wait">
                      {waiting ? "แจ้งว่าโอนแล้ว" : `แจ้งว่าโอนแล้วบางส่วน`} · รอ {iReceive ? "คุณ" : name(t.to)} ยืนยัน
                      {t.claims.some((c) => c.source === "slip") && " (มีสลิป)"}
                    </p>
                  )}
                  {iPay && !waiting && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {to?.promptpay_id ? (
                        <button className="btn border-pp/30 text-pp" onClick={() => setQr(t)}>
                          QR พร้อมเพย์
                        </button>
                      ) : (
                        <span className="self-center text-xs text-muted">{name(t.to)} ยังไม่ได้ใส่พร้อมเพย์</span>
                      )}
                      <button className="btn" onClick={() => setSlip(t)} data-testid="upload-slip">
                        แนบสลิป
                      </button>
                      <button className="btn-ghost" onClick={() => payManually(t)}>
                        โอนแล้ว (ไม่มีสลิป)
                      </button>
                    </div>
                  )}
                  {iReceive && !waiting && (
                    <div className="mt-3">
                      <button className="btn" onClick={() => payManually(t)}>
                        ได้รับเงินแล้ว
                      </button>
                    </div>
                  )}
                  {!iPay && !iReceive && !byId.get(t.from)?.user_id && !waiting && (
                    <div className="mt-3">
                      <button className="btn-ghost" onClick={() => payManually(t)}>
                        {name(t.from)} โอนแล้ว (แจ้งแทน)
                      </button>
                    </div>
                  )}
                  {iPay && to?.promptpay_id && (
                    <p className="mt-2 text-xs text-muted">พร้อมเพย์ {maskPromptPay(to.promptpay_id)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {view.payments.some((p) => p.status === "claimed" && p.to_member !== me?.id) && (
        <section>
          <h2 className="mb-2 text-sm font-semibold">รอผู้รับยืนยัน</h2>
          <ul className="space-y-2">
            {view.payments
              .filter((p) => p.status === "claimed" && p.to_member !== me?.id)
              .map((p) => (
                <ClaimCard
                  key={p.id}
                  p={p}
                  name={name}
                  canDecide={tripCreator && !byId.get(p.to_member)?.user_id}
                  canCancel={p.created_by === state.userId}
                  store={store}
                />
              ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">ประวัติการโอน</h2>
          <ul className="card divide-y divide-line text-sm">
            {history.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="flex-1">
                  {name(p.from_member)} → {name(p.to_member)}
                  <span className="ml-2 text-xs text-muted">{statusLabel(p)}</span>
                </span>
                <Baht satang={p.amount} className={p.status === "confirmed" ? "" : "text-muted line-through"} />
                {p.pending && <PendingDot />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {qr && byId.get(qr.to)?.promptpay_id && (
        <QrSheet transfer={qr} receiver={byId.get(qr.to)!} onClose={() => setQr(null)} onUploadSlip={() => { setSlip(qr); setQr(null); }} />
      )}
      {slip && <SlipSheet transfer={slip} state={state} store={store} onClose={() => setSlip(null)} />}
    </div>
  );
}

function statusLabel(p: Payment) {
  return { confirmed: "ยืนยันแล้ว", rejected: "ผู้รับบอกว่ายังไม่ได้รับ", cancelled: "ยกเลิก", claimed: "รอยืนยัน" }[p.status];
}

function ClaimCard({
  p,
  name,
  canDecide,
  canCancel,
  store,
}: {
  p: Payment & { pending?: boolean };
  name: (id: string) => string;
  canDecide?: boolean;
  canCancel?: boolean;
  store: TripStore;
}) {
  const decide = (decision: "confirmed" | "rejected" | "cancelled") => void store.do({ kind: "decide_payment", id: p.id, decision });
  return (
    <li className="card p-4" data-testid="claim">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">
          {name(p.from_member)} → {name(p.to_member)}
        </span>
        <Baht satang={p.amount} className="text-lg font-bold" />
      </div>
      {p.slip ? (
        <div className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-sm">
          <p className="font-medium text-ink">AI อ่านจากสลิป</p>
          <p className="text-muted">
            {p.slip.amount !== null && `${p.slip.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท`}
            {p.slip.dateTime && ` · ${new Date(p.slip.dateTime).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`}
            {p.slip.receiverName && ` · ถึง ${p.slip.receiverName}`}
            {p.slip.bank && ` · ${p.slip.bank}`}
          </p>
          <p className="mt-1 text-xs text-muted">อ่านจากรูปเท่านั้น ไม่ได้ตรวจกับธนาคาร เช็กยอดเข้าในแอปธนาคารของคุณก่อนกดยืนยัน</p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">แจ้งว่าโอนแล้ว (ไม่มีสลิป)</p>
      )}
      {(canDecide || canCancel) && (
        <div className="mt-3 flex gap-2">
          {canDecide && (
            <>
              <button className="btn-primary flex-1" onClick={() => decide("confirmed")} data-testid="confirm-payment">
                ได้รับแล้ว
              </button>
              <button className="btn" onClick={() => decide("rejected")}>
                ยังไม่ได้รับ
              </button>
            </>
          )}
          {canCancel && !canDecide && (
            <button className="btn-ghost" onClick={() => decide("cancelled")}>
              ยกเลิกที่แจ้งไว้
            </button>
          )}
        </div>
      )}
      {p.pending && <PendingDot />}
    </li>
  );
}
