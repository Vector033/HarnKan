import { describe, expect, it } from "vitest";
import { finalize, fromGemini } from "@harnkan/slip-reader";
import { matchSlip, type MatchCandidate } from "./slip-match";

type GeminiSlip = Parameters<typeof fromGemini>[0];

const NOW = new Date("2026-11-04T12:00:00+07:00");
const ctx = { tripCreatedAt: "2026-11-03T09:00:00+07:00", now: NOW };

const party = (name: string | null, bank: GeminiSlip["sender"]["bank"], account: string | null) => ({
  name,
  name_confidence: 0.9,
  bank,
  bank_confidence: 0.9,
  account_masked: account,
  account_confidence: 0.9,
});
const raw: GeminiSlip = {
  is_transfer_slip: true,
  amount: 333.34,
  amount_confidence: 0.95,
  date_text: "4 พ.ย. 69 10:15",
  datetime_iso: "2026-11-04T10:15:00+07:00",
  datetime_confidence: 0.9,
  sender: party("นาย สมชาย ใจดี", "KBANK", "xxx-x-x1234-x"),
  receiver: party("น.ส. มะลิ ส.", "SCB", "xxx-xxx-5678"),
  reference: "REF1",
  reference_confidence: 0.9,
  memo: null,
  memo_confidence: 0,
};
const slip = (o: Partial<GeminiSlip> = {}) => finalize(fromGemini({ ...raw, ...o }, NOW), NOW);
const receiver = (name: string | null, account: string | null) => ({ receiver: party(name, "SCB", account) });

const mali: MatchCandidate = { toMemberId: "mali", amount: 33_334, names: ["มะลิ สวยงาม", "ลิ"], promptpayId: "0891235678" };
const ton: MatchCandidate = { toMemberId: "ton", amount: 50_000, names: ["ต้น"], promptpayId: null };

describe("matchSlip", () => {
  it("auto-ticks a slip whose amount, receiver and date all match", () => {
    const m = matchSlip(slip(), [ton, mali], ctx);
    expect(m.candidate?.toMemberId).toBe("mali");
    expect(m.auto).toBe(true);
    expect(m.checks).toEqual({ amount: "match", receiver: "match", time: "match", duplicate: false });
    expect(m.reasons).toEqual([]);
  });

  it("matches by the PromptPay number's last digits when the name is masked", () => {
    const m = matchSlip(slip(receiver("xxx", "xxx-xxx-5678")), [mali], ctx);
    expect(m.checks.receiver).toBe("match");
    expect(m.auto).toBe(true);
  });

  it("treats a nickname-only receiver as unknown, not wrong", () => {
    const m = matchSlip(slip({ amount: 500, ...receiver("น.ส. มะลิ ส.", null) }), [ton], ctx);
    expect(m.checks.receiver).toBe("unknown");
    expect(m.auto).toBe(true);
  });

  it("does not auto-tick a wrong amount", () => {
    const m = matchSlip(slip({ amount: 300 }), [mali], ctx);
    expect(m.checks.amount).toBe("mismatch");
    expect(m.auto).toBe(false);
    expect(m.candidate?.toMemberId).toBe("mali"); // receiver still identifies who it was for
    expect(m.reasons).toContain("ยอดบนสลิปไม่ตรงกับยอดที่ต้องโอน");
  });

  it("does not auto-tick a slip paid to someone else", () => {
    const m = matchSlip(slip(receiver("นาย สมศักดิ์ ร.", "xxx-xxx-9999")), [mali], ctx);
    expect(m.checks.receiver).toBe("mismatch");
    expect(m.auto).toBe(false);
  });

  it("does not auto-tick an old slip or a reused one", () => {
    const old = matchSlip(slip({ date_text: "1 ต.ค. 69 10:15", datetime_iso: null }), [mali], ctx);
    expect(old.checks.time).toBe("mismatch");
    expect(old.auto).toBe(false);

    const reused = matchSlip(slip(), [mali], { ...ctx, usedReferences: new Set(["REF1"]) });
    expect(reused.checks.duplicate).toBe(true);
    expect(reused.auto).toBe(false);
  });

  it("does not auto-tick when the reader was unsure", () => {
    const m = matchSlip(slip({ amount_confidence: 0.4 }), [mali], ctx);
    expect(m.auto).toBe(false);
  });

  it("says when there is nothing to pay", () => {
    const m = matchSlip(slip(), [], ctx);
    expect(m.candidate).toBeNull();
    expect(m.auto).toBe(false);
  });

  it("picks the candidate with the matching amount among several", () => {
    const other = { ...mali, toMemberId: "mali2", amount: 10_000 };
    expect(matchSlip(slip(), [other, mali], ctx).candidate?.toMemberId).toBe("mali");
  });
});
