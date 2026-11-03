import { describe, expect, it } from "vitest";
import {
  FakeVision,
  finalize,
  gregorianYear,
  last4,
  nameMatchScore,
  normalizeThaiName,
  parseAmountText,
  parseThaiDateTime,
  readSlip,
  type ModelSlip,
} from "./index";

const NOW = new Date("2026-11-04T12:00:00+07:00");

const good: ModelSlip = {
  is_transfer_slip: true,
  amount_text: "1,250.00",
  amount: 1250,
  datetime_text: "4 พ.ย. 69 10:15",
  datetime_iso: "2026-11-04T10:15:00+07:00",
  sender_name: "นาย สมชาย ใจดี",
  sender_bank: "KBANK",
  sender_account: "xxx-x-x1234-x",
  receiver_name: "น.ส. มะลิ ส.",
  receiver_bank: "SCB",
  receiver_account: "xxx-xxx-5678",
  reference: "016308101512ABC",
  memo: null,
  confidence: { amount: 0.95, datetime: 0.9, receiver: 0.9, sender: 0.9 },
};

describe("parseAmountText", () => {
  it.each([
    ["1,250.00", 1250],
    ["฿ 99.50", 99.5],
    ["20 บาท", 20],
    ["๑,๐๐๐.๐๐", 1000],
  ])("%s", (t, v) => expect(parseAmountText(t)).toBe(v));
  it.each(["", "1,25,0", "abc", "0.00", "12.345"])("rejects %j", (t) => expect(parseAmountText(t)).toBeNull());
});

describe("parseThaiDateTime", () => {
  it.each([
    ["4 พ.ย. 69 14:32", "2026-11-04T14:32:00+07:00"],
    ["04 พฤศจิกายน 2569 - 14:32 น.", "2026-11-04T14:32:00+07:00"],
    ["04 Nov 26, 14:32", "2026-11-04T14:32:00+07:00"],
    ["04 Nov 2026 2:05", "2026-11-04T02:05:00+07:00"],
    ["04/11/2569 14:32:05", "2026-11-04T14:32:05+07:00"],
    ["๔ พ.ย. ๖๙ ๐๙:๐๐", "2026-11-04T09:00:00+07:00"],
    ["29 ก.พ. 67 08:00", "2024-02-29T08:00:00+07:00"],
  ])("%s", (t, iso) => expect(parseThaiDateTime(t, NOW)).toBe(iso));

  it.each(["4 พ.ย. 69", "31 ก.พ. 69 10:00", "4 abc 69 10:00", "4 พ.ย. 69 25:00"])("rejects %j", (t) =>
    expect(parseThaiDateTime(t, NOW)).toBeNull(),
  );

  it("reads two-digit years as Buddhist when that is the plausible one", () => {
    expect(gregorianYear(69, NOW)).toBe(2026);
    expect(gregorianYear(26, NOW)).toBe(2026);
    expect(gregorianYear(2569, NOW)).toBe(2026);
  });
});

describe("names", () => {
  it("normalizes titles, masking and case", () => {
    expect(normalizeThaiName("นาย ณวัฒน์ ว.")).toBe("ณวัฒน์ ว");
    expect(normalizeThaiName("MR. NAWAT W")).toBe("nawat w");
    expect(normalizeThaiName("น.ส.มะลิ  ส.")).toBe("มะลิ ส");
    expect(normalizeThaiName("นางสาว xxx มะลิ")).toBe("มะลิ");
  });

  it("scores slip names against known names", () => {
    expect(nameMatchScore("น.ส. มะลิ ส.", "มะลิ สวยงาม")).toBeGreaterThan(0.9);
    expect(nameMatchScore("MR. NAWAT W", "Nawat Wattanawong")).toBeGreaterThan(0.9);
    expect(nameMatchScore("นาย มะลิ ก.", "มะลิ สวยงาม")).toBe(0.6);
    expect(nameMatchScore("มะลิ", "มะลิ")).toBe(1);
    expect(nameMatchScore("สมชาย", "มะลิ")).toBe(0);
  });

  it("keeps only the last 4 digits of an account", () => {
    expect(last4("xxx-x-x1234-x")).toBe("1234");
    expect(last4("123-4-56789-0")).toBe("7890");
    expect(last4("xxx")).toBeNull();
  });
});

describe("finalize", () => {
  it("accepts a clean slip", () => {
    const r = finalize(good, { source: "fake" }, NOW);
    expect(r.amount).toEqual({ value: 1250, confidence: 0.95 });
    expect(r.dateTime.value).toBe("2026-11-04T10:15:00+07:00");
    expect(r.receiver.accountLast4.value).toBe("5678");
    expect(r.sender.accountLast4.value).toBe("1234");
    expect(r.issues).toEqual([]);
    expect(r.needsReview).toBe(false);
    expect(r.overallConfidence).toBe(0.9);
  });

  it("flags an amount that disagrees with its own text", () => {
    const r = finalize({ ...good, amount: 125 }, { source: "fake" }, NOW);
    expect(r.issues).toContain("amount_text_mismatch");
    expect(r.amount.value).toBe(1250); // trusts the printed text
    expect(r.needsReview).toBe(true);
  });

  it("flags a model date that disagrees with the printed date (Buddhist year slip-ups)", () => {
    const r = finalize({ ...good, datetime_iso: "2569-11-04T10:15:00+07:00" }, { source: "fake" }, NOW);
    expect(r.issues).toContain("datetime_mismatch");
    expect(r.dateTime.value).toBe("2026-11-04T10:15:00+07:00");
  });

  it("flags slips dated in the future", () => {
    const r = finalize({ ...good, datetime_text: "5 พ.ย. 69 10:15", datetime_iso: null }, { source: "fake" }, NOW);
    expect(r.issues).toContain("datetime_in_future");
  });

  it("rejects absurd amounts", () => {
    const r = finalize({ ...good, amount_text: "9,999,999.00", amount: 9999999 }, { source: "fake" }, NOW);
    expect(r.amount.confidence).toBe(0);
    expect(r.issues).toContain("amount_out_of_range");
  });

  it("scores a non-slip as zero", () => {
    const r = finalize({ ...good, is_transfer_slip: false }, { source: "fake" }, NOW);
    expect(r.overallConfidence).toBe(0);
    expect(r.issues).toContain("not_a_slip");
  });

  it("throws on output that does not match the schema", () => {
    expect(() => finalize({ amount: "lots" }, { source: "fake" }, NOW)).toThrow(/validation/);
  });
});

describe("readSlip", () => {
  it("runs the given vision model", async () => {
    const r = await readSlip(new Uint8Array([1, 2, 3]), "image/png", { vision: new FakeVision(good) });
    expect(r.source).toBe("fake");
    expect(r.amount.value).toBe(1250);
  });

  it("refuses unsupported files", async () => {
    await expect(readSlip(new Uint8Array(), "application/pdf", { vision: new FakeVision(good) })).rejects.toThrow(
      /Unsupported/,
    );
  });

  it("needs a provider", async () => {
    const old = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await expect(readSlip(new Uint8Array([1]), "image/png")).rejects.toThrow(/GEMINI_API_KEY/);
    if (old) process.env.GEMINI_API_KEY = old;
  });
});
