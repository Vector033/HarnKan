"use client";

import { ArrowRight, Check, Clock, FileImage, MessageCircle, QrCode, Share2, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatBaht } from "@/lib/core/money";
import { maskPromptPay } from "@/lib/core/promptpay";
import { playStampThud, useStampSound } from "@/lib/sound";
import { settlementText, type PlannedTransfer, type Settlement } from "@/lib/trip/derive";
import type { Pending } from "@/lib/trip/outbox";
import type { TripState, TripStore } from "@/lib/trip/store";
import type { Member, Payment } from "@/lib/trip/types";
import { Baht, Empty, MemberTile, PendingMark, SettleStrip, memberTint } from "../ui";
import { couponNo } from "./expenses-tab";
import { QrSheet } from "./qr-sheet";
import { SlipSheet } from "./slip-sheet";

// Confirm sequence: the stamp lands, the stub tears off, the coupon folds away, then it files into history.
const STAMP_MS = 480;
const TEAR_MS = 300;
const FOLD_MS = 200;

export function SettleTab({ state, store, settlement }: { state: TripState; store: TripStore; settlement: Settlement }) {
  const view = state.view!;
  const me = state.me;
  const byId = new Map(view.members.map((m) => [m.id, m]));
  const name = (id: string) => byId.get(id)?.nickname ?? "?";
  const [qr, setQr] = useState<PlannedTransfer | null>(null);
  const [slip, setSlip] = useState<PlannedTransfer | null>(null);
  const [soundOn, setSoundOn] = useStampSound();
  const myNet = me ? (settlement.net.get(me.id) ?? 0) : 0;
  const tripCreator = view.trip.created_by === state.userId;

  // A transfer fully claimed to me already shows above as a coupon to confirm; show it once.
  const transfers = settlement.transfers.filter((t) => !(me && t.to === me.id && t.claimedAmount >= t.amount));
  const mine = transfers.filter((t) => me && (t.from === me.id || t.to === me.id));
  const others = transfers.filter((t) => !mine.includes(t));
  const history = view.payments.filter((p) => p.status !== "claimed");
  const waitingOthers = view.payments.filter((p) => p.status === "claimed" && p.to_member !== me?.id);
  // Only payments that arrive while the tab is open rise in; the rest are already here.
  const [seen] = useState(() => new Set(history.map((p) => p.id)));

  function pay(t: PlannedTransfer) {
    void store.do({
      kind: "record_payment",
      payment: { id: crypto.randomUUID(), trip_id: view.trip.id, from_member: t.from, to_member: t.to, amount: t.amount - t.claimedAmount, source: "manual" },
    });
  }

  return (
    <div className="space-y-8">
      {me && (
        <div className="relative -mx-2 rounded-[calc(var(--radius-coupon)+8px)] p-2">
          {/* #18 Square-Dot Grid: classic printed ledger paper behind settlement balance summary. */}
          <div className="ledger-dot-grid absolute inset-0" aria-hidden />
          <section className="coupon relative px-4 py-4" data-testid="my-balance">
            {myNet === 0 && settlement.total > 0 ? (
              <div className="halftone-header absolute inset-x-0 top-0 h-10" aria-hidden />
            ) : myNet !== 0 ? (
              <div className="halftone-stub absolute inset-y-0 right-0 w-24 rotate-180" aria-hidden />
            ) : null}
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-semibold">
                  {myNet < 0
                    ? "คุณต้องโอนรวม"
                    : myNet > 0
                      ? "เพื่อนต้องโอนให้คุณรวม"
                      : settlement.total
                        ? "คุณไม่มียอดค้างแล้ว"
                        : "ยังไม่มียอดที่ต้องโอน"}
                </p>
                {myNet === 0 && settlement.total > 0 && (
                  <p className="mt-0.5 text-meta text-muted">ยอดของคุณในทริปนี้โอนและรับครบแล้ว</p>
                )}
                {myNet !== 0 && (
                  <Baht
                    satang={Math.abs(myNet)}
                    className={`mt-1 block font-semibold leading-tight ${formatBaht(Math.abs(myNet)).length > 9 ? "text-title" : "text-display"}`}
                  />
                )}
              </div>
              {myNet === 0 && settlement.total > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-ok/40 bg-ok-soft px-2.5 py-1 text-meta font-bold text-ok">
                  <Check className="size-4" strokeWidth={2.5} aria-hidden />
                  <span>ครบแล้ว</span>
                </span>
              )}
            </div>
          </section>
        </div>
      )}

      {settlement.awaitingMe.length > 0 && (
        <section aria-labelledby="awaiting-h">
          <h2 id="awaiting-h" className="mb-2.5 text-body font-bold">
            รอคุณยืนยันว่าได้รับเงิน
          </h2>
          <ul className="space-y-4">
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="transfers-h" className="text-body font-bold">
              ใครโอนให้ใคร
            </h2>
            {transfers.length > 0 && (
              <p className="mt-0.5 text-meta text-muted">
                จัดให้โอนน้อยครั้งที่สุดแล้ว รวม <span className="num font-num font-semibold text-ink">{settlement.transfers.length}</span> ครั้ง
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSoundOn(!soundOn)}
            aria-pressed={soundOn}
            title="เปิด/ปิดเสียงตราประทับ"
            className={`-mr-2 -mt-2 inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-meta font-semibold transition-colors duration-150 active:scale-[0.98] ${
              soundOn ? "bg-ok-soft text-ok" : "text-muted hover:bg-paper hover:text-ink"
            }`}
          >
            {soundOn ? <Volume2 className="size-4" strokeWidth={1.75} aria-hidden /> : <VolumeX className="size-4" strokeWidth={1.75} aria-hidden />}
            <span>เสียงตราประทับ</span>
          </button>
        </div>
        {settlement.toSettle > 0 && (
          <div className="relative -mx-2 mb-2 mt-2 rounded-[calc(var(--radius-coupon)+8px)] p-2">
            <div className="ledger-dot-grid absolute inset-0" aria-hidden />
            <div className="coupon relative px-4 py-3" data-testid="settle-progress">
              {settlement.settled >= settlement.toSettle && (
                <div className="halftone-header absolute inset-x-0 top-0 h-8" aria-hidden />
              )}
              <div className="relative">
                <SettleStrip settled={settlement.settled} total={settlement.toSettle} label="ทั้งทริปโอนแล้ว" />
              </div>
            </div>
          </div>
        )}
        {settlement.toSettle === 0 && <div className="mb-4" />}
        {transfers.length === 0 ? (
          settlement.transfers.length > 0 ? (
            <Empty title="ไม่มียอดอื่นที่ค้างอยู่">รายการที่เหลือรอคุณยืนยันด้านบน</Empty>
          ) : (
            view.members.length < 2 ? (
              <Empty title="ยังไม่มีเพื่อนในทริป">เชิญเพื่อนหรือเพิ่มชื่อเพื่อนในแท็บสมาชิก แล้วระบบจะคำนวณยอดให้</Empty>
            ) : settlement.toSettle > 0 ? null : (
              <Empty title={settlement.total ? "ทุกคนโอนกันครบแล้ว" : "ยังไม่มียอดที่ต้องโอน"}>
                {settlement.total ? "ไม่มีใครค้างโอนในทริปนี้" : "เมื่อมีรายจ่าย ระบบจะคำนวณให้ว่าใครต้องโอนให้ใคร"}
              </Empty>
            )
          )
        ) : (
          <ul className="space-y-4">
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

      {settlement.total > 0 && view.members.length > 1 && (
        <ShareSummary text={settlementText(view.trip.name, settlement.transfers, name, `${location.origin}/t/${view.trip.id}`)} />
      )}

      {waitingOthers.length > 0 && (
        <section aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="mb-2.5 text-body font-bold">
            รอผู้รับยืนยัน
          </h2>
          <ul className="space-y-4">
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
          <ul className="space-y-2.5">
            {history.map((p) => {
              const settled = p.status === "confirmed";
              const fresh = settled && !seen.has(p.id);
              return (
                <li
                  key={p.id}
                  className={`coupon relative flex items-stretch text-body ${seen.has(p.id) ? "" : "arrive"} ${settled ? "" : "bg-paper/60"}`}
                >
                  {settled && <span className="halftone-header absolute inset-x-0 top-0 h-10" aria-hidden />}
                  <span className="relative min-w-0 flex-1 px-4 py-3.5">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-x-1.5 break-words font-semibold">
                        <span className="min-w-0">{name(p.from_member)}</span> <ArrowRight className="size-4 shrink-0" strokeWidth={1.75} aria-label="โอนให้" /> <span className="min-w-0">{name(p.to_member)}</span>
                      </span>
                      {settled && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border border-ok/45 bg-ok-soft px-2 py-0.5 text-meta font-bold text-ok ${
                            fresh ? "animate-stamp" : ""
                          }`}
                        >
                          <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                          ได้รับเงินแล้ว
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-meta text-muted">
                      {/* The stamp already says the money arrived; a settled row adds only where the proof came from. */}
                      {(!settled || p.source === "slip") && (
                        <span className="inline-flex items-center gap-1">
                          {settled ? <FileImage className="size-4" strokeWidth={1.75} aria-hidden /> : <X className="size-4" strokeWidth={1.75} aria-hidden />}
                          {statusLabel(p)}
                        </span>
                      )}
                      <span className="serial">{couponNo(view.trip.id, p.from_member, p.to_member)}</span>
                    </span>
                  </span>
                  {/* Solid edge: settled. Dashed and struck: money that did not move. */}
                  <span
                    className={`relative flex min-w-[5.5rem] items-center justify-end border-l-2 px-3.5 ${settled ? "border-solid border-ink/35" : "border-dashed border-perf"}`}
                  >
                    <span className="halftone-stub absolute inset-y-0 left-0 w-9" aria-hidden />
                    <Baht satang={p.amount} className={`relative ${settled ? "font-semibold" : "text-muted line-through decoration-2"}`} />
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

/** Sends who-pays-whom to the group chat: LINE directly, anything else through the phone's share sheet. */
function ShareSummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    if (navigator.share) return void (await navigator.share({ text }).catch(() => {}));
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <section aria-label="ส่งสรุปยอดให้เพื่อน" className="-mt-4 grid grid-cols-2 gap-2">
      <a className="btn" href={`https://line.me/R/share?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="size-4 shrink-0" strokeWidth={1.75} aria-hidden /> ส่งสรุปเข้า LINE
      </a>
      <button type="button" className="btn" onClick={share}>
        <Share2 className="size-4 shrink-0" strokeWidth={1.75} aria-hidden /> {copied ? "คัดลอกแล้ว" : "แชร์ทางอื่น"}
      </button>
    </section>
  );
}

function statusLabel(p: Payment) {
  return {
    confirmed: "มีสลิป",
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
  const remaining = Math.max(0, t.amount - t.claimedAmount);
  const [stamping, setStamping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const label = (m: Member | undefined, isMe: boolean) => (isMe ? "คุณ" : (m?.nickname ?? "?"));

  function confirmDirectPay() {
    if (stamping) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStamping(true);
    playStampThud();
    timerRef.current = setTimeout(() => {
      onPay();
      setStamping(false);
    }, reduce ? 120 : STAMP_MS);
  }

  return (
    <li
      className={`coupon flex items-stretch ${iPay ? "paper-tint" : iReceive ? "" : "bg-paper/60"}`}
      style={{ background: iPay ? memberTint(members, t.to) : undefined }}
      data-testid="transfer"
    >
      <div className="relative min-w-0 flex-1 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-body font-semibold">
          <span className="flex min-w-0 items-center gap-2">
            <MemberTile name={from?.nickname ?? "?"} tint={memberTint(members, t.from)} size={28} />
            <span className="min-w-0 break-words">{label(from, iPay)}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <ArrowRight className="size-4 shrink-0" strokeWidth={1.75} aria-label="โอนให้" />
            <MemberTile name={to?.nickname ?? "?"} tint={memberTint(members, t.to)} size={28} />
            <span className="min-w-0 break-words">{label(to, iReceive)}</span>
          </span>
        </div>

        <p className="serial mt-1.5">{no}</p>
        {t.claims.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-meta font-medium text-wait">
            <Clock className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>
              {waiting ? "แจ้งว่าโอนแล้ว" : "แจ้งว่าโอนแล้วบางส่วน"} · รอ {iReceive ? "คุณ" : (to?.nickname ?? "?")} ยืนยัน
              {t.claims.some((c) => c.source === "slip") && " (แนบสลิปแล้ว)"}
            </span>
          </p>
        )}

        {iPay && !waiting && (
          <div className="mt-4 grid gap-2.5">
            {to?.promptpay_id ? (
              <button className="btn w-full border-pp/40 text-pp" onClick={onQr}>
                <QrCode className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>
                  โอน <Baht satang={remaining} /> <span className="whitespace-nowrap">· QR พร้อมเพย์</span>
                </span>
              </button>
            ) : (
              <span className="min-w-0 break-words text-meta text-ink/85">
                {to?.nickname} ยังไม่ได้ใส่เลขพร้อมเพย์ โปรดขอเลขบัญชีจาก {to?.nickname} แล้วแนบสลิปเมื่อโอนเสร็จ
              </span>
            )}
            <button className="btn w-full" onClick={onSlip} data-testid="upload-slip">
              <FileImage className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>
                {to?.promptpay_id ? "แนบสลิป" : <>โอน <Baht satang={remaining} /> แล้ว · แนบสลิป</>}
              </span>
            </button>
            <button className="btn-quiet -ml-3 justify-self-start" onClick={onPay}>
              โอนแล้ว (ไม่มีสลิป)
            </button>
          </div>
        )}
        {iPay && to?.promptpay_id && !waiting && (
          <p className="mt-2 text-meta text-ink/85">
            พร้อมเพย์ <span className="num font-num whitespace-nowrap">{maskPromptPay(to.promptpay_id)}</span>
          </p>
        )}
        {iReceive && !waiting && (
          <div className="mt-4">
            <button className="btn" onClick={confirmDirectPay} disabled={stamping}>
              <Check className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>
                ได้รับเงิน <Baht satang={remaining} /> แล้ว
              </span>
            </button>
          </div>
        )}
        {!iPay && !iReceive && !from?.user_id && !waiting && (
          <div className="mt-2">
            <button className="btn-quiet -ml-3 max-w-full text-left [overflow-wrap:anywhere]" onClick={onPay}>
              แจ้งแทน {from?.nickname} ว่าโอนแล้ว
            </button>
          </div>
        )}

        {stamping && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-end pr-2" aria-hidden>
            <span className="animate-stamp inline-flex items-center gap-1 rounded-md border-[2.5px] border-ok bg-paper/95 px-2.5 py-1 text-body font-bold text-ok">
              <Check className="size-5" strokeWidth={2.5} aria-hidden />
              <span>ได้รับเงินแล้ว</span>
            </span>
          </span>
        )}
      </div>
      {/* The stub: a dashed edge while the money is not settled. */}
      <div className={`perf-y perf-notch relative flex shrink-0 items-center justify-end px-3.5 ${waiting ? "border-wait" : "border-ink/30"}`}>
        <span className="halftone-stub absolute inset-y-0 left-0 w-10" aria-hidden />
        <Baht satang={t.amount} className={`relative font-semibold ${formatBaht(t.amount).length > 8 ? "text-body" : "text-title"}`} />
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
  const [stage, setStage] = useState<"idle" | "stamp" | "tear" | "fold">("idle");
  const [confirmReject, setConfirmReject] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const name = (id: string) => members.find((m) => m.id === id)?.nickname ?? "?";
  const busy = stage !== "idle";

  const decide = (decision: "confirmed" | "rejected" | "cancelled") => {
    if (decision !== "confirmed") return void store.do({ kind: "decide_payment", id: p.id, decision });
    // The signature moment: stamp, tear, fold, then the payment files into history.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const send = () =>
      void store.do({ kind: "decide_payment", id: p.id, decision }).finally(() => {
        // Still mounted means the decision did not go through: put the coupon back.
        setStage("idle");
      });
    setStage("stamp");
    playStampThud();
    if (reduce) {
      at(STAMP_MS, () => setStage("tear"));
      at(STAMP_MS + 200, send);
    } else {
      at(STAMP_MS, () => setStage("tear"));
      at(STAMP_MS + TEAR_MS, () => setStage("fold"));
      at(STAMP_MS + TEAR_MS + FOLD_MS, send);
    }
  };

  const slipParts = p.slip
    ? [
        p.slip.amount !== null && `${p.slip.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}\u00A0฿`,
        p.slip.dateTime && new Date(p.slip.dateTime).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }),
        p.slip.receiverName && `ถึง\u00A0${p.slip.receiverName}`,
        p.slip.bank,
      ].filter(Boolean)
    : [];

  return (
    <li
      className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
      style={{ gridTemplateRows: stage === "fold" ? "0fr" : "1fr", opacity: stage === "fold" ? 0 : 1 }}
      data-testid="claim"
    >
      <div className={`coupon min-h-0 ${stage === "tear" ? "tearing" : ""} ${stage === "fold" ? "tearing overflow-hidden" : ""}`}>
        <div className="flex items-stretch">
          <div className="coupon-body relative min-w-0 flex-1 px-4 py-3.5">
            <p className="flex flex-wrap items-center gap-x-1.5 break-words text-body font-semibold">
              <span className="min-w-0">{name(p.from_member)}</span> <ArrowRight className="size-4 shrink-0" strokeWidth={1.75} aria-label="โอนให้" /> <span className="min-w-0">{name(p.to_member)}</span>
            </p>
            <p className="serial mt-1">{no}</p>
            {p.slip ? (
              <div className="mt-2 text-meta">
                <p className="font-semibold">AI อ่านจากสลิป</p>
                <p className="text-muted">{slipParts.length ? slipParts.join(" · ") : "อ่านข้อมูลจากสลิปไม่ได้ โปรดตรวจยอดในแอปธนาคาร"}</p>
                <p className="mt-1 text-meta text-muted">
                  อ่านจากรูปเท่านั้น ไม่ได้ตรวจสอบกับธนาคาร โปรดตรวจยอดเงินเข้าในแอปธนาคาร<span className="whitespace-nowrap">ก่อนกดยืนยัน</span>
                </p>
              </div>
            ) : (
              <p className="mt-1 text-meta text-muted">แจ้งว่าโอนแล้ว (ไม่มีสลิป)</p>
            )}
            {busy && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-end pr-2" aria-hidden>
                <span className="animate-stamp inline-flex items-center gap-1 rounded-md border-[2.5px] border-ok bg-paper/95 px-2.5 py-1 text-body font-bold text-ok">
                  <Check className="size-5" strokeWidth={2.5} aria-hidden />
                  <span>ได้รับเงินแล้ว</span>
                </span>
              </span>
            )}
          </div>
          <div className="stub-half perf-y relative flex shrink-0 items-center justify-end border-wait px-3.5">
            <span className="halftone-stub absolute inset-y-0 left-0 w-10" aria-hidden />
            <Baht satang={p.amount} className={`relative font-semibold ${formatBaht(p.amount).length > 8 ? "text-body" : "text-title"}`} />
          </div>
        </div>
        {busy && (
          <p className="sr-only" role="status">
            ยืนยันว่าได้รับเงินแล้ว
          </p>
        )}
        {(canDecide || canCancel) && (
          <div className="coupon-actions perf-x flex flex-wrap gap-2 px-4 py-3">
            {canDecide &&
              (confirmReject ? (
                <>
                  <p className="w-full text-meta text-owe">แจ้ง {name(p.from_member)} ว่ายังไม่ได้รับเงินก้อนนี้?</p>
                  <button className="btn-danger flex-1" onClick={() => decide("rejected")} autoFocus>
                    ยืนยันว่ายังไม่ได้รับ
                  </button>
                  <button className="btn-quiet" onClick={() => setConfirmReject(false)}>
                    ยกเลิก
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-primary flex-1" onClick={() => decide("confirmed")} disabled={busy} data-testid="confirm-payment">
                    <Check className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span>
                      ได้รับ <Baht satang={p.amount} /> แล้ว
                    </span>
                  </button>
                  <button className="btn" onClick={() => setConfirmReject(true)} disabled={busy}>
                    ยังไม่ได้รับ
                  </button>
                </>
              ))}
            {canCancel && !canDecide && (
              <button className="btn-quiet" onClick={() => decide("cancelled")}>
                <Undo2 className="size-4" strokeWidth={1.75} aria-hidden /> ยกเลิกการแจ้ง
              </button>
            )}
          </div>
        )}
        {p.pending && (
          <div className="coupon-actions px-4 pb-3">
            <PendingMark />
          </div>
        )}
      </div>
    </li>
  );
}
