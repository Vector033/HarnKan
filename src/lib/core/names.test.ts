import { describe, expect, it } from "vitest";
import { nameMatchScore } from "./names";

describe("nameMatchScore", () => {
  it("matches a slip's short form against a full name", () => {
    expect(nameMatchScore("น.ส. มะลิ ส.", "มะลิ สวยงาม")).toBeGreaterThanOrEqual(0.8);
    expect(nameMatchScore("MR. NAWAT W", "Nawat Wattanawong")).toBeGreaterThanOrEqual(0.8);
    expect(nameMatchScore("นาย ณวัฒน์ วัฒนวงศ์", "ณวัฒน์ วัฒนวงศ์")).toBe(1);
  });
  it("scores a different surname lower and a different person zero", () => {
    expect(nameMatchScore("นาย มะลิ กิจการ", "มะลิ สวยงาม")).toBe(0.6);
    expect(nameMatchScore("สมชาย", "มะลิ")).toBe(0);
  });
  it("tolerates marks and letters that OCR drops", () => {
    expect(nameMatchScore("นางสาว ภานวัฒน์ สายสุวรรณ", "ภานุวัฒน์ สายสุวรรณ")).toBeGreaterThanOrEqual(0.9);
    expect(nameMatchScore("ก๋วยเติียวเรือลุงชัย", "ก๋วยเตี๋ยวเรือลุงชัย")).toBeGreaterThanOrEqual(0.9);
    expect(nameMatchScore("นาย อรอมา คำแสน", "อรอุมา คำแสน")).toBeGreaterThanOrEqual(0.9);
    // ...but different people stay different.
    expect(nameMatchScore("วรวุฒิ ทองคำ", "ภานุวัฒน์ สายสุวรรณ")).toBe(0);
    expect(nameMatchScore("สมชาย ใจดี", "สมหญิง ใจดี")).toBeLessThan(0.8);
  });

  it("gives partial credit to a cut-off first name", () => {
    expect(nameMatchScore("ณวัฒ", "ณวัฒน์")).toBe(0.5);
  });
});
