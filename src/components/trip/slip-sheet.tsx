"use client";

import { Camera, Check, CircleHelp, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { SlipResponse } from "@/app/api/slips/route";
import { formatBaht } from "@/lib/core/money";
import type { PlannedTransfer } from "@/lib/trip/derive";
import type { TripState, TripStore } from "@/lib/trip/store";
import { Sheet } from "../ui";

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
  const owed = transfer.amount - transfer.claimedAmount;

  async function upload(file: File) {
    setPhase("reading");
    setError(null);
    const form = new FormData();
    form.set("slip", await shrinkImage(file));
    form.set("trip_id", view.trip.id);
    form.set("from_member", transfer.from);
    form.set("to_member", transfer.to);
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
      setError("ต้องเชื่อมต่ออินเทอร์เน็ตเพื่ออ่านสลิป รูปของคุณไม่ได้ถูกเก็บไว้ที่ใด");
      setPhase("error");
    }
  }

  async function recordAnyway(token: string) {
    try {
      const res = await fetch("/api/slips/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error(String(res.status));
      void store.refresh();
      onClose();
    } catch {
      setError("บันทึกไม่สำเร็จ โปรดลองอีกครั้ง หรือใช้ปุ่ม “โอนแล้ว (ไม่มีสลิป)”");
      setPhase("error");
    }
  }

  return (
    <Sheet open onClose={onClose} title={`แนบสลิปที่โอนให้ ${to.nickname}`}>
      {phase === "pick" && (
        <div className="space-y-4">
          <p className="text-body">
            ระบบจะอ่านยอดเงิน เวลา และชื่อผู้รับจากสลิป หากตรงกับยอดที่ต้องโอน (
            <span className="num font-semibold">{formatBaht(owed)} ฿</span>) ระบบจะบันทึกว่าโอนแล้ว และให้ {to.nickname}{" "}
            ยืนยันอีกครั้ง
          </p>
          <label className="btn-primary w-full cursor-pointer">
            <Camera className="size-5" aria-hidden /> เลือกรูปสลิปหรือถ่ายรูป
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              data-testid="slip-input"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
          <div className="flex gap-2.5 rounded-lg bg-paper px-3.5 py-3 text-meta text-muted ring-1 ring-line">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
            <p>
              รูปสลิปถูกอ่านแล้วลบทันที ไม่มีการเก็บรูปไว้ เก็บเพียงยอดเงิน เวลา ชื่อย่อผู้รับ และเลขบัญชี 4 หลักท้าย
              · ระบบไม่ได้ตรวจสอบสลิปกับธนาคาร
            </p>
          </div>
        </div>
      )}

      {phase === "reading" && (
        <p className="flex items-center justify-center gap-2 py-12 text-muted" role="status">
          <LoaderCircle className="size-5 animate-spin" aria-hidden /> กำลังอ่านสลิป…
        </p>
      )}

      {phase === "error" && (
        <div className="space-y-3">
          <p className="rounded-lg bg-owe-soft px-3.5 py-3 text-body text-owe" role="alert">
            {error}
          </p>
          <button className="btn w-full" onClick={() => setPhase("pick")}>
            ลองอีกครั้ง
          </button>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-4" data-testid="slip-result">
          <div
            className={`rounded-lg px-4 py-3 ${result.payment ? "bg-ok-soft text-ok" : "border border-dashed border-wait bg-wait-soft text-wait"}`}
            role="status"
          >
            <p className="font-bold">
              {result.payment ? `ติ๊กว่าจ่ายแล้ว รอ ${to.nickname} ยืนยัน` : "ยังติ๊กให้อัตโนมัติไม่ได้"}
            </p>
            {result.match.reasons.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-meta">
                {result.match.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>

          <dl className="coupon grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2.5 p-4 text-body">
            <Row
              label="ยอดเงิน"
              value={result.summary.amount !== null ? `${result.summary.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท` : "อ่านไม่ได้"}
              check={result.match.checks.amount}
            />
            <Row
              label="วันเวลา"
              value={
                result.summary.dateTime
                  ? new Date(result.summary.dateTime).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
                  : "อ่านไม่ได้"
              }
              check={result.match.checks.time}
            />
            <Row
              label="ผู้รับ"
              value={[result.summary.receiverName, result.summary.receiverLast4 && `…${result.summary.receiverLast4}`].filter(Boolean).join(" ") || "อ่านไม่ได้"}
              check={result.match.checks.receiver}
            />
            {result.summary.bank && <Row label="ธนาคาร" value={result.summary.bank} />}
          </dl>
          <p className="hint">ความมั่นใจในการอ่าน {Math.round(result.summary.confidence * 100)}%</p>

          {!result.payment && result.claimToken && (
            <button className="btn w-full" onClick={() => recordAnyway(result.claimToken!)}>
              ข้อมูลถูกต้อง บันทึกว่าโอนแล้ว (ให้ {to.nickname} ตรวจ)
            </button>
          )}
          <button className={result.payment ? "btn-primary w-full" : "btn-quiet w-full"} onClick={onClose}>
            {result.payment ? "เสร็จ" : "ปิด"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

const CHECK = {
  match: { Icon: Check, cls: "text-ok", text: "ตรง" },
  partial: { Icon: CircleHelp, cls: "text-wait", text: "ตรงบางส่วน" },
  mismatch: { Icon: X, cls: "text-owe", text: "ไม่ตรง" },
  unknown: { Icon: CircleHelp, cls: "text-muted", text: "ไม่ทราบ" },
} as const;

function Row({ label, value, check }: { label: string; value: string; check?: keyof typeof CHECK }) {
  const c = check ? CHECK[check] : null;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
      <dd className={c?.cls}>{c && <c.Icon className="size-5" aria-label={`${label}${c.text}`} />}</dd>
    </>
  );
}

/**
 * Re-encodes a photo to at most 2000px JPEG before upload. Keeps uploads under
 * the server's limit and drops EXIF data (location, device) along the way.
 * Falls back to the original file if the browser cannot decode it (e.g. HEIC).
 */
async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ?? file;
  } catch {
    return file;
  }
}

function errorText(code: string) {
  if (code === "not_configured") return "ยังไม่ได้ตั้งค่าตัวอ่านสลิป โปรดใช้ปุ่ม “โอนแล้ว (ไม่มีสลิป)” แทน";
  if (code === "rate_limited") return "อ่านสลิปครบจำนวนต่อชั่วโมงแล้ว โปรดลองใหม่ภายหลัง";
  if (code === "bad_image") return "ไฟล์นี้ใช้ไม่ได้ โปรดใช้รูปภาพ JPG, PNG, WebP หรือ HEIC ขนาดไม่เกิน 4 MB";
  if (code === "read_failed") return "อ่านสลิปไม่สำเร็จ โปรดถ่ายให้ชัดขึ้น หรือใช้ภาพหน้าจอจากแอปธนาคาร";
  return "เกิดข้อผิดพลาด โปรดลองอีกครั้ง";
}
