import { normalizeThaiName } from "@harnkan/slip-reader";

// Vowels above/below the line and tone marks. OCR (and small slip fonts)
// drop or swap these far more often than base consonants: "ภานุวัฒน์" comes
// back as "ภานวัฒน์", "ก๋วยเตี๋ยว" as "ก๋วยเตี่ยว".
const MARKS = /[ัิ-ฺ็-๎]/g;

function skeleton(word: string) {
  return word.replace(MARKS, "");
}

/** Edit-distance similarity 0..1 over code points. */
export function similarity(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  if (!x.length && !y.length) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

/** Same word, allowing for the marks OCR loses and one or two misread letters. */
function sameWord(a: string, b: string) {
  if (a === b) return true;
  const [sa, sb] = [skeleton(a), skeleton(b)];
  return sa === sb || (Math.min([...sa].length, [...sb].length) >= 4 && similarity(sa, sb) >= 0.85);
}

/**
 * How well a name printed on a slip matches a name we know, 0..1.
 *
 * Both sides go through the slip reader's normalizeThaiName (titles and
 * trailing initials removed), so "น.ส. มะลิ ส." and "มะลิ สวยงาม" both start
 * with "มะลิ". Slips usually print the first name in full and cut the
 * surname, so a first-name match is treated as strong.
 */
export function nameMatchScore(slipName: string, known: string): number {
  const a = normalizeThaiName(slipName).split(" ").filter(Boolean);
  const b = normalizeThaiName(known).split(" ").filter(Boolean);
  if (!a.length || !b.length) return 0;
  if (a.join(" ") === b.join(" ")) return 1;
  // Shop names are one long word; compare them whole.
  if (sameWord(a.join(""), b.join(""))) return 0.95;
  if (!sameWord(a[0], b[0])) {
    // A first name cut off by the bank app ("ณวัฒ") still says something.
    const [short, long] = a[0].length < b[0].length ? [a[0], b[0]] : [b[0], a[0]];
    return [...short].length >= 3 && long.startsWith(short) ? 0.5 : 0;
  }
  const [sa, sb] = [a[1], b[1]];
  if (!sa || !sb) return 0.85;
  if (sameWord(sa, sb) || sa.startsWith(sb) || sb.startsWith(sa)) return 0.95;
  return 0.6; // same first name, different surname
}
