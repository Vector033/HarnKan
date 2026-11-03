import { describe, expect, it } from "vitest";
import { bahtToSatang, formatBaht, parseBaht, satangToDecimal } from "./money";

describe("parseBaht", () => {
  it.each([
    ["120", 12_000],
    ["1,250.5", 125_050],
    ["฿ 99.99", 9_999],
    ["0.01", 1],
    ["20บาท", 2_000],
  ])("%s -> %d satang", (input, satang) => expect(parseBaht(input)).toBe(satang));

  it.each(["", "abc", "1.234", "-5", "1e3"])("rejects %j", (input) => expect(parseBaht(input)).toBeNull());
});

describe("formatting", () => {
  it("formats satang", () => {
    expect(formatBaht(123_456)).toBe("1,234.56");
    expect(formatBaht(120_000)).toBe("1,200");
    expect(formatBaht(120_000, { always2dp: true })).toBe("1,200.00");
    expect(formatBaht(-5)).toBe("-0.05");
  });
  it("converts for PromptPay and slips", () => {
    expect(satangToDecimal(5)).toBe("0.05");
    expect(satangToDecimal(100_000)).toBe("1000.00");
    expect(bahtToSatang(19.99)).toBe(1999);
    expect(bahtToSatang(0.1 + 0.2)).toBe(30);
  });
});
