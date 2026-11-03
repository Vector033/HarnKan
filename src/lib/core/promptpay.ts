// PromptPay QR payloads (Thai QR Payment, built on EMVCo Merchant Presented
// Mode). Written here rather than pulled from a package so the format is
// tested field by field; tests cross-check the output against promptpay-qr.

import { satangToDecimal } from "./money";

const PROMPTPAY_AID = "A000000677010111";

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), as EMVCo requires. */
export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PromptPayKind = "phone" | "national_id" | "ewallet";

export function promptPayKind(id: string): PromptPayKind | null {
  const digits = id.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return "phone";
  if (digits.length === 13) return "national_id";
  if (digits.length === 15) return "ewallet";
  return null;
}

/**
 * The string to encode in the QR. `amountSatang` makes it a one-time QR with
 * the amount filled in; without it the payer types the amount.
 */
export function promptPayPayload(id: string, amountSatang?: number): string {
  const digits = id.replace(/\D/g, "");
  const kind = promptPayKind(digits);
  if (!kind) throw new Error("PromptPay id must be a 10-digit phone, 13-digit id or 15-digit e-wallet");

  // Phones are sent as 13 digits: country code 66 replaces the leading 0.
  const target =
    kind === "phone"
      ? tlv("01", ("0000000000000" + "66" + digits.slice(1)).slice(-13))
      : kind === "national_id"
        ? tlv("02", digits)
        : tlv("03", digits);

  const hasAmount = amountSatang !== undefined && amountSatang > 0;
  const body =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") + // 12 = dynamic (single use), 11 = static
    tlv("29", tlv("00", PROMPTPAY_AID) + target) +
    tlv("53", "764") + // THB
    (hasAmount ? tlv("54", satangToDecimal(amountSatang)) : "") +
    tlv("58", "TH");
  const withCrcTag = body + "6304";
  return withCrcTag + crc16(withCrcTag);
}

/** Masks a PromptPay id for display: 081-xxx-5678. */
export function maskPromptPay(id: string): string {
  const d = id.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-xxx-${d.slice(6)}`;
  return `${"x".repeat(d.length - 4)}${d.slice(-4)}`;
}
