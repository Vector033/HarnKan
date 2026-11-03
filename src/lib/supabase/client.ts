import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE } from "./config";
import type { Database } from "./database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** One browser client per tab; the session lives in cookies so route handlers can read it. */
export function supabase() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: { name: AUTH_COOKIE } },
  );
  return client;
}

/**
 * The signed-in user's id, signing in anonymously the first time. People in a
 * trip never make an account; the anonymous session is what ties this browser
 * to its member row. Returns null when offline with no session yet.
 */
export async function ensureUser(): Promise<string | null> {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session) {
    if (!navigator.onLine) return data.session.user.id;
    // A session for a user the server no longer knows (database reset, deleted
    // account) cannot write anything; start over with a fresh anonymous user.
    const { data: checked, error } = await sb.auth.getUser();
    if (checked.user) return checked.user.id;
    if (error && !error.status) return data.session.user.id; // network trouble, keep it
    await sb.auth.signOut({ scope: "local" });
  }
  const { data: signedIn, error } = await sb.auth.signInAnonymously();
  if (error) return null;
  return signedIn.user?.id ?? null;
}
