"use client";

import { Camera, Check, CircleHelp, LoaderCircle, Minus, ReceiptText, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOk, setPreviewOk] = useState(true);
  const previewRef = useRef<string | null>(null);
  const owed = transfer.amount - transfer.claimedAmount;

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function setLocalPreview(file: File | null) {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    if (!file) {
      setPreviewUrl(null);
      setPreviewOk(true);
      return;
    }
    const next = URL.createObjectURL(file);
    previewRef.current = next;
    setPreviewUrl(next);
    setPreviewOk(true);
  }

  async function upload(file: File) {
    setLocalPreview(file);
    setPhase("reading");
    setError(null);
    const form = new FormData();
    form.set("slip", await shrinkImage(file));
    form.set("trip_id", view.trip.id);
    form.set("from_member", transfer.from);
    form.set("to_member", transfer.to);
    try {
      const res = await fetch("/api/slips", { method: "POST", body: form });
      if (res.status === 413) {
        setError(errorText("too_large"));
        setPhase("error");
        return;
      }
      // A proxy or platform error page is not JSON; do not report it as being offline.
      if (!res.headers.get("content-type")?.includes("json")) {
        setError(errorText(`HTTP ${res.status}`));
        setPhase("error");
        return;
      }
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

  const amountCheck = result ? CHECK[result.match.checks.amount] : null;

  return (
    <Sheet open fluted onClose={onClose} title={`แนบสลิปที่โอนให้ ${to.nickname}`}>
      {phase === "pick" && (
        <div className="space-y-4">
          <p className="text-body">
            ระบบจะอ่านยอดเงิน เวลา และชื่อผู้รับจากสลิป หากตรงกับยอดที่ต้องโอน (
            <span className="num font-num whitespace-nowrap font-semibold">{formatBaht(owed)} ฿</span>) ระบบจะบันทึกว่าโอนแล้ว{" "}
            <span className="whitespace-nowrap">และให้ {to.nickname} ยืนยันอีกครั้ง</span>
          </p>
          <label className="btn-primary w-full cursor-pointer">
            <Camera className="size-5" strokeWidth={1.75} aria-hidden /> เลือกรูปสลิปหรือถ่ายรูป
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="sr-only"
              data-testid="slip-input"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
          <div className="flex gap-2.5 rounded-lg bg-paper px-3.5 py-3 text-meta text-muted ring-1 ring-line">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ok" strokeWidth={1.75} aria-hidden />
            <p>
              รูปสลิปถูกอ่านแล้วลบทันที ไม่มีการเก็บรูปไว้ <span className="whitespace-nowrap">เก็บเพียงยอดเงิน</span> เวลา ชื่อย่อผู้รับ และเลขบัญชี{" "}
              <span className="whitespace-nowrap">4 หลักท้าย</span> · ระบบไม่ได้ตรวจสอบสลิปกับธนาคาร
            </p>
          </div>
        </div>
      )}

      {phase === "reading" && (
        <Reading previewUrl={previewUrl} previewOk={previewOk} onPreviewError={() => setPreviewOk(false)} />
      )}

      {phase === "error" && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg bg-owe-soft px-3.5 py-3 text-body text-owe" role="alert">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>{error}</span>
          </p>
          <button
            className="btn w-full"
            onClick={() => {
              setLocalPreview(null);
              setPhase("pick");
            }}
          >
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
            <p className="flex items-start gap-2 font-bold">
              {result.payment ? (
                <Check className="mt-0.5 size-5 shrink-0" strokeWidth={2} aria-hidden />
              ) : (
                <CircleHelp className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
              )}
              <span>
                {result.payment ? `บันทึกว่าโอนแล้ว รอ ${to.nickname} ยืนยันว่าได้รับเงิน` : "ยังบันทึกให้อัตโนมัติไม่ได้ โปรดตรวจข้อมูลด้านล่าง"}
              </span>
            </p>
            {result.match.reasons.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-meta">
                {result.match.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="coupon overflow-hidden">
            {/* Prominent amount without a redundant "ยอดเงิน:" label; optionally paired with local thumbnail preview. */}
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
              <div className="flex min-w-0 items-center gap-3">
                {previewUrl && previewOk && (
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-[6px] bg-ground ring-1 ring-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt=""
                      onError={() => setPreviewOk(false)}
                      className="h-full w-full object-cover"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-1 right-1 grid size-5 place-items-center rounded-[4px] bg-ink/90 text-white shadow-sm"
                    >
                      <ReceiptText className="size-3" strokeWidth={1.75} />
                    </span>
                  </div>
                )}
                <p className="num font-num text-title font-semibold leading-tight text-ink">
                  {result.summary.amount !== null
                    ? `${result.summary.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ฿`
                    : "อ่านยอดเงินไม่ได้"}
                </p>
              </div>
              {amountCheck && (
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-ground px-2 py-1 text-meta font-semibold ${amountCheck.cls}`}>
                  <amountCheck.Icon className="size-4" strokeWidth={2} aria-hidden />
                  {amountCheck.text}
                </span>
              )}
            </div>

            <dl className="perf-x grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2.5 p-4 text-body">
              <Row
                label="วันเวลา"
                value={
                  result.summary.dateTime
                    ? new Date(result.summary.dateTime).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
                    : "อ่านไม่ได้"
                }
                numeric={!!result.summary.dateTime}
                check={result.match.checks.time}
              />
              <Row
                label="ผู้รับ"
                value={[result.summary.receiverName, result.summary.receiverLast4 && `…${result.summary.receiverLast4}`].filter(Boolean).join(" ") || "อ่านไม่ได้"}
                check={result.match.checks.receiver}
              />
              {result.summary.bank && <Row label="ธนาคาร" value={result.summary.bank} />}
            </dl>
          </div>
          <p className="hint">
            ความมั่นใจในการอ่าน <span className="num font-num font-semibold text-ink">{Math.round(result.summary.confidence * 100)}%</span>
          </p>

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
  unknown: { Icon: Minus, cls: "text-muted", text: "ไม่ทราบ" },
} as const;

/**
 * While the slip is read: the result rows already in place with dashed
 * placeholder values (dashed = not settled yet), plus a contrast-protected
 * thumbnail scan indicator when the browser can decode the image locally.
 */
function Reading({
  previewUrl,
  previewOk,
  onPreviewError,
}: {
  previewUrl: string | null;
  previewOk: boolean;
  onPreviewError: () => void;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="space-y-4" role="status">
      <p className="flex items-center gap-2 text-body font-semibold">
        <LoaderCircle className="size-5 animate-spin motion-reduce:hidden" strokeWidth={1.75} aria-hidden />
        {slow ? "ยังอ่านอยู่ บางครั้งอาจใช้เวลาถึงครึ่งนาที" : "กำลังอ่านสลิป…"}
      </p>
      {previewUrl && previewOk && (
        <div className="coupon relative h-32 overflow-hidden bg-ground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt=""
            onError={onPreviewError}
            className="h-full w-full object-cover opacity-80"
          />
          <div className="scan-shimmer pointer-events-none absolute inset-0" aria-hidden />
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-[6px] bg-ink/90 px-2.5 py-1 text-meta font-semibold text-white shadow-sm backdrop-blur-sm">
            <ReceiptText className="size-4" strokeWidth={1.75} aria-hidden />
            <span>กำลังสแกนสลิป</span>
          </span>
        </div>
      )}
      <div className="coupon grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3 p-4 text-body" aria-hidden>
        {["ยอดโอน", "วันเวลา", "ผู้รับ"].map((l, i) => (
          <div key={l} className="contents">
            <span className="text-muted">{l}</span>
            <span className={`reading-bar scan-shimmer h-6 rounded-[6px] border-2 border-dashed border-perf ${["w-28", "w-40", "w-32"][i]}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, check, numeric = false }: { label: string; value: string; check?: keyof typeof CHECK; numeric?: boolean }) {
  const c = check ? CHECK[check] : null;
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={`font-semibold ${numeric ? "num font-num" : ""}`}>{value}</dd>
      <dd className={`flex items-center gap-1 text-meta font-semibold ${c?.cls ?? ""}`}>
        {c && (
          <>
            <c.Icon className="size-5" strokeWidth={1.75} aria-hidden />
            {c.text}
          </>
        )}
      </dd>
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
  if (code === "too_large") return "ไฟล์ใหญ่เกินไป โปรดใช้ภาพหน้าจอสลิปจากแอปธนาคาร";
  if (code === "read_failed") return "อ่านสลิปไม่สำเร็จ โปรดถ่ายให้ชัดขึ้น หรือใช้ภาพหน้าจอจากแอปธนาคาร";
  return "เกิดข้อผิดพลาด โปรดลองอีกครั้ง";
}
