import { describe, expect, it } from "vitest";
import generatePayload from "promptpay-qr";
import { crc16, maskPromptPay, promptPayKind, promptPayPayload } from "./promptpay";

/** Splits an EMVCo payload into its top-level tag -> value pairs. */
function parseTlv(s: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < s.length) {
    const id = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    out.set(id, s.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}

describe("crc16", () => {
  it("matches the CRC-16/CCITT-FALSE check value", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
});

describe("promptPayPayload", () => {
  it("builds a static phone QR", () => {
    const p = promptPayPayload("081-234-5678");
    const tags = parseTlv(p);
    expect(tags.get("00")).toBe("01");
    expect(tags.get("01")).toBe("11");
    expect(tags.get("29")).toBe("0016A00000067701011101130066812345678");
    expect(tags.get("53")).toBe("764");
    expect(tags.has("54")).toBe(false);
    expect(tags.get("58")).toBe("TH");
  });

  it("makes a dynamic QR with the amount in baht with 2 decimals", () => {
    const tags = parseTlv(promptPayPayload("0812345678", 12_050));
    expect(tags.get("01")).toBe("12");
    expect(tags.get("54")).toBe("120.50");
  });

  it("ends with a valid CRC over everything before it", () => {
    const p = promptPayPayload("0812345678", 100);
    expect(p.slice(-8, -4)).toBe("6304");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it.each([
    ["0812345678", undefined],
    ["0899999999", 1],
    ["1234567890123", 50_000],
    ["123456789012345", 99_999_999],
  ])("agrees field by field with promptpay-qr for %s / %s satang", (id, amount) => {
    const mine = parseTlv(promptPayPayload(id, amount));
    const ref = parseTlv(generatePayload(id, { amount: amount === undefined ? undefined : amount / 100 }));
    for (const tag of ["00", "01", "29", "53", "54", "58"]) expect(mine.get(tag), tag).toBe(ref.get(tag));
  });

  it("uses tag 02 for a 13-digit id and 03 for an e-wallet", () => {
    expect(parseTlv(promptPayPayload("1234567890123")).get("29")).toContain("02131234567890123");
    expect(parseTlv(promptPayPayload("123456789012345")).get("29")).toContain("0315123456789012345");
  });

  it("rejects ids that are not a PromptPay target", () => {
    expect(() => promptPayPayload("12345")).toThrow();
    expect(() => promptPayPayload("1812345678")).toThrow();
  });
});

describe("helpers", () => {
  it("detects the id kind", () => {
    expect(promptPayKind("081 234 5678")).toBe("phone");
    expect(promptPayKind("1-2345-67890-12-3")).toBe("national_id");
    expect(promptPayKind("999")).toBeNull();
  });

  it("masks ids for display", () => {
    expect(maskPromptPay("0812345678")).toBe("081-xxx-5678");
    expect(maskPromptPay("1234567890123")).toBe("xxxxxxxxx0123");
  });
});
