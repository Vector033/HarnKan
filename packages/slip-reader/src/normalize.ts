// Rule-based parsing used to cross-check what the model read. The model is
// asked for the raw text it saw as well as its own interpretation; when the
// two disagree the field's confidence drops and the slip goes to review.

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

export function arabicDigits(s: string): string {
  return s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
}

/** "1,250.00", "฿1,250.00 บาท", "THB 99" -> 1250 / 99. Null when unreadable. */
export function parseAmountText(text: string): number | null {
  const t = arabicDigits(text).replace(/(THB|บาท|฿|\s)/gi, "");
  const m = t.match(/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/);
  if (!m) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const MONTHS: [RegExp, number][] = [
  [/^(ม\.?ค\.?|มกราคม|jan(uary)?)$/i, 1],
  [/^(ก\.?พ\.?|กุมภาพันธ์|feb(ruary)?)$/i, 2],
  [/^(มี\.?ค\.?|มีนาคม|mar(ch)?)$/i, 3],
  [/^(เม\.?ย\.?|เมษายน|apr(il)?)$/i, 4],
  [/^(พ\.?ค\.?|พฤษภาคม|may)$/i, 5],
  [/^(มิ\.?ย\.?|มิถุนายน|jun(e)?)$/i, 6],
  [/^(ก\.?ค\.?|กรกฎาคม|jul(y)?)$/i, 7],
  [/^(ส\.?ค\.?|สิงหาคม|aug(ust)?)$/i, 8],
  [/^(ก\.?ย\.?|กันยายน|sep(t|tember)?)$/i, 9],
  [/^(ต\.?ค\.?|ตุลาคม|oct(ober)?)$/i, 10],
  [/^(พ\.?ย\.?|พฤศจิกายน|nov(ember)?)$/i, 11],
  [/^(ธ\.?ค\.?|ธันวาคม|dec(ember)?)$/i, 12],
];

/**
 * Converts a slip year to the Gregorian year. Thai slips print the Buddhist
 * year, often as two digits ("69" = 2569 = 2026); English slips print "2026"
 * or "26". Two-digit years are read as Buddhist when that lands within a few
 * years of `now`, otherwise as Gregorian.
 */
export function gregorianYear(raw: number, now = new Date()): number {
  const current = now.getUTCFullYear();
  if (raw >= 2400) return raw - 543;
  if (raw >= 1900) return raw;
  const be = 2500 + raw - 543;
  const ce = 2000 + raw;
  return Math.abs(be - current) <= Math.abs(ce - current) ? be : ce;
}

/**
 * Parses the date/time line of a Thai bank slip into ISO 8601 (+07:00).
 * Handles "4 พ.ย. 69 14:32", "04 พฤศจิกายน 2569 - 14:32 น.", "04 Nov 26, 14:32",
 * "04/11/2569 14:32:05". Null if no full date and time can be found.
 */
export function parseThaiDateTime(text: string, now = new Date()): string | null {
  const t = arabicDigits(text).replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const time = t.match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?!\d)/);
  if (!time) return null;
  const [h, mi, s] = [Number(time[1]), Number(time[2]), Number(time[3] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  const datePart = t.replace(time[0], " ");

  let day: number, month: number, year: number;
  const numeric = datePart.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (numeric) {
    [day, month, year] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
  } else {
    const named = datePart.match(/(\d{1,2})\s*([^\d\s]+(?:\s?[^\d\s]+)?)\s*(\d{2,4})/);
    if (!named) return null;
    const word = named[2].replace(/\s/g, "");
    const found = MONTHS.find(([re]) => re.test(word));
    if (!found) return null;
    [day, month, year] = [Number(named[1]), found[1], Number(named[3])];
  }
  year = gregorianYear(year, now);
  if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) return null;

  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)}T${p(h)}:${p(mi)}:${p(s)}+07:00`;
}

function daysIn(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const TITLES = [
  "นางสาว",
  "น\\.ส\\.",
  "นาย",
  "นาง",
  "ด\\.ช\\.",
  "ด\\.ญ\\.",
  "คุณ",
  "mrs\\.?",
  "mr\\.?",
  "ms\\.?",
  "miss",
];
const TITLE_RE = new RegExp(`^(${TITLES.join("|")})\\s*`, "i");

/**
 * A comparable form of a name printed on a slip or typed by a user: titles
 * removed, case and spacing folded, masked parts ("xxx", "***") dropped.
 * "นาย ณวัฒน์ ว." -> "ณวัฒน์ ว", "MR. NAWAT W" -> "nawat w".
 */
export function normalizeThaiName(name: string): string {
  return name
    .normalize("NFC")
    .replace(/[*xX]{2,}/g, " ")
    .trim()
    .replace(TITLE_RE, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * How well a slip name matches a known name, 0..1. Slips usually show the
 * first name in full and the surname cut to an initial, so a first name match
 * plus a consistent initial counts as a strong match.
 */
export function nameMatchScore(slipName: string, known: string): number {
  const a = normalizeThaiName(slipName).split(" ").filter(Boolean);
  const b = normalizeThaiName(known).split(" ").filter(Boolean);
  if (!a.length || !b.length) return 0;
  if (a.join(" ") === b.join(" ")) return 1;
  if (a[0] !== b[0]) {
    // A cut-off first name ("ณวัฒ") still says something.
    const [short, long] = a[0].length < b[0].length ? [a[0], b[0]] : [b[0], a[0]];
    return short.length >= 3 && long.startsWith(short) ? 0.5 : 0;
  }
  const [sa, sb] = [a[1], b[1]];
  if (!sa || !sb) return 0.8;
  if (sa.startsWith(sb) || sb.startsWith(sa)) return 0.95;
  return 0.6;
}

/** Keeps only the last 4 digits of whatever account text the model returned. */
export function last4(text: string | null | undefined): string | null {
  if (!text) return null;
  const digits = arabicDigits(text).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}
