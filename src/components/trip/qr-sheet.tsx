"use client";

import { FileImage } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { formatBaht } from "@/lib/core/money";
import { maskPromptPay, promptPayPayload } from "@/lib/core/promptpay";
import type { PlannedTransfer } from "@/lib/trip/derive";
import type { Member } from "@/lib/trip/types";
import { Sheet } from "../ui";

export function QrSheet({
  transfer,
  receiver,
  onClose,
  onUploadSlip,
}: {
  transfer: PlannedTransfer;
  receiver: Member;
  onClose: () => void;
  onUploadSlip: () => void;
}) {
  const amount = transfer.amount - transfer.claimedAmount;
  const payload = promptPayPayload(receiver.promptpay_id!, amount);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    // The SVG is generated locally from digits only, so injecting it is safe.
    QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#1b3f73" } }).then(setSvg);
  }, [payload]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={`โอนให้ ${receiver.nickname}`}
      footer={
        <button className="btn-primary w-full" onClick={onUploadSlip}>
          <FileImage className="size-5" aria-hidden /> โอนแล้ว แนบสลิป
        </button>
      }
    >
      <div className="flex flex-col items-center text-center">
        {/* PromptPay's own colours: the QR keeps the scheme people recognise at every shop counter. */}
        <div className="w-full rounded-[var(--radius-coupon)] bg-pp px-4 pb-5 pt-3.5 text-white">
          <p className="text-meta font-semibold">PromptPay · พร้อมเพย์</p>
          <div
            className="mx-auto mt-3 aspect-square w-60 max-w-full rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label={`QR พร้อมเพย์ ยอด ${formatBaht(amount, { always2dp: true })} บาท`}
            data-testid="promptpay-qr"
            data-payload={payload}
            dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
          />
          <p className="num mt-4 text-display font-semibold leading-none">{formatBaht(amount, { always2dp: true })} ฿</p>
          <p className="mt-2 text-body text-[#d6e2f3]">
            {receiver.payee_name || receiver.nickname} · {maskPromptPay(receiver.promptpay_id!)}
          </p>
        </div>
        <p className="mt-4 max-w-[36ch] text-body text-ink">
          สแกนด้วยแอปธนาคารใดก็ได้ ยอดเงินจะขึ้นให้อัตโนมัติ หรือบันทึกภาพหน้าจอแล้วเลือกรูปจากแอปธนาคาร
        </p>
        <p className="hint">โปรดตรวจชื่อผู้รับในแอปธนาคารให้ถูกต้องก่อนกดโอนทุกครั้ง</p>
      </div>
    </Sheet>
  );
}
