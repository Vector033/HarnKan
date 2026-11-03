"use client";

import { useState } from "react";
import { formatBaht } from "@/lib/core/money";
import type { PlannedTransfer } from "@/lib/trip/derive";
import type { TripState, TripStore } from "@/lib/trip/store";
import type { SlipSummary } from "@/lib/trip/types";
import { Sheet } from "../ui";
import type { SlipResponse } from "@/app/api/slips/route";

export function SlipSheet({
  transfer,
  state,
  store,
  onClose,
}: {
  transfer: PlannedTransfer;
  state: TripState;
  store: TripStore;
  onClose: () => void;
}) {
  const view = state.view!;
  const to = view.members.find((m) => m.id === transfer.to)!;
  const [phase, setPhase] = useState<"pick" | "reading" | "done" | "error">("pick");
  const [result, setResult] = useState<SlipResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setPhase("reading");
    setError(null);
    const form = new FormData();
    form.set("slip", file);
    form.set("trip_id", view.trip.id);
    form.set("from_member", transfer.from);
    try {
      const res = await fetch("/api/slips", { method: "POST", body: form });
      const body = (await res.json()) as SlipResponse | { error: string };
      if (!res.ok || "error" in body) {
        setError(errorText("error" in body ? body.error : `HTTP ${res.status}`));
        setPhase("error");
        return;
      }
      setResult(body);
      setPhase("done");
      // The server recorded it; pull it in now rather than wait for the realtime echo.
      if (body.payment) void store.refresh();
    } catch {
      setError("ต้องต่ออินเทอร์เน็ตเพื่ออ่านสลิป ไม่ต้องห่วง รูปไม่ได้ถูกเก็บไว้ที่ไหน");
      setPhase("error");
    }
  }

  function recordAnyway(summary: SlipSummary) {
    void store.do({
      kind: "record_payment",
      payment: {
        id: crypto.randomUUID(),
        trip_id: view.trip.id,
        from_member: transfer.from,
        to_member: transfer.to,
        amount: transfer.amount - transfer.claimedAmount,
        source: "slip",
        slip: summary,
      },
    });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`แนบสลิปที่โอนให้ ${to.nickname}`}>
      {phase === "pick" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            AI จะอ่านยอด เวลา และชื่อผู้รับจากสลิป ถ้าตรงกับยอดที่ต้องโอน ({formatBaht(transfer.amount - transfer.claimedAmount)} ฿)
            แอปจะติ๊กว่าจ่ายแล้วให้ แล้ว {to.nickname} กดยืนยันอีกที
          </p>
          <label className="btn-primary w-full cursor-pointer">
            เลือกรูปสลิป / ถ่ายรูป
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid="slip-input"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
          <p className="text-xs text-muted">
            รูปสลิปถูกอ่านแล้วทิ้งทันที ไม่ถูกเก็บไว้ เก็บแค่ยอด เวลา และชื่อย่อผู้รับ · แอปไม่ได้ตรวจสอบสลิปกับธนาคาร
          </p>
        </div>
      )}

      {phase === "reading" && <p className="py-10 text-center text-muted">กำลังอ่านสลิป…</p>}

      {phase === "error" && (
        <div className="space-y-3">
          <p className="rounded-xl bg-owe-soft px-3.5 py-3 text-sm text-owe">{error}</p>
          <button className="btn w-full" onClick={() => setPhase("pick")}>
            ลองอีกครั้ง
          </button>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-4" data-testid="slip-result">
          <div className={`rounded-xl px-4 py-3 ${result.payment ? "bg-brand-soft text-brand-dark" : "bg-wait-soft text-wait"}`}>
            <p className="font-semibold">
              {result.payment ? `ติ๊กว่าจ่ายแล้ว รอ ${to.nickname} ยืนยัน` : "ยังติ๊กให้อัตโนมัติไม่ได้"}
            </p>
            {result.match.reasons.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm">
                {result.match.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 text-sm">
            <Row label="ยอดเงิน" value={result.summary.amount !== null ? `${result.summary.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท` : "อ่านไม่ได้"} check={result.match.checks.amount} />
            <Row label="วันเวลา" value={result.summary.dateTime ? new Date(result.summary.dateTime).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "อ่านไม่ได้"} check={result.match.checks.time} />
            <Row
              label="ผู้รับ"
              value={[result.summary.receiverName, result.summary.receiverLast4 && `…${result.summary.receiverLast4}`].filter(Boolean).join(" ") || "อ่านไม่ได้"}
              check={result.match.checks.receiver}
            />
            {result.summary.bank && <Row label="ธนาคาร" value={result.summary.bank} />}
          </dl>
          <p className="text-xs text-muted">ความมั่นใจของ AI {Math.round(result.summary.confidence * 100)}%</p>

          {!result.payment && result.match.checks.amount !== "mismatch" && !result.match.checks.duplicate && (
            <button className="btn w-full" onClick={() => recordAnyway(result.summary)}>
              ข้อมูลถูกแล้ว บันทึกว่าจ่ายแล้ว (ให้ {to.nickname} ตรวจ)
            </button>
          )}
          <button className={result.payment ? "btn-primary w-full" : "btn-ghost w-full"} onClick={onClose}>
            {result.payment ? "เสร็จ" : "ปิด"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Row({ label, value, check }: { label: string; value: string; check?: string }) {
  const icon = check === "match" ? "✓" : check === "mismatch" ? "✕" : check === "partial" ? "≈" : check ? "?" : "";
  const color = check === "match" ? "text-brand" : check === "mismatch" ? "text-owe" : "text-wait";
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
      <dd className={`font-bold ${color}`} aria-label={check ? `${label}: ${check}` : undefined}>
        {icon}
      </dd>
    </>
  );
}

function errorText(code: string) {
  if (code === "not_configured") return "ยังไม่ได้ตั้งค่าตัวอ่านสลิปบนเซิร์ฟเวอร์ ใช้ปุ่ม “โอนแล้ว (ไม่มีสลิป)” แทนได้";
  if (code === "rate_limited") return "อ่านสลิปครบโควตาต่อชั่วโมงแล้ว ลองใหม่ภายหลัง";
  if (code === "bad_image") return "ไฟล์นี้ใช้ไม่ได้ ใช้รูป JPG/PNG ขนาดไม่เกิน 6 MB";
  if (code === "read_failed") return "อ่านสลิปไม่สำเร็จ ลองถ่ายให้ชัดขึ้น หรือใช้ภาพแคปหน้าจอจากแอปธนาคาร";
  return "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
}

