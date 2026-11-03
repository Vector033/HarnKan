// Output contract shared with SlipJot's copy of this package, so either
// implementation can be dropped into either app.

export const BANK_CODES = [
  "KBANK",
  "SCB",
  "BBL",
  "KTB",
  "BAY",
  "TTB",
  "GSB",
  "BAAC",
  "GHB",
  "UOB",
  "CIMB",
  "KKP",
  "LHB",
  "TISCO",
  "TRUEMONEY",
  "OTHER",
] as const;
export type BankCode = (typeof BANK_CODES)[number];

export interface Field<T> {
  value: T | null;
  confidence: number; // 0..1
}

export interface Party {
  name: Field<string>;
  bank: Field<BankCode>;
  /** Last 4 digits of the account / PromptPay id as printed. Never the full number. */
  accountLast4: Field<string>;
}

export interface SlipReadResult {
  amount: Field<number>; // THB, 2dp
  dateTime: Field<string>; // ISO 8601 with +07:00, Buddhist year converted
  sender: Party;
  receiver: Party;
  reference: Field<string>;
  memo: Field<string>;
  qrPayload: string | null;
  overallConfidence: number;
  needsReview: boolean;
  issues: string[];
  source: "gemini" | "ocr" | "fake";
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
}
