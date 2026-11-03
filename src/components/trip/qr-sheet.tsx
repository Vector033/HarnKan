"use client";

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
    QRCode.toString(payload, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#1b3f73" } }).then(setSvg);
  }, [payload]);

  return (
    <Sheet
      open
      onClose={onClose}
      title={`โอนให้ ${receiver.nickname}`}
      footer={
        <button className="btn-primary w-full" onClick={onUploadSlip}>
          โอนแล้ว แนบสลิป
        </button>
      }
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-full rounded-2xl bg-pp px-4 pb-5 pt-3 text-white">
          <p className="text-sm font-semibold tracking-wide">PromptPay · พร้อมเพย์</p>
          <div
            className="mx-auto mt-3 aspect-square w-60 max-w-full rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
            data-testid="promptpay-qr"
            data-payload={payload}
            dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
          />
          <p className="num mt-4 text-3xl font-bold">{formatBaht(amount, { always2dp: true })} ฿</p>
          <p className="mt-1 text-sm opacity-90">
            {receiver.payee_name || receiver.nickname} · {maskPromptPay(receiver.promptpay_id!)}
          </p>
        </div>
        <p className="mt-4 text-sm text-muted">
          สแกนด้วยแอปธนาคารไหนก็ได้ ยอดจะขึ้นให้เอง หรือแคปหน้าจอไว้แล้วเลือกรูปจากแอปธนาคาร
        </p>
        <p className="mt-2 text-xs text-muted">ตรวจชื่อผู้รับในแอปธนาคารให้ตรงก่อนกดโอนทุกครั้ง</p>
      </div>
    </Sheet>
  );
}
