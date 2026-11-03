import { describe, expect, it } from "vitest";
import { finalize, type ModelSlip } from "@harnkan/slip-reader";
import { matchSlip, type MatchCandidate } from "./slip-match";

const NOW = new Date("2026-11-04T12:00:00+07:00");
const ctx = { tripCreatedAt: "2026-11-03T09:00:00+07:00", now: NOW };

const raw: ModelSlip = {
  is_transfer_slip: true,
  amount_text: "333.34",
  amount: 333.34,
  datetime_text: "4 พ.ย. 69 10:15",
  datetime_iso: "2026-11-04T10:15:00+07:00",
  sender_name: "นาย สมชาย ใจดี",
  sender_bank: "KBANK",
  sender_account: "xxx-x-x1234-x",
  receiver_name: "น.ส. มะลิ ส.",
  receiver_bank: "SCB",
  receiver_account: "xxx-xxx-5678",
  reference: "REF1",
  memo: null,
  confidence: { amount: 0.95, datetime: 0.9, receiver: 0.9, sender: 0.9 },
};
const slip = (o: Partial<ModelSlip> = {}) => finalize({ ...raw, ...o }, { source: "fake" }, NOW);

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
    const m = matchSlip(slip({ receiver_name: "xxx" }), [mali], ctx);
    expect(m.checks.receiver).toBe("match");
    expect(m.auto).toBe(true);
  });

  it("treats a nickname-only receiver as unknown, not wrong", () => {
    const m = matchSlip(slip({ amount_text: "500.00", amount: 500, receiver_account: null }), [ton], ctx);
    expect(m.checks.receiver).toBe("unknown");
    expect(m.auto).toBe(true);
  });

  it("does not auto-tick a wrong amount", () => {
    const m = matchSlip(slip({ amount_text: "300.00", amount: 300 }), [mali], ctx);
    expect(m.checks.amount).toBe("mismatch");
    expect(m.auto).toBe(false);
    expect(m.candidate?.toMemberId).toBe("mali"); // receiver still identifies who it was for
    expect(m.reasons).toContain("ยอดบนสลิปไม่ตรงกับยอดที่ต้องโอน");
  });

  it("does not auto-tick a slip paid to someone else", () => {
    const m = matchSlip(slip({ receiver_name: "นาย สมศักดิ์ ร.", receiver_account: "xxx-xxx-9999" }), [mali], ctx);
    expect(m.checks.receiver).toBe("mismatch");
    expect(m.auto).toBe(false);
  });

  it("does not auto-tick an old slip or a reused one", () => {
    const old = matchSlip(slip({ datetime_text: "1 ต.ค. 69 10:15", datetime_iso: null }), [mali], ctx);
    expect(old.checks.time).toBe("mismatch");
    expect(old.auto).toBe(false);

    const reused = matchSlip(slip(), [mali], { ...ctx, usedReferences: new Set(["REF1"]) });
    expect(reused.checks.duplicate).toBe(true);
    expect(reused.auto).toBe(false);
  });

  it("does not auto-tick when the reader was unsure", () => {
    const m = matchSlip(slip({ confidence: { ...raw.confidence, amount: 0.4 } }), [mali], ctx);
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
