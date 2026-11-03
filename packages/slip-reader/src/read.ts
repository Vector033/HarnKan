import { z } from "zod";
import { last4, parseAmountText, parseThaiDateTime } from "./normalize";
import { BANK_CODES, type BankCode, type Field, type Party, type SlipReadResult } from "./types";

/** What the vision model is asked to return. Raw text is kept for cross-checks. */
export const ModelSlipSchema = z.object({
  is_transfer_slip: z.boolean(),
  amount_text: z.string().nullable(),
  amount: z.number().nullable(),
  datetime_text: z.string().nullable(),
  datetime_iso: z.string().nullable(),
  sender_name: z.string().nullable(),
  sender_bank: z.enum(BANK_CODES).nullable(),
  sender_account: z.string().nullable(),
  receiver_name: z.string().nullable(),
  receiver_bank: z.enum(BANK_CODES).nullable(),
  receiver_account: z.string().nullable(),
  reference: z.string().nullable(),
  memo: z.string().nullable(),
  confidence: z.object({
    amount: z.number().min(0).max(1),
    datetime: z.number().min(0).max(1),
    receiver: z.number().min(0).max(1),
    sender: z.number().min(0).max(1),
  }),
});
export type ModelSlip = z.infer<typeof ModelSlipSchema>;

export const SLIP_SYSTEM_PROMPT = `You read Thai bank transfer slips (e-slips from mobile banking apps and PromptPay).
Return only what is printed on the image. Never guess a value that is not visible; use null instead.
- amount_text: the transfer amount exactly as printed, e.g. "1,250.00". amount: the same as a number in baht.
- datetime_text: the date and time line exactly as printed (Thai slips use Buddhist years, often 2 digits, e.g. "4 พ.ย. 69 14:32").
  datetime_iso: your reading of it as ISO 8601 in Thailand time (+07:00) with the Gregorian year.
- sender_* is the payer (จาก / From), receiver_* the payee (ไปยัง / ถึง / To). Names as printed, including titles and masking.
- *_account: the account, phone or PromptPay number as printed, masked parts included (e.g. "xxx-x-x1234-x").
- *_bank: the bank of that party, from the logo or text; OTHER if not one of the listed codes.
- reference: the transaction reference / เลขที่รายการ. memo: บันทึกช่วยจำ / note, if any.
- is_transfer_slip: false if the image is not a completed money transfer slip.
- confidence: your confidence 0..1 that each group was read correctly from a clear image.`;

export interface VisionModel {
  readonly source: SlipReadResult["source"];
  readonly model?: string;
  read(image: Uint8Array, mimeType: string): Promise<{ slip: unknown; usage?: SlipReadResult["usage"] }>;
}

export class SlipReadError extends Error {}

const MAX_AMOUNT = 2_000_000; // above a single PromptPay transfer limit; anything bigger is a misread
export const REVIEW_THRESHOLD = 0.7;

/** Validates the model's answer, cross-checks it with the rule parsers and scores it. */
export function finalize(raw: unknown, meta: Pick<SlipReadResult, "source" | "model" | "usage">, now = new Date()) {
  const parsed = ModelSlipSchema.safeParse(raw);
  if (!parsed.success) throw new SlipReadError(`Model output failed validation: ${parsed.error.message}`);
  const m = parsed.data;
  const issues: string[] = [];

  // Amount: the number the model gave must agree with the text it saw.
  let amount: Field<number> = { value: null, confidence: 0 };
  const fromText = m.amount_text ? parseAmountText(m.amount_text) : null;
  const candidate = fromText ?? m.amount;
  if (candidate !== null) {
    let c = m.confidence.amount;
    if (fromText !== null && m.amount !== null && Math.abs(fromText - m.amount) > 0.005) {
      issues.push("amount_text_mismatch");
      c = Math.min(c, 0.3);
    }
    if (fromText === null) c = Math.min(c, 0.6);
    if (candidate <= 0 || candidate > MAX_AMOUNT) {
      issues.push("amount_out_of_range");
      c = 0;
    }
    amount = { value: candidate, confidence: c };
  } else issues.push("amount_missing");

  // Date/time: prefer our own parse of the printed text.
  let dateTime: Field<string> = { value: null, confidence: 0 };
  const parsedDate = m.datetime_text ? parseThaiDateTime(m.datetime_text, now) : null;
  const modelDate = m.datetime_iso && !Number.isNaN(Date.parse(m.datetime_iso)) ? m.datetime_iso : null;
  if (parsedDate || modelDate) {
    let c = m.confidence.datetime;
    if (parsedDate && modelDate && Math.abs(Date.parse(parsedDate) - Date.parse(modelDate)) > 60_000) {
      issues.push("datetime_mismatch");
      c = Math.min(c, 0.4);
    }
    if (!parsedDate) c = Math.min(c, 0.6);
    const value = parsedDate ?? modelDate!;
    if (Date.parse(value) > now.getTime() + 10 * 60_000) {
      issues.push("datetime_in_future");
      c = Math.min(c, 0.2);
    }
    dateTime = { value, confidence: c };
  } else issues.push("datetime_missing");

  const party = (name: string | null, bank: BankCode | null, account: string | null, c: number): Party => ({
    name: { value: name?.trim() || null, confidence: name ? c : 0 },
    bank: { value: bank, confidence: bank ? c : 0 },
    accountLast4: { value: last4(account), confidence: last4(account) ? c : 0 },
  });
  const receiver = party(m.receiver_name, m.receiver_bank, m.receiver_account, m.confidence.receiver);
  const sender = party(m.sender_name, m.sender_bank, m.sender_account, m.confidence.sender);
  if (!receiver.name.value && !receiver.accountLast4.value) issues.push("receiver_missing");

  if (!m.is_transfer_slip) issues.push("not_a_slip");
  const receiverConfidence = Math.max(receiver.name.confidence, receiver.accountLast4.confidence);
  const overallConfidence = m.is_transfer_slip
    ? Math.min(amount.confidence, dateTime.confidence, receiverConfidence)
    : 0;

  const result: SlipReadResult = {
    amount,
    dateTime,
    sender,
    receiver,
    reference: { value: m.reference?.trim() || null, confidence: m.reference ? m.confidence.sender : 0 },
    memo: { value: m.memo?.trim() || null, confidence: m.memo ? 0.8 : 0 },
    qrPayload: null,
    overallConfidence: round2(overallConfidence),
    needsReview: overallConfidence < REVIEW_THRESHOLD || issues.length > 0,
    issues,
    ...meta,
  };
  return result;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function readSlipWith(model: VisionModel, image: Uint8Array, mimeType: string, now = new Date()) {
  const { slip, usage } = await model.read(image, mimeType);
  return finalize(slip, { source: model.source, model: model.model, usage }, now);
}
