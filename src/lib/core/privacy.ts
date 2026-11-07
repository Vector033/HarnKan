// Data minimisation for what HarnKan keeps from a slip (PDPA): enough to show
// and match a payment, nothing that identifies more than it has to.

const TITLE = /^(นางสาว|น\.ส\.|นาย|นาง|ด\.ช\.|ด\.ญ\.|คุณ|mrs?\.?|ms\.?|miss)\s*/i;

/**
 * "น.ส. สมหญิง ดีมาก" -> "สมหญิง ด.", "MR. NAWAT WATTANAWONG" -> "NAWAT W."
 * Keeps the first name (what friends recognise) and the surname's first letter
 * only. Masked parts the bank already hid stay hidden.
 */
export function shortName(name: string | null | undefined): string | null {
  if (!name) return null;
  const words = name.normalize("NFC").trim().replace(TITLE, "").split(/\s+/).filter(Boolean);
  const [first, second] = words.filter((w) => !/^[xX*•]+\.?$/.test(w));
  if (!first) return null;
  if (!second) return first;
  return `${first} ${[...second][0]}.`;
}

/**
 * A slip's transaction reference, hashed with the trip id. Enough to notice
 * the same slip uploaded twice in one trip; the reference itself (which a
 * bank could look up) is never stored, and hashes cannot be linked across trips.
 */
export async function referenceHash(tripId: string, reference: string | null | undefined): Promise<string | null> {
  const ref = reference?.replace(/\s+/g, "").toUpperCase();
  if (!ref) return null;
  const bytes = new TextEncoder().encode(`harnkan:${tripId}:${ref}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The image type from the file's first bytes, ignoring what the browser
 * claimed. Anything that is not a still image the reader supports is null.
 */
export function sniffImage(head: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | "image/heic" | null {
  const b = head;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a)
    return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return "image/heic";
  return null;
}
