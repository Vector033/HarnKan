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

  it("claiming a placeholder waits for the creator, who approves it", async () => {
    const { data, error } = await a.from("members").insert({ trip_id: trip.trip_id, nickname: "ซี" }).select().single();
    expect(error).toBeNull();
    const c = await user();
    const claimed = await rpc<{ member_id: string; status: string }>(c, "join_trip", {
      p_code: trip.invite_code,
      p_member_id: data!.id,
    });
    expect(claimed).toMatchObject({ member_id: data!.id, status: "pending" });
    // Not a member yet: sees nothing.
    const { data: before } = await c.from("trips").select("id").eq("id", trip.trip_id);
    expect(before).toEqual([]);
    // Someone else cannot take the same name while it is pending.
    const d = await user();
    await expect(rpc(d, "join_trip", { p_code: trip.invite_code, p_member_id: data!.id })).rejects.toThrow(
      /member_already_claimed/,
    );
    // Only the creator decides.
    await expect(rpc(b, "decide_claim", { p_member: data!.id, p_accept: true })).rejects.toThrow(/not_creator/);
    await rpc(a, "decide_claim", { p_member: data!.id, p_accept: true });
    const { data: after } = await c.from("trips").select("id").eq("id", trip.trip_id);
    expect(after).toHaveLength(1);
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

describe("trip owner controls (2026-11-05 hardening)", () => {
  async function freshTrip() {
    const owner = await user();
    const t = await rpc<{ trip_id: string; member_id: string; invite_code: string }>(owner, "create_trip", {
      p_name: "ล็อกได้",
      p_nickname: "เจ้าของ",
    });
    return { owner, t };
  }

  it("a locked trip hides its members and refuses new joiners, but not existing members", async () => {
    const { owner, t } = await freshTrip();
    const friend = await user();
    await rpc(friend, "join_trip", { p_code: t.invite_code, p_nickname: "เพื่อน" });
    await rpc(owner, "set_trip_locked", { p_trip: t.trip_id, p_locked: true });

    const stranger = await user();
    const p = await rpc<{ locked: boolean; members: unknown[] }>(stranger, "trip_preview", { p_code: t.invite_code });
    expect(p.locked).toBe(true);
    expect(p.members).toEqual([]);
    await expect(rpc(stranger, "join_trip", { p_code: t.invite_code, p_nickname: "แปลกหน้า" })).rejects.toThrow(/trip_locked/);
    // Already a member: still fine.
    const again = await rpc<{ trip_id: string }>(friend, "join_trip", { p_code: t.invite_code });
    expect(again.trip_id).toBe(t.trip_id);
  });

  it("only the creator can lock, rotate the link or remove members", async () => {
    const { t } = await freshTrip();
    const friend = await user();
    const f = await rpc<{ member_id: string }>(friend, "join_trip", { p_code: t.invite_code, p_nickname: "เพื่อน" });
    await expect(rpc(friend, "set_trip_locked", { p_trip: t.trip_id, p_locked: true })).rejects.toThrow(/not_creator/);
    await expect(rpc(friend, "rotate_invite", { p_trip: t.trip_id })).rejects.toThrow(/not_creator/);
    await expect(rpc(friend, "remove_member", { p_member: t.member_id })).rejects.toThrow(/not_creator/);
    expect(f.member_id).toBeTruthy();
  });

  it("rotating the link makes the old one useless", async () => {
    const { owner, t } = await freshTrip();
    const fresh = await rpc<string>(owner, "rotate_invite", { p_trip: t.trip_id });
    expect(fresh).not.toBe(t.invite_code);
    const late = await user();
    await expect(rpc(late, "join_trip", { p_code: t.invite_code, p_nickname: "มาช้า" })).rejects.toThrow(/trip_not_found/);
    await rpc(late, "join_trip", { p_code: fresh, p_nickname: "มาช้า" });
  });

  it("a removed member loses access; with history they stay as a placeholder without payment details", async () => {
    const { owner, t } = await freshTrip();
    const friend = await user();
    const f = await rpc<{ member_id: string }>(friend, "join_trip", { p_code: t.invite_code, p_nickname: "เพื่อน" });
    await friend.from("members").update({ promptpay_id: "0811111111" }).eq("id", f.member_id);
    await rpc(owner, "save_expense", {
      p_expense: { id: randomUUID(), trip_id: t.trip_id, title: "ข้าว", amount: 1000, paid_by: f.member_id, split_mode: "equal", split: { [f.member_id]: 1, [t.member_id]: 1 } },
    });

    await rpc(owner, "remove_member", { p_member: f.member_id });
    const { data: seen } = await friend.from("trips").select("id").eq("id", t.trip_id);
    expect(seen).toEqual([]);
    const { data: row } = await owner.from("members").select("user_id,promptpay_id").eq("id", f.member_id).single();
    expect(row).toEqual({ user_id: null, promptpay_id: null });
    await expect(rpc(owner, "remove_member", { p_member: t.member_id })).rejects.toThrow(/cannot_remove_self/);
  });

  it("nobody can set a placeholder's PromptPay to their own number", async () => {
    const { owner, t } = await freshTrip();
    const { data: ph } = await owner.from("members").insert({ trip_id: t.trip_id, nickname: "ยังไม่มา" }).select().single();
    const { error } = await owner.from("members").update({ promptpay_id: "0899999999" }).eq("id", ph!.id);
    expect(error?.message).toMatch(/row-level security/);
    const { error: insertErr } = await owner
      .from("members")
      .insert({ trip_id: t.trip_id, nickname: "ปลอม", promptpay_id: "0899999999" });
    expect(insertErr?.message).toMatch(/row-level security/);
  });

  it("only the creator can delete the trip", async () => {
    const { owner, t } = await freshTrip();
    const friend = await user();
    await rpc(friend, "join_trip", { p_code: t.invite_code, p_nickname: "เพื่อน" });
    const { count: none } = await friend.from("trips").delete({ count: "exact" }).eq("id", t.trip_id);
    expect(none).toBe(0);
    const { count } = await owner.from("trips").delete({ count: "exact" }).eq("id", t.trip_id);
    expect(count).toBe(1);
  });
});

describe("size limits", () => {
  it("refuses an oversized slip blob even from the server", async () => {
    const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const { data: who } = await b.auth.getUser();
    const { error } = await admin.rpc("record_slip_payment", {
      p_user: who.user!.id,
      p_payment: { id: randomUUID(), trip_id: trip.trip_id, from_member: bMember, to_member: trip.member_id, amount: 100 },
      p_slip: { junk: "x".repeat(5000) },
    });
    expect(error?.message).toMatch(/payments_slip_size/);
  });
});

describe("second-pass hardening (independent review, 2026-11-07)", () => {
  async function freshTrip() {
    const owner = await user();
    const t = await rpc<{ trip_id: string; member_id: string; invite_code: string }>(owner, "create_trip", {
      p_name: "ทดสอบรอบสอง",
      p_nickname: "เจ้าของ",
    });
    return { owner, t };
  }

  it("a removed member cannot rejoin, with the old link or a new one", async () => {
    const { owner, t } = await freshTrip();
    const friend = await user();
    const f = await rpc<{ member_id: string }>(friend, "join_trip", { p_code: t.invite_code, p_nickname: "เพื่อน" });
    await rpc(owner, "remove_member", { p_member: f.member_id });
    await expect(rpc(friend, "join_trip", { p_code: t.invite_code, p_nickname: "เพื่อน2" })).rejects.toThrow(/trip_not_found/);
    const fresh = await rpc<string>(owner, "rotate_invite", { p_trip: t.trip_id });
    await expect(rpc(friend, "join_trip", { p_code: fresh, p_nickname: "เพื่อน3" })).rejects.toThrow(/trip_locked/);
  });

  it("clients cannot record a slip-backed payment; only the service role can", async () => {
    const { owner, t } = await freshTrip();
    const friend = await user();
    const f = await rpc<{ member_id: string }>(friend, "join_trip", { p_code: t.invite_code, p_nickname: "เพื่อน" });
    const forged = await rpc<{ row: { source: string; slip: unknown } }>(friend, "record_payment", {
      p_payment: {
        id: randomUUID(),
        trip_id: t.trip_id,
        from_member: f.member_id,
        to_member: t.member_id,
        amount: 100,
        source: "slip",
        slip: { amount: 1, receiverName: "ปลอม" },
      },
    });
    expect(forged.row).toMatchObject({ source: "manual", slip: null });
    await expect(
      rpc(friend, "record_slip_payment", { p_user: (await friend.auth.getUser()).data.user!.id, p_payment: {}, p_slip: {} }),
    ).rejects.toThrow();
    void owner;
  });

  it("nobody confirms a payment they recorded themselves", async () => {
    const { owner, t } = await freshTrip();
    const { data: ph } = await owner.from("members").insert({ trip_id: t.trip_id, nickname: "ยังไม่มา" }).select().single();
    const p = { id: randomUUID(), trip_id: t.trip_id, from_member: t.member_id, to_member: ph!.id, amount: 500 };
    await rpc(owner, "record_payment", { p_payment: p });
    await expect(rpc(owner, "decide_payment", { p_id: p.id, p_decision: "confirmed" })).rejects.toThrow(/not_allowed/);
  });

  it("a placeholder that appears in an expense cannot be deleted", async () => {
    const { owner, t } = await freshTrip();
    const { data: ph } = await owner.from("members").insert({ trip_id: t.trip_id, nickname: "อยู่ในบิล" }).select().single();
    await rpc(owner, "save_expense", {
      p_expense: { id: randomUUID(), trip_id: t.trip_id, title: "น้ำ", amount: 200, paid_by: t.member_id, split_mode: "equal", split: { [t.member_id]: 1, [ph!.id]: 1 } },
    });
    const { count } = await owner.from("members").delete({ count: "exact" }).eq("id", ph!.id);
    expect(count).toBe(0);
  });

  it("weights are bounded", async () => {
    const { owner, t } = await freshTrip();
    const { data: ph } = await owner.from("members").insert({ trip_id: t.trip_id, nickname: "น้ำหนัก" }).select().single();
    const base = { id: randomUUID(), trip_id: t.trip_id, title: "x", amount: 100, paid_by: t.member_id, split_mode: "weights" };
    await expect(rpc(owner, "save_expense", { p_expense: { ...base, split: { [t.member_id]: 5000, [ph!.id]: 1 } } })).rejects.toThrow(/weights are 0 to 1000/);
    await expect(rpc(owner, "save_expense", { p_expense: { ...base, split: { [t.member_id]: 0.0001, [ph!.id]: 1 } } })).rejects.toThrow(/weights are 0 to 1000/);
  });
});

describe("profiles", () => {
  it("only the owner reads or writes a profile", async () => {
    const [me, other] = await Promise.all([user(), user()]);
    const { data: { user: u } } = await me.auth.getUser();
    const { error } = await me.from("profiles").upsert({ user_id: u!.id, nickname: "ฉัน", promptpay_id: "0812345678" });
    expect(error).toBeNull();
    const { data: seen } = await other.from("profiles").select("*").eq("user_id", u!.id);
    expect(seen).toEqual([]);
    const { error: forged } = await other.from("profiles").upsert({ user_id: u!.id, nickname: "ปลอม" });
    expect(forged).not.toBeNull();
    const { count } = await other.from("profiles").update({ nickname: "ปลอม" }, { count: "exact" }).eq("user_id", u!.id);
    expect(count).toBe(0);
    const { data: mine } = await me.from("profiles").select("nickname").single();
    expect(mine!.nickname).toBe("ฉัน");
  });

  it("a new trip and a join start with the profile's payout account", async () => {
    const [host, guest] = await Promise.all([user(), user()]);
    for (const c of [host, guest]) {
      const { data: { user: u } } = await c.auth.getUser();
      await c.from("profiles").upsert({ user_id: u!.id, promptpay_id: "0899999999", payee_name: "ทดสอบ ท." });
    }
    const t = await rpc<{ trip_id: string; member_id: string; invite_code: string }>(host, "create_trip", { p_name: "โปรไฟล์", p_nickname: "โฮสต์" });
    const j = await rpc<{ member_id: string }>(guest, "join_trip", { p_code: t.invite_code, p_nickname: "แขก" });
    const { data } = await host.from("members").select("id,promptpay_id,payee_name").in("id", [t.member_id, j.member_id]);
    expect(data).toHaveLength(2);
    for (const m of data!) expect(m).toMatchObject({ promptpay_id: "0899999999", payee_name: "ทดสอบ ท." });
  });
});
