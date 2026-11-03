import { nameMatchScore, REVIEW_THRESHOLD, type SlipReadResult } from "@harnkan/slip-reader";
import { bahtToSatang } from "./money";

/** A transfer the uploader is expected to make. */
export interface MatchCandidate {
  toMemberId: string;
  amount: number; // satang
  /** Names this person may appear under on a slip: payee name, nickname. */
  names: string[];
  promptpayId?: string | null;
}

export type Check = "match" | "partial" | "mismatch" | "unknown";

export interface SlipMatch {
  candidate: MatchCandidate | null;
  /** True when the app may tick "paid" on its own (the receiver still confirms). */
  auto: boolean;
  checks: { amount: Check; receiver: Check; time: Check; duplicate: boolean };
  reasons: string[];
}

/**
 * Decides which expected transfer a slip pays for, and whether the match is
 * clear enough to mark it paid automatically. This never claims the transfer
 * happened: it only compares what was read off the image, and the receiver
 * has the final say.
 */
export function matchSlip(
  slip: SlipReadResult,
  candidates: MatchCandidate[],
  ctx: { tripCreatedAt: string; now?: Date; usedReferences?: Set<string> },
): SlipMatch {
  const now = ctx.now ?? new Date();
  const reasons: string[] = [];
  const duplicate = !!slip.reference.value && !!ctx.usedReferences?.has(slip.reference.value);
  if (duplicate) reasons.push("สลิปนี้เคยใช้บันทึกการจ่ายไปแล้ว");
  if (slip.issues.includes("not_a_slip")) reasons.push("รูปนี้ไม่น่าใช่สลิปโอนเงิน");

  const time = timeCheck(slip, ctx.tripCreatedAt, now);
  if (time === "mismatch") reasons.push("วันที่บนสลิปไม่อยู่ในช่วงของทริปนี้");
  if (time === "unknown") reasons.push("อ่านวันที่บนสลิปไม่ได้");

  const satang = slip.amount.value === null ? null : bahtToSatang(slip.amount.value);
  const scored = candidates.map((c) => {
    const amount: Check = satang === null ? "unknown" : satang === c.amount ? "match" : "mismatch";
    const receiver = receiverCheck(slip, c);
    const score =
      (amount === "match" ? 4 : 0) + ({ match: 2, partial: 1, unknown: 0.5, mismatch: 0 } as const)[receiver];
    return { c, amount, receiver, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (!best) {
    return { candidate: null, auto: false, checks: { amount: "unknown", receiver: "unknown", time, duplicate }, reasons: [...reasons, "ไม่มียอดค้างที่ต้องโอน"] };
  }
  if (best.amount === "mismatch") reasons.push("ยอดบนสลิปไม่ตรงกับยอดที่ต้องโอน");
  if (best.amount === "unknown") reasons.push("อ่านยอดเงินบนสลิปไม่ได้");
  if (best.receiver === "mismatch") reasons.push("ชื่อผู้รับบนสลิปไม่ตรงกับคนที่ต้องโอนให้");
  if (best.receiver === "partial") reasons.push("ชื่อผู้รับตรงกันแค่บางส่วน");
  if (slip.overallConfidence < REVIEW_THRESHOLD) reasons.push("AI ไม่ค่อยมั่นใจกับสิ่งที่อ่านได้");

  const auto =
    best.amount === "match" &&
    (best.receiver === "match" || best.receiver === "unknown") &&
    time === "match" &&
    !duplicate &&
    !slip.issues.includes("not_a_slip") &&
    slip.overallConfidence >= REVIEW_THRESHOLD;

  return {
    candidate: best.amount === "mismatch" && best.receiver !== "match" ? null : best.c,
    auto,
    checks: { amount: best.amount, receiver: best.receiver, time, duplicate },
    reasons,
  };
}

function timeCheck(slip: SlipReadResult, tripCreatedAt: string, now: Date): Check {
  if (!slip.dateTime.value) return "unknown";
  const t = Date.parse(slip.dateTime.value);
  const earliest = Date.parse(tripCreatedAt) - 24 * 3600_000; // money sent the day before the trip was made counts
  const latest = now.getTime() + 10 * 60_000; // phone clocks drift
  return t >= earliest && t <= latest ? "match" : "mismatch";
}

function receiverCheck(slip: SlipReadResult, c: MatchCandidate): Check {
  const r = slip.receiver;
  const ppLast4 = c.promptpayId ? c.promptpayId.replace(/\D/g, "").slice(-4) : null;
  // The receiving account's last digits are the strongest signal; for a
  // PromptPay phone transfer the slip shows the masked phone number.
  if (ppLast4 && r.accountLast4.value === ppLast4) return "match";

  const nameScore = r.name.value ? Math.max(0, ...c.names.filter(Boolean).map((n) => nameMatchScore(r.name.value!, n))) : null;
  if (nameScore !== null && nameScore >= 0.8) return "match";
  if (nameScore !== null && nameScore >= 0.5) return "partial";
  // A nickname ("ต้น") is often not on the slip at all, so a miss against
  // nicknames alone is not evidence of a wrong receiver.
  if (nameScore === null || c.names.length <= 1) return ppLast4 && r.accountLast4.value ? "mismatch" : "unknown";
  return "mismatch";
}
