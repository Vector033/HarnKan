import { randomUUID } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { verifySlipClaim } from "@/lib/slip-token";
import type { Payment } from "@/lib/trip/types";

/**
 * Records a slip-backed payment the payer confirmed by hand, from the signed
 * receipt the slip route issued. Nothing in the payment comes from the
 * browser except the token; the database still checks membership and roles.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json({ error: "bad_origin" }, 403);

  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return json({ error: "not_signed_in" }, 401);

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const claim = typeof body?.token === "string" && body.token.length < 8192 ? verifySlipClaim(body.token) : null;
  if (!claim || claim.userId !== auth.user.id) return json({ error: "bad_token" }, 400);

  const { data, error } = await adminClient().rpc("record_slip_payment", {
    p_user: auth.user.id,
    p_payment: { id: randomUUID(), trip_id: claim.tripId, from_member: claim.from, to_member: claim.to, amount: claim.amount },
    p_slip: claim.slip as unknown as Json,
  });
  if (error) return json({ error: /not_allowed|not_member/.test(error.message) ? "not_allowed" : "error" }, 403);
  return json({ payment: (data as unknown as { row: Payment }).row }, 200);
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
