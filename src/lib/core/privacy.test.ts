import { describe, expect, it } from "vitest";
import { referenceHash, shortName, sniffImage } from "./privacy";

describe("shortName", () => {
  it.each([
    ["น.ส. สมหญิง ดีมาก", "สมหญิง ด."],
    ["นาย ณวัฒน์ วัฒนวงศ์", "ณวัฒน์ ว."],
    ["MR. NAWAT WATTANAWONG", "NAWAT W."],
    ["มะลิ", "มะลิ"],
    ["นางสาว xxx มะลิ ส.", "มะลิ ส."],
    ["ร้านข้าวมันไก่ป้าแดง", "ร้านข้าวมันไก่ป้าแดง"],
  ])("%s -> %s", (input, out) => expect(shortName(input)).toBe(out));

  it("returns null for nothing usable", () => {
    expect(shortName(null)).toBeNull();
    expect(shortName("xxx")).toBeNull();
  });
});

describe("referenceHash", () => {
  it("is stable, ignores spacing and case, and differs per trip", async () => {
    const a = await referenceHash("trip-1", "0163 0810 abc");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await referenceHash("trip-1", "01630810ABC")).toBe(a);
    expect(await referenceHash("trip-2", "01630810ABC")).not.toBe(a);
    expect(await referenceHash("trip-1", null)).toBeNull();
  });
});

describe("sniffImage", () => {
  const bytes = (...xs: (number | string)[]) =>
    new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
  it("recognises real image headers", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniffImage(bytes(0, 0, 0, 0x18, "ftyp", "heic"))).toBe("image/heic");
  });
  it("rejects anything else, whatever its name or claimed type", () => {
    expect(sniffImage(bytes("<svg"))).toBeNull();
    expect(sniffImage(bytes("%PDF-1.7"))).toBeNull();
    expect(sniffImage(bytes("GIF89a"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
