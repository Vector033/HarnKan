// All money in the app is integer satang (1 baht = 100 satang) so that sums
// never pick up floating point drift. Convert only at the edges.

/** Parses what a person types ("1,250", "99.5", "฿ 20.00") into satang, or null. */
export function parseBaht(input: string): number | null {
  const cleaned = input.replace(/[฿,\s]/g, "").replace(/บาท$/, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const satang = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(satang) ? satang : null;
}

/** 123456 -> "1,234.56". Whole baht drop the decimals: 120000 -> "1,200". */
export function formatBaht(satang: number, opts: { always2dp?: boolean } = {}): string {
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(satang);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = abs % 100;
  if (frac === 0 && !opts.always2dp) return `${sign}${whole}`;
  return `${sign}${whole}.${String(frac).padStart(2, "0")}`;
}

/** Satang to the "123.45" string PromptPay and slips use. */
export function satangToDecimal(satang: number): string {
  return `${Math.floor(satang / 100)}.${String(satang % 100).padStart(2, "0")}`;
}

/** Baht as a float (e.g. from a slip reader) to satang, rounding half-cent noise. */
export function bahtToSatang(baht: number): number {
  return Math.round(baht * 100);
}
