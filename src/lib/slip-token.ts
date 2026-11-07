import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SlipSummary } from "@/lib/trip/types";

/**
 * A short-lived, server-signed receipt of what the slip route read. The
 * browser can hand it back to record the payment ("the data is right"), but
 * cannot change a field or invent one: the signature covers all of it.
 */
export interface SlipClaim {
  userId: string;
  tripId: string;
  from: string;
  to: string;
  amount: number;
  slip: SlipSummary;
  exp: number;
}

const TTL_MS = 15 * 60_000;

function key() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createHmac("sha256", secret).update("harnkan:slip-claim:v1").digest();
}

export function signSlipClaim(claim: Omit<SlipClaim, "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...claim, exp: Date.now() + TTL_MS })).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifySlipClaim(token: string): SlipClaim | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claim = JSON.parse(Buffer.from(body, "base64url").toString()) as SlipClaim;
  return claim.exp > Date.now() ? claim : null;
}
