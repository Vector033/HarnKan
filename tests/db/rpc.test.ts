// Runs against the local Supabase stack (npm run db:start). Checks the rules
// that live in SQL: RLS, version conflicts, split validation, payment roles.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

async function user() {
  const c = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInAnonymously();
  if (error) throw error;
  return c;
}

type J = Record<string, unknown>;
async function rpc<T = J>(c: SupabaseClient<Database>, fn: string, args: J): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (c.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

let a: SupabaseClient<Database>, b: SupabaseClient<Database>, outsider: SupabaseClient<Database>;
let trip: { trip_id: string; member_id: string; invite_code: string };
let bMember: string;

beforeAll(async () => {
  [a, b, outsider] = await Promise.all([user(), user(), user()]);
  trip = await rpc(a, "create_trip", { p_name: "เชียงดาว", p_nickname: "เอ" });
  const joined = await rpc<{ member_id: string }>(b, "join_trip", { p_code: trip.invite_code, p_nickname: "บี" });
  bMember = joined.member_id;
});

const expense = (o: J = {}) => ({
  id: randomUUID(),
  trip_id: trip.trip_id,
  title: "ข้าวเย็น",
  amount: 30_000,
  paid_by: trip.member_id,
  split_mode: "equal",
  split: { [trip.member_id]: 1, [bMember]: 1 },
  ...o,
});

describe("trips and members", () => {
  it("shows a preview by invite code to anyone signed in", async () => {
    const p = await rpc<{ name: string; members: { nickname: string }[] }>(outsider, "trip_preview", {
      p_code: trip.invite_code.toUpperCase(),
    });
    expect(p.name).toBe("เชียงดาว");
    expect(p.members.map((m) => m.nickname)).toEqual(["เอ", "บี"]);
  });

  it("joining twice returns the same member", async () => {
    const again = await rpc<{ member_id: string }>(b, "join_trip", { p_code: trip.invite_code, p_nickname: "บีบี" });
    expect(again.member_id).toBe(bMember);
  });

  it("rejects a taken nickname", async () => {
    const c = await user();
    await expect(rpc(c, "join_trip", { p_code: trip.invite_code, p_nickname: " เอ " })).rejects.toThrow(/nickname_taken/);
  });

  it("hides trips from people who have not joined", async () => {
    const { data } = await outsider.from("trips").select("id").eq("id", trip.trip_id);
    expect(data).toEqual([]);
    const { data: members } = await outsider.from("members").select("id").eq("trip_id", trip.trip_id);
    expect(members).toEqual([]);
  });

  it("lets a placeholder be added and then claimed", async () => {
    const { data, error } = await a.from("members").insert({ trip_id: trip.trip_id, nickname: "ซี" }).select().single();
    expect(error).toBeNull();
    const c = await user();
    const claimed = await rpc<{ member_id: string }>(c, "join_trip", { p_code: trip.invite_code, p_member_id: data!.id });
    expect(claimed.member_id).toBe(data!.id);
    const d = await user();
    await expect(rpc(d, "join_trip", { p_code: trip.invite_code, p_member_id: data!.id })).rejects.toThrow(
      /member_already_claimed/,
    );
  });

  it("only lets people edit their own PromptPay id", async () => {
    const { data: own } = await b.from("members").update({ promptpay_id: "0812345678" }).eq("id", bMember).select();
    expect(own).toHaveLength(1);
    const { data: other } = await b.from("members").update({ promptpay_id: "0899999999" }).eq("id", trip.member_id).select();
    expect(other).toEqual([]);
  });

  it("does not let a member move themselves to another user or trip", async () => {
    const { error } = await b.from("members").update({ user_id: null } as never).eq("id", bMember);
    expect(error?.message).toMatch(/permission denied/);
  });
});

describe("save_expense", () => {
  it("creates, and a replayed create is a no-op", async () => {
    const e = expense();
    const first = await rpc<{ status: string; row: { version: number } }>(a, "save_expense", { p_expense: e });
    expect(first.status).toBe("ok");
    expect(first.row.version).toBe(1);
    const replay = await rpc<{ status: string }>(a, "save_expense", { p_expense: e });
    expect(replay.status).toBe("exists");
  });

  it("detects concurrent edits from the version", async () => {
    const e = expense();
    await rpc(a, "save_expense", { p_expense: e });
    const fromA = await rpc<{ status: string; row: { version: number; title: string } }>(a, "save_expense", {
      p_expense: { ...e, title: "ข้าวเย็น (A)" },
      p_base_version: 1,
    });
    expect(fromA.status).toBe("ok");
    expect(fromA.row.version).toBe(2);
    // B also started from version 1 and saves later.
    const fromB = await rpc<{ status: string; row: { version: number; title: string } }>(b, "save_expense", {
      p_expense: { ...e, title: "ข้าวเย็น (B)" },
      p_base_version: 1,
    });
    expect(fromB.status).toBe("conflict");
    expect(fromB.row.title).toBe("ข้าวเย็น (A)");
    expect(fromB.row.version).toBe(2);
  });

  it("deletes with the same version check", async () => {
    const e = expense();
    await rpc(a, "save_expense", { p_expense: e });
    const stale = await rpc<{ status: string }>(b, "delete_expense", { p_id: e.id, p_base_version: 7 });
    expect(stale.status).toBe("conflict");
    const ok = await rpc<{ status: string; row: { deleted: boolean } }>(b, "delete_expense", { p_id: e.id, p_base_version: 1 });
    expect(ok.row.deleted).toBe(true);
  });

  it("validates splits on the server", async () => {
    await expect(rpc(a, "save_expense", { p_expense: expense({ split: {} }) })).rejects.toThrow(/invalid_split/);
    await expect(
      rpc(a, "save_expense", { p_expense: expense({ split_mode: "exact", split: { [bMember]: 100 } }) }),
    ).rejects.toThrow(/add up/);
    await expect(
      rpc(a, "save_expense", { p_expense: expense({ split: { [randomUUID()]: 1 } }) }),
    ).rejects.toThrow(/not in this trip/);
  });

  it("refuses outsiders", async () => {
    await expect(rpc(outsider, "save_expense", { p_expense: expense() })).rejects.toThrow(/not_member/);
  });

  it("blocks direct table writes that would skip the checks", async () => {
    const { error } = await a.from("expenses").insert(expense() as never);
    expect(error?.message).toMatch(/permission denied/);
  });
});

describe("payments", () => {
  it("a sender's claim waits for the receiver to confirm", async () => {
    const p = { id: randomUUID(), trip_id: trip.trip_id, from_member: bMember, to_member: trip.member_id, amount: 15_000 };
    const claimed = await rpc<{ row: { status: string } }>(b, "record_payment", { p_payment: p });
    expect(claimed.row.status).toBe("claimed");
    await expect(rpc(b, "decide_payment", { p_id: p.id, p_decision: "confirmed" })).rejects.toThrow(/not_allowed/);
    const ok = await rpc<{ row: { status: string } }>(a, "decide_payment", { p_id: p.id, p_decision: "confirmed" });
    expect(ok.row.status).toBe("confirmed");
    await expect(rpc(a, "decide_payment", { p_id: p.id, p_decision: "rejected" })).rejects.toThrow(/already_decided/);
  });

  it("a receiver recording money they got is confirmed at once", async () => {
    const p = { id: randomUUID(), trip_id: trip.trip_id, from_member: bMember, to_member: trip.member_id, amount: 100 };
    const r = await rpc<{ row: { status: string } }>(a, "record_payment", { p_payment: p });
    expect(r.row.status).toBe("confirmed");
  });

  it("nobody can record a payment between two other members", async () => {
    const c = await user();
    await rpc(c, "join_trip", { p_code: trip.invite_code, p_nickname: `ดี${Date.now()}` });
    const p = { id: randomUUID(), trip_id: trip.trip_id, from_member: bMember, to_member: trip.member_id, amount: 100 };
    await expect(rpc(c, "record_payment", { p_payment: p })).rejects.toThrow(/not_allowed/);
  });

  it("the sender can cancel their own claim", async () => {
    const p = { id: randomUUID(), trip_id: trip.trip_id, from_member: bMember, to_member: trip.member_id, amount: 100 };
    await rpc(b, "record_payment", { p_payment: p });
    const r = await rpc<{ row: { status: string } }>(b, "decide_payment", { p_id: p.id, p_decision: "cancelled" });
    expect(r.row.status).toBe("cancelled");
  });
});

describe("note_slip_read", () => {
  it("rate limits slip reads per user", async () => {
    const c = await user();
    for (let i = 0; i < 3; i++) await rpc(c, "note_slip_read", { p_limit: 3 });
    await expect(rpc(c, "note_slip_read", { p_limit: 3 })).rejects.toThrow(/rate_limited/);
  });
});
