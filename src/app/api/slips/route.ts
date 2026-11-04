import { finalize, fromGemini, readSlip, SlipReaderError, type SlipReadResult } from "@harnkan/slip-reader";
import { randomUUID } from "node:crypto";
import { matchSlip, type SlipMatch } from "@/lib/core/slip-match";
import { balances, settle } from "@/lib/core/settle";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { Expense, Member, Payment, SlipSummary } from "@/lib/trip/types";

export interface SlipResponse {
  summary: SlipSummary;
  match: Pick<SlipMatch, "auto" | "checks" | "reasons"> & { toMemberId: string | null };
  payment: Payment | null;
}

const MAX_BYTES = 6 * 1024 * 1024;
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
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "not_signed_in" }, 401);

  const form = await req.formData().catch(() => null);
  const file = form?.get("slip");
  const tripId = String(form?.get("trip_id") ?? "");
  const fromMember = String(form?.get("from_member") ?? "");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > MAX_BYTES || !tripId || !fromMember)
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

  let slip: SlipReadResult;
  try {
    const image = new Uint8Array(await file.arrayBuffer());
    // Gemini when GEMINI_API_KEY is set, otherwise local Thai OCR.
    slip = fakeReaderEnabled()
      ? fakeRead(image)
      : await withTimeout(readSlip(image, normalizeMime(file.type)), READ_TIMEOUT_MS);
  } catch (e) {
    console.error("slip read failed", e instanceof SlipReaderError ? e.message : e);
    return json({ error: "read_failed" }, 502);
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
  const usedReferences = new Set(
    ps.filter((p) => p.status === "claimed" || p.status === "confirmed").map((p) => p.slip?.reference).filter((r): r is string => !!r),
  );

  const match = matchSlip(slip, candidates, { tripCreatedAt: trip.data.created_at, usedReferences });
  const summary: SlipSummary = {
    amount: slip.amount.value,
    dateTime: slip.dateTime.value,
    receiverName: slip.receiver.name.value,
    receiverLast4: slip.receiver.accountLast4.value,
    bank: slip.sender.bank.value,
    reference: slip.reference.value,
    confidence: slip.overallConfidence,
    reasons: match.reasons,
  };

  let payment: Payment | null = null;
  if (match.auto && match.candidate) {
    const { data, error } = await sb.rpc("record_payment", {
      p_payment: {
        id: randomUUID(),
        trip_id: tripId,
        from_member: fromMember,
        to_member: match.candidate.toMemberId,
        amount: match.candidate.amount,
        source: "slip",
        slip: summary,
      } as unknown as Json,
    });
    if (!error) payment = (data as unknown as { row: Payment }).row;
  }

  const body: SlipResponse = {
    summary,
    match: { auto: match.auto, checks: match.checks, reasons: match.reasons, toMemberId: match.candidate?.toMemberId ?? null },
    payment,
  };
  return json(body, 200);
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** A stuck OCR worker must not hold the request open until the platform kills it. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SlipReaderError(`slip read took over ${ms} ms`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

function normalizeMime(type: string) {
  return type === "image/jpg" ? "image/jpeg" : type;
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
