"use client";

import { ArrowRight, Check, FileImage, QrCode, Undo2 } from "lucide-react";
import { useState } from "react";
import { maskPromptPay } from "@/lib/core/promptpay";
import type { PlannedTransfer, Settlement } from "@/lib/trip/derive";
import type { Pending } from "@/lib/trip/outbox";
import type { TripState, TripStore } from "@/lib/trip/store";
import type { Member, Payment } from "@/lib/trip/types";
import { Baht, Empty, MemberTile, PendingMark, memberTint } from "../ui";
import { couponNo, tripSerial } from "./expenses-tab";
import { QrSheet } from "./qr-sheet";
import { SlipSheet } from "./slip-sheet";

const TEAR_MS = 280;

export function SettleTab({ state, store, settlement }: { state: TripState; store: TripStore; settlement: Settlement }) {
  const view = state.view!;
  const me = state.me;
  const byId = new Map(view.members.map((m) => [m.id, m]));
  const name = (id: string) => byId.get(id)?.nickname ?? "?";
  const [qr, setQr] = useState<PlannedTransfer | null>(null);
  const [slip, setSlip] = useState<PlannedTransfer | null>(null);
  const myNet = me ? (settlement.net.get(me.id) ?? 0) : 0;
  const tripCreator = view.trip.created_by === state.userId;
  const serial = tripSerial(view.trip.id);

  // A transfer fully claimed to me already shows above as a coupon to confirm; show it once.
  const transfers = settlement.transfers.filter((t) => !(me && t.to === me.id && t.claimedAmount >= t.amount));
  const mine = transfers.filter((t) => me && (t.from === me.id || t.to === me.id));
  const others = transfers.filter((t) => !mine.includes(t));
  const history = view.payments.filter((p) => p.status !== "claimed");
  const waitingOthers = view.payments.filter((p) => p.status === "claimed" && p.to_member !== me?.id);

  function pay(t: PlannedTransfer) {
    void store.do({
      kind: "record_payment",
      payment: { id: crypto.randomUUID(), trip_id: view.trip.id, from_member: t.from, to_member: t.to, amount: t.amount - t.claimedAmount, source: "manual" },
    });
  }

  return (
    <div className="space-y-7">
      {me && (
        <section className="coupon flex items-stretch" data-testid="my-balance">
          <div className="flex-1 px-4 py-4">
            <p className="text-body font-semibold">
              {myNet < 0 ? "คุณต้องโอนรวม" : myNet > 0 ? "เพื่อนต้องโอนให้คุณรวม" : "คุณเคลียร์ยอดครบแล้ว"}
            </p>
            {myNet !== 0 && <Baht satang={Math.abs(myNet)} className="mt-0.5 block text-display font-semibold leading-tight" />}
          </div>
          <span className="serial self-start px-4 pt-4">{serial}</span>
        </section>
      )}

      {settlement.awaitingMe.length > 0 && (
        <section aria-labelledby="awaiting-h">
          <h2 id="awaiting-h" className="mb-2.5 text-body font-bold">
            รอคุณยืนยันว่าได้รับเงิน
          </h2>
          <ul className="space-y-2.5">
            {settlement.awaitingMe.map((p) => (
              <ClaimCoupon
                key={p.id}
                p={p}
                no={couponNo(view.trip.id, p.from_member, p.to_member)}
                members={view.members}
                canDecide
                store={store}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="transfers-h">
        <h2 id="transfers-h" className="text-body font-bold">
          ใครโอนให้ใคร
        </h2>
        {transfers.length > 0 && (
          <p className="mb-3 mt-0.5 text-meta text-muted">จัดให้โอนน้อยครั้งที่สุดแล้ว รวม {settlement.transfers.length} ครั้ง</p>
        )}
        {transfers.length === 0 ? (
          settlement.transfers.length > 0 ? (
            <Empty title="ไม่มียอดอื่นที่ค้างอยู่">รายการที่เหลือรอคุณยืนยันด้านบน</Empty>
          ) : (
            <Empty title={settlement.total ? "ทุกคนเคลียร์กันครบแล้ว" : "ยังไม่มียอดที่ต้องโอน"}>
              {settlement.total ? "ไม่มีใครค้างโอนในทริปนี้" : "เมื่อมีรายจ่าย ระบบจะคำนวณให้ว่าใครต้องโอนให้ใคร"}
            </Empty>
          )
        ) : (
          <ul className="space-y-2.5">
            {[...mine, ...others].map((t) => (
              <TransferCoupon
                key={`${t.from}-${t.to}`}
                t={t}
                no={couponNo(view.trip.id, t.from, t.to)}
                me={me}
                byId={byId}
                members={view.members}
                onQr={() => setQr(t)}
                onSlip={() => setSlip(t)}
                onPay={() => pay(t)}
              />
            ))}
          </ul>
        )}
      </section>

      {waitingOthers.length > 0 && (
        <section aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="mb-2.5 text-body font-bold">
            รอผู้รับยืนยัน
          </h2>
          <ul className="space-y-2.5">
            {waitingOthers.map((p) => (
              <ClaimCoupon
                key={p.id}
                p={p}
                no={couponNo(view.trip.id, p.from_member, p.to_member)}
                members={view.members}
                canDecide={tripCreator && !byId.get(p.to_member)?.user_id && p.created_by !== state.userId}
                canCancel={p.created_by === state.userId}
                store={store}
              />
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section aria-labelledby="history-h">
          <h2 id="history-h" className="mb-2.5 text-body font-bold">
            ประวัติการโอน
          </h2>
          <ul className="space-y-2">
            {history.map((p) => {
              const settled = p.status === "confirmed";
              return (
                <li key={p.id} className={`arrive coupon flex items-stretch text-body ${settled ? "" : "bg-paper/60"}`}>
                  <span className="min-w-0 flex-1 px-3.5 py-3">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {name(p.from_member)} <ArrowRight className="size-4" aria-label="โอนให้" /> {name(p.to_member)}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-meta text-muted">
                      {statusLabel(p)}
                      <span className="serial">{couponNo(view.trip.id, p.from_member, p.to_member)}</span>
                    </span>
                  </span>
                  {/* Solid edge: settled. Dashed and struck: money that did not move. */}
                  <span
                    className={`flex min-w-[5.5rem] items-center justify-end border-l-2 px-3.5 ${settled ? "border-solid border-ink/35" : "border-dashed border-perf"}`}
                  >
                    <Baht satang={p.amount} className={settled ? "font-semibold" : "text-muted line-through decoration-2"} />
                  </span>
                  {(p as Pending<Payment>).pending && (
                    <span className="self-center pr-3">
                      <PendingMark />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {qr && byId.get(qr.to)?.promptpay_id && (
        <QrSheet
          transfer={qr}
          receiver={byId.get(qr.to)!}
          onClose={() => setQr(null)}
          onUploadSlip={() => {
            setSlip(qr);
            setQr(null);
          }}
        />
      )}
      {slip && <SlipSheet transfer={slip} state={state} store={store} onClose={() => setSlip(null)} />}
    </div>
  );
}

function statusLabel(p: Payment) {
  return {
    confirmed: p.source === "slip" ? "ยืนยันแล้ว · มีสลิป" : "ยืนยันแล้ว",
    rejected: "ผู้รับแจ้งว่ายังไม่ได้รับ",
    cancelled: "ยกเลิกแล้ว",
    claimed: "รอยืนยัน",
  }[p.status];
}

function TransferCoupon({
  t,
  no,
  me,
  byId,
  members,
  onQr,
  onSlip,
  onPay,
}: {
  t: PlannedTransfer;
  no: string;
  me: Member | null;
  byId: Map<string, Member>;
  members: Member[];
  onQr: () => void;
  onSlip: () => void;
  onPay: () => void;
}) {
  const from = byId.get(t.from);
  const to = byId.get(t.to);
  const iPay = me?.id === t.from;
  const iReceive = me?.id === t.to;
  const waiting = t.claimedAmount >= t.amount;
  const label = (m: Member | undefined, isMe: boolean) => (isMe ? "คุณ" : (m?.nickname ?? "?"));

  return (
    <li
      className={`coupon flex items-stretch ${iPay || iReceive ? "" : "opacity-85"}`}
      style={{ background: iPay ? memberTint(members, t.to) : undefined }}
      data-testid="transfer"
    >
      <div className="min-w-0 flex-1 px-3.5 py-3">
        <div className="flex items-center gap-2 text-body font-semibold">
          <MemberTile name={from?.nickname ?? "?"} tint={memberTint(members, t.from)} size={28} />
          <span className="truncate">{label(from, iPay)}</span>
          <ArrowRight className="size-4 shrink-0" aria-label="โอนให้" />
          <MemberTile name={to?.nickname ?? "?"} tint={memberTint(members, t.to)} size={28} />
          <span className="truncate">{label(to, iReceive)}</span>
        </div>

        <p className="serial mt-1.5">{no}</p>
        {t.claims.length > 0 && (
          <p className="mt-2 text-meta font-medium text-wait">
            {waiting ? "แจ้งว่าโอนแล้ว" : "แจ้งว่าโอนแล้วบางส่วน"} · รอ {iReceive ? "คุณ" : (to?.nickname ?? "?")} ยืนยัน
            {t.claims.some((c) => c.source === "slip") && " (แนบสลิปแล้ว)"}
          </p>
        )}

        {iPay && !waiting && (
          <div className="mt-3 grid gap-2">
            {to?.promptpay_id ? (
              <button className="btn w-full border-pp/40 text-pp" onClick={onQr}>
                <QrCode className="size-4" aria-hidden /> QR พร้อมเพย์
              </button>
            ) : (
              <span className="text-meta text-muted">{to?.nickname} ยังไม่ได้ใส่พร้อมเพย์</span>
            )}
            <button className="btn w-full" onClick={onSlip} data-testid="upload-slip">
              <FileImage className="size-4" aria-hidden /> แนบสลิป
            </button>
            <button className="btn-quiet -ml-3 justify-self-start" onClick={onPay}>
              โอนแล้ว (ไม่มีสลิป)
            </button>
          </div>
        )}
        {iPay && to?.promptpay_id && !waiting && (
          <p className="mt-2 text-meta text-muted">พร้อมเพย์ {maskPromptPay(to.promptpay_id)}</p>
        )}
        {iReceive && !waiting && (
          <div className="mt-3">
            <button className="btn" onClick={onPay}>
              <Check className="size-4" aria-hidden /> ได้รับเงินแล้ว
            </button>
          </div>
        )}
        {!iPay && !iReceive && !from?.user_id && !waiting && (
          <div className="mt-2">
            <button className="btn-quiet -ml-3" onClick={onPay}>
              แจ้งแทน {from?.nickname} ว่าโอนแล้ว
            </button>
          </div>
        )}
      </div>
      {/* The stub: a dashed edge while the money is not settled. */}
      <div className={`perf-y flex min-w-[5.5rem] items-center justify-end px-3.5 ${waiting ? "border-wait" : "border-ink/30"}`}>
        <Baht satang={t.amount} className="text-title font-semibold" />
      </div>
    </li>
  );
}

function ClaimCoupon({
  p,
  no,
  members,
  canDecide,
  canCancel,
  store,
}: {
  p: Pending<Payment>;
  no: string;
  members: Member[];
  canDecide?: boolean;
  canCancel?: boolean;
  store: TripStore;
}) {
  const [tearing, setTearing] = useState(false);
  const name = (id: string) => members.find((m) => m.id === id)?.nickname ?? "?";
  const decide = (decision: "confirmed" | "rejected" | "cancelled") => {
    if (decision !== "confirmed") return void store.do({ kind: "decide_payment", id: p.id, decision });
    // The signature moment: the stub tears off, then the payment files into history.
    setTearing(true);
    setTimeout(() => void store.do({ kind: "decide_payment", id: p.id, decision }), TEAR_MS);
  };

  return (
    <li className={`coupon ${tearing ? "tearing" : ""}`} data-testid="claim">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-body font-semibold">
            {name(p.from_member)} <ArrowRight className="size-4" aria-label="โอนให้" /> {name(p.to_member)}
          </p>
          <p className="serial mt-1">{no}</p>
          {p.slip ? (
            <div className="mt-2 text-meta">
              <p className="font-semibold">AI อ่านจากสลิป</p>
              <p className="text-muted">
                {p.slip.amount !== null && `${p.slip.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท`}
                {p.slip.dateTime &&
                  ` · ${new Date(p.slip.dateTime).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}`}
                {p.slip.receiverName && ` · ถึง ${p.slip.receiverName}`}
                {p.slip.bank && ` · ${p.slip.bank}`}
              </p>
              <p className="mt-1 text-meta text-muted">
                อ่านจากรูปเท่านั้น ไม่ได้ตรวจสอบกับธนาคาร โปรดตรวจยอดเงินเข้าในแอปธนาคารก่อนกดยืนยัน
              </p>
            </div>
          ) : (
            <p className="mt-1 text-meta text-muted">แจ้งว่าโอนแล้ว (ไม่มีสลิป)</p>
          )}
        </div>
        <div className="stub-half perf-y flex min-w-[5.5rem] items-center justify-end border-wait px-3.5">
          <Baht satang={p.amount} className="text-title font-semibold" />
        </div>
      </div>
      {(canDecide || canCancel) && (
        <div className="perf-x flex gap-2 px-3.5 py-3">
          {canDecide && (
            <>
              <button className="btn-primary flex-1" onClick={() => decide("confirmed")} disabled={tearing} data-testid="confirm-payment">
                <Check className="size-5" aria-hidden /> ได้รับแล้ว
              </button>
              <button className="btn" onClick={() => decide("rejected")} disabled={tearing}>
                ยังไม่ได้รับ
              </button>
            </>
          )}
          {canCancel && !canDecide && (
            <button className="btn-quiet" onClick={() => decide("cancelled")}>
              <Undo2 className="size-4" aria-hidden /> ยกเลิกการแจ้ง
            </button>
          )}
        </div>
      )}
      {p.pending && (
        <div className="px-3.5 pb-3">
          <PendingMark />
        </div>
      )}
    </li>
  );
}
