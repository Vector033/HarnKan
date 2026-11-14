import { describe, expect, it } from "vitest";
import { progress, settlementText, type PlannedTransfer } from "./derive";
import type { Payment } from "./types";

const pay = (amount: number, status: Payment["status"]) => ({ amount, status }) as Payment;

describe("progress", () => {
  it("is empty with nothing to settle", () => {
    expect(progress([], [])).toEqual({ settled: 0, toSettle: 0 });
  });
  it("counts only confirmed payments as settled", () => {
    const r = progress([pay(1000, "confirmed"), pay(500, "claimed"), pay(300, "rejected"), pay(200, "cancelled")], [{ amount: 2000 }]);
    expect(r).toEqual({ settled: 1000, toSettle: 3000 });
  });
  it("is complete when no transfers remain", () => {
    expect(progress([pay(2500, "confirmed")], [])).toEqual({ settled: 2500, toSettle: 2500 });
  });
});

describe("settlementText", () => {
  const names: Record<string, string> = { a: "มิ้นต์", b: "ต้น", c: "แบม" };
  const t = (from: string, to: string, amount: number, claimedAmount = 0) => ({ from, to, amount, claims: [], claimedAmount }) as PlannedTransfer;
  it("lists what is left to pay, and marks claims waiting for the receiver", () => {
    const text = settlementText("เชียงดาว", [t("b", "a", 22000), t("c", "a", 123456, 50000), t("c", "b", 4500, 4500)], (id) => names[id], "https://x/t/1");
    expect(text.split("\n")).toEqual([
      "หารกัน · เชียงดาว",
      "ใครโอนให้ใคร",
      "• ต้น โอนให้ มิ้นต์ 220 บาท",
      "• แบม โอนให้ มิ้นต์ 734.56 บาท",
      "• แบม โอนให้ ต้น 45 บาท (แจ้งโอนแล้ว รอ ต้น ยืนยัน)",
      "ดูรายละเอียดและ QR พร้อมเพย์: https://x/t/1",
    ]);
  });
  it("says so when nobody owes anything", () => {
    expect(settlementText("ทริป", [], () => "", "u")).toContain("ทุกคนโอนกันครบแล้ว");
  });
});
