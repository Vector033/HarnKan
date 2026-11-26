import { finalize, fromGemini, readSlip, SlipReaderError, type SlipReadResult } from "@harnkan/slip-reader";
import { randomUUID } from "node:crypto";
import { referenceHash, shortName, sniffImage } from "@/lib/core/privacy";
import { matchSlip, type SlipMatch } from "@/lib/core/slip-match";
import { balances, settle } from "@/lib/core/settle";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signSlipClaim } from "@/lib/slip-token";
import type { Json } from "@/lib/supabase/database.types";
import type { Expense, Member, Payment, SlipSummary } from "@/lib/trip/types";

export interface SlipResponse {
  summary: SlipSummary;
  match: Pick<SlipMatch, "auto" | "checks" | "reasons"> & { toMemberId: string | null };
  payment: Payment | null;
  /** Signed receipt for "the data is right, record it" when the match was not automatic. */
  claimToken: string | null;
}

// Vercel caps request bodies at 4.5 MB; the client downsizes photos well below this.
const MAX_BYTES = 4 * 1024 * 1024;
const READ_TIMEOUT_MS = 50_000;

// Local OCR on a cold start downloads language data first; leave it room.
export const maxDuration = 60;

/**
 * Reads a transfer slip and, when it clearly pays one of the uploader's
 * outstanding transfers, records a 'claimed' payment for the receiver to
 * confirm.
 *
 * The image only exists in this request's memory. It is passed to the vision
 * model and dropped; only the fields in SlipSummary are kept (PDPA).
 */
