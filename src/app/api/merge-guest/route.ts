import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * After a guest signs in to a Google account that already had its own user,
 * moves the guest's trips into that account. The browser proves it held the
 * guest session by sending that session's access token; the signed-in account
 * comes from the cookie. Both are checked here before the service role acts.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json({ error: "bad_origin" }, 403);

  const { data: auth } = await (await createClient()).auth.getUser();
  if (!auth.user || auth.user.is_anonymous) return json({ error: "not_signed_in" }, 401);

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" && body.token.length < 8192 ? body.token : null;
  const admin = adminClient();
  const { data: guest } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!guest.user?.is_anonymous) return json({ error: "bad_token" }, 400);
  if (guest.user.id === auth.user.id) return json({ moved: 0 }, 200);

  const { data, error } = await admin.rpc("merge_guest", { p_guest: guest.user.id, p_user: auth.user.id });
  if (error) return json({ error: "error" }, 500);
  return json({ moved: data }, 200);
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