export async function POST(req: Request) {
  // Cookies are SameSite=Lax already; refusing foreign origins outright also
  // covers browsers and embeds that treat that differently.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json({ error: "bad_origin" }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return json({ error: "bad_image" }, 413);

  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "not_signed_in" }, 401);

  const form = await req.formData().catch(() => null);
  const file = form?.get("slip");
  const tripId = String(form?.get("trip_id") ?? "");
  const fromMember = String(form?.get("from_member") ?? "");
  const toMember = String(form?.get("to_member") ?? "");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > MAX_BYTES ||
    !UUID.test(tripId) ||
    !UUID.test(fromMember) ||
    (toMember && !UUID.test(toMember))
  )
    return json({ error: "bad_image" }, 400);

  // Everything below is read with the caller's own session, so RLS decides
  // what they can see; a non-member gets empty results.
  const [trip, members, expenses, payments] = await Promise.all([
    sb.from("trips").select("created_at").eq("id", tripId).maybeSingle(),
    sb.from("members").select("*").eq("trip_id", tripId),
    sb.from("expenses").select("*").eq("trip_id", tripId),
    sb.from("payments").select("*").eq("trip_id", tripId),
  ]);
  if (!trip.data) return json({ error: "not_member" }, 403);
  const ms = (members.data ?? []) as Member[];
  const from = ms.find((m) => m.id === fromMember);
  const me = ms.find((m) => m.user_id === auth.user.id);
  // You can upload your own slip, or one for a friend who has not joined yet.
  if (!from || !me || (from.id !== me.id && from.user_id !== null)) return json({ error: "not_allowed" }, 403);

  if (process.env.SLIP_READER === "off") return json({ error: "not_configured" }, 503);
  const limit = await sb.rpc("note_slip_read", {});
  if (limit.error) return json({ error: /rate_limited/.test(limit.error.message) ? "rate_limited" : "error" }, 429);

  let image: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
  // Trust the bytes, not the file name or the type the browser sent.
  const mime = sniffImage(image.subarray(0, 16));
  if (!mime && !fakeReaderEnabled()) return json({ error: "bad_image" }, 400);

  let slip: SlipReadResult;
  try {
    // Gemini when GEMINI_API_KEY is set, otherwise local Thai OCR.
    slip = fakeReaderEnabled() ? fakeRead(image) : await withTimeout(readSlip(image, mime!), READ_TIMEOUT_MS);
  } catch (e) {
    // Log the failure kind only: never the image or anything read from it.
    console.error("slip read failed:", e instanceof SlipReaderError ? e.message.slice(0, 120) : (e as Error)?.name);
    return json({ error: "read_failed" }, isUpstreamSlipError(e) ? 502 : 422);
  } finally {
    image = null; // drop the only reference to the slip image
  }

  // Image decoded cleanly, yet yielded zero slip fields (e.g. a non-slip photo or blank image).
  if (
    slip.amount.value === null &&
    slip.dateTime.value === null &&
    slip.receiver.name.value === null &&
    slip.receiver.accountLast4.value === null &&
    slip.reference.value === null
  ) {
    return json({ error: "read_failed" }, 422);
  }

  const ps = (payments.data ?? []) as unknown as Payment[];
  const net = balances(
    ms.map((m) => m.id),
    ((expenses.data ?? []) as unknown as Expense[]).filter((e) => !e.deleted),
    ps,
  );
  const candidates = settle(net)
    .filter((t) => t.from === fromMember)
    .map((t) => {
      const claimed = ps
        .filter((p) => p.status === "claimed" && p.from_member === t.from && p.to_member === t.to)
        .reduce((s, p) => s + p.amount, 0);
      const to = ms.find((m) => m.id === t.to)!;
      return {
        toMemberId: t.to,
        amount: t.amount - claimed,
        names: [to.payee_name, to.nickname].filter((n): n is string => !!n),
        promptpayId: to.promptpay_id,
      };
    })
    .filter((c) => c.amount > 0);
  const usedHashes = new Set(
    ps
      .filter((p) => p.status === "claimed" || p.status === "confirmed")
      .map((p) => p.slip?.referenceHash)
      .filter((r): r is string => !!r),
  );
  const refHash = await referenceHash(tripId, slip.reference.value);

  const match = matchSlip(
    { ...slip, reference: { value: refHash, confidence: slip.reference.confidence } },
    candidates,
    { tripCreatedAt: trip.data.created_at, usedReferences: usedHashes },
  );
  const summary: SlipSummary = {
    amount: slip.amount.value,
    dateTime: slip.dateTime.value,
    receiverName: shortName(slip.receiver.name.value),
    receiverLast4: slip.receiver.accountLast4.value,
    bank: slip.sender.bank.value,
    referenceHash: refHash,
    confidence: slip.overallConfidence,
    reasons: match.reasons,
  };

  // Recorded with the service role: clients can only ever record manual
  // payments, so a "slip" payment always means this route read a slip.
  let payment: Payment | null = null;
  if (match.auto && match.candidate) {
    const { data, error } = await adminClient().rpc("record_slip_payment", {
      p_user: auth.user.id,
      p_payment: {
        id: randomUUID(),
        trip_id: tripId,
        from_member: fromMember,
        to_member: match.candidate.toMemberId,
        amount: match.candidate.amount,
      },
      p_slip: summary as unknown as Json,
    });
    if (!error) payment = (data as unknown as { row: Payment }).row;
  }

  // Not automatic but plausible: hand back a signed receipt so the payer can
  // confirm the reading and record it, without being able to alter it.
  const target = candidates.find((c) => c.toMemberId === (match.candidate?.toMemberId ?? toMember));
  const claimToken =
    !payment && target && match.checks.amount !== "mismatch" && !match.checks.duplicate
      ? signSlipClaim({ userId: auth.user.id, tripId, from: fromMember, to: target.toMemberId, amount: target.amount, slip: summary })
      : null;

  const body: SlipResponse = {
    summary,
    match: { auto: match.auto, checks: match.checks, reasons: match.reasons, toMemberId: match.candidate?.toMemberId ?? null },
    payment,
    claimToken,
  };
  return json(body, 200);
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** True only when the upstream AI/OCR provider or network failed, not when the image itself is unreadable. */
function isUpstreamSlipError(e: unknown): boolean {
  if (e instanceof SlipReaderError) {
    if (e.status !== undefined) return e.status === 429 || e.status >= 500;
    return /took over|GEMINI_API_KEY/i.test(e.message);
  }
  const name = (e as Error)?.name;
  return e instanceof TypeError || name === "AbortError" || name === "TimeoutError";
}

/** A stuck OCR worker must not hold the request open until the platform kills it. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SlipReaderError(`slip read took over ${ms} ms`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

/**
 * For end-to-end tests: with SLIP_READER=fake (never in production) the
 * uploaded file's bytes are taken as the vision model's JSON answer.
 */
function fakeReaderEnabled() {
  return process.env.SLIP_READER === "fake" && process.env.NODE_ENV !== "production";
}

function fakeRead(image: Uint8Array): SlipReadResult {
  const now = new Date();
  const raw = fromGemini(JSON.parse(new TextDecoder().decode(image)), now);
  return finalize({ ...raw, source: "fake" }, now);
}
