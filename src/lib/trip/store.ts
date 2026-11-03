"use client";

// Keeps one trip in sync: a cached snapshot from IndexedDB for instant and
// offline loads, the server copy fetched on open and kept fresh by Supabase
// Realtime, and a queue of local changes replayed in order whenever the
// network is back. Components read it through useTrip().

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ensureUser, supabase } from "@/lib/supabase/client";
import * as idb from "./idb";
import { enqueue, judgeConflict, overlay, type TripView } from "./outbox";
import type { Conflict, Expense, Member, Op, Payment, QueuedOp, Snapshot, Trip } from "./types";

export interface TripState {
  status: "loading" | "ready" | "missing" | "no-access";
  view: TripView | null;
  userId: string | null;
  me: Member | null;
  online: boolean;
  /** Realtime channel joined: other people's changes arrive live. */
  live: boolean;
  queued: number;
  conflicts: Conflict[];
  errors: string[];
  lastSyncedAt: string | null;
}

const RETRY_MS = 15_000;

type RpcResult<T> = { status: "ok" | "exists" | "conflict"; row: T };

class NetworkError extends Error {}

export class TripStore {
  private snap: Snapshot | null = null;
  private queue: QueuedOp[] = [];
  private inflight: number | null = null;
  private flushing = false;
  private channel: RealtimeChannel | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private gen = 0;
  state: TripState = {
    status: "loading",
    view: null,
    userId: null,
    me: null,
    online: true,
    live: false,
    queued: 0,
    conflicts: [],
    errors: [],
    lastSyncedAt: null,
  };

  constructor(readonly tripId: string) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<TripState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private recompute() {
    const view = this.snap ? overlay(this.snap, this.queue) : null;
    const userId = this.snap?.userId ?? this.state.userId;
    this.set({
      view,
      userId,
      me: view?.members.find((m) => m.user_id === userId) ?? null,
      queued: this.queue.length,
      status: view ? "ready" : this.state.status,
    });
  }

  /** Safe to call again after stop() (React runs effects twice in development). */
  async start() {
    const gen = ++this.gen;
    this.stopped = false;
    const [cached, queue] = await Promise.all([idb.loadSnapshot(this.tripId), idb.loadQueue(this.tripId)]);
    if (gen !== this.gen) return;
    this.snap = cached ?? this.snap;
    this.queue = queue;
    this.set({ online: navigator.onLine, lastSyncedAt: cached?.savedAt ?? null });
    this.recompute();

    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    this.timer = setInterval(() => void this.flush(), RETRY_MS);

    const userId = await ensureUser();
    if (gen !== this.gen) return;
    if (userId) this.set({ userId });
    await this.refresh();
    if (gen !== this.gen) return;
    this.listen(gen);
    void this.flush();
  }

  stop() {
    this.gen++;
    this.stopped = true;
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.channel) void supabase().removeChannel(this.channel);
    this.channel = null;
  }

  private onOnline = () => {
    this.set({ online: true });
    void this.refresh().then(() => this.flush());
  };
  private onOffline = () => this.set({ online: false, live: false });

  /** Fetches the whole trip. Cheap for trip-sized data and the simplest way to catch up after a gap. */
  async refresh() {
    const sb = supabase();
    const userId = this.state.userId ?? (await ensureUser());
    if (!userId) return;
    try {
      const [trip, members, expenses, payments] = await Promise.all([
        sb.from("trips").select("*").eq("id", this.tripId).maybeSingle(),
        sb.from("members").select("*").eq("trip_id", this.tripId),
        sb.from("expenses").select("*").eq("trip_id", this.tripId),
        sb.from("payments").select("*").eq("trip_id", this.tripId),
      ]);
      const err = trip.error ?? members.error ?? expenses.error ?? payments.error;
      if (err) throw err.code ? err : new NetworkError(err.message);
      if (!trip.data) {
        // RLS hides trips you are not in, so "missing" and "not a member" look the same.
        this.set({ status: this.snap ? "ready" : "no-access" });
        return;
      }
      this.snap = {
        trip: trip.data as Trip,
        members: members.data as Member[],
        expenses: expenses.data as unknown as Expense[],
        payments: payments.data as unknown as Payment[],
        userId,
        savedAt: new Date().toISOString(),
      };
      this.set({ online: true, lastSyncedAt: this.snap.savedAt });
      this.recompute();
      await idb.saveSnapshot(this.snap);
    } catch (e) {
      if (e instanceof NetworkError || e instanceof TypeError) this.set({ online: false });
      else this.pushError(e);
    }
  }

  private listen(gen: number) {
    const sb = supabase();
    const filter = `trip_id=eq.${this.tripId}`;
    this.channel = sb
      .channel(`trip:${this.tripId}:${gen}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter }, (p) =>
        this.applyRow("expenses", p.new as Expense),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter }, (p) =>
        this.applyRow("payments", p.new as Payment),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter }, (p) =>
        this.applyRow("members", p.new as Member),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trips", filter: `id=eq.${this.tripId}` }, (p) => {
        if (this.snap) this.snap = { ...this.snap, trip: p.new as Trip };
        this.recompute();
      })
      .subscribe((status) => {
        if (gen !== this.gen) return;
        const live = status === "SUBSCRIBED";
        this.set({ live });
        // Events sent while the socket was down are lost; refetch on every (re)join.
        if (live) void this.refresh().then(() => this.flush());
      });
  }

  private applyRow(table: "expenses" | "payments" | "members", row: Expense | Payment | Member) {
    if (!this.snap || !row?.id) return;
    const list = this.snap[table] as { id: string; version?: number }[];
    const i = list.findIndex((r) => r.id === row.id);
    const incoming = row as { id: string; version?: number };
    // Ignore an older echo of a row we already have a newer version of.
    if (i !== -1 && incoming.version !== undefined && (list[i].version ?? 0) > incoming.version) return;
    const next = i === -1 ? [...list, incoming] : list.map((r, j) => (j === i ? incoming : r));
    this.snap = { ...this.snap, [table]: next };
    this.recompute();
    this.persistSoon();
  }

  private persistSoon() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.snap && void idb.saveSnapshot(this.snap), 300);
  }

  /** Queues a change, shows it right away, and tries to send it. */
  async do(op: Op) {
    const item: QueuedOp = { seq: await idb.nextSeq(), tripId: this.tripId, op, queuedAt: new Date().toISOString() };
    this.queue = enqueue(this.queue, item, this.inflight);
    this.recompute();
    await idb.saveQueue(this.tripId, this.queue);
    void this.flush();
  }

  dismissConflict(id: string) {
    this.set({ conflicts: this.state.conflicts.filter((c) => c.id !== id) });
  }
  dismissError(i: number) {
    this.set({ errors: this.state.errors.filter((_, j) => j !== i) });
  }

  private pushError(e: unknown) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
    this.set({ errors: [...this.state.errors, msg] });
  }

  /** Sends queued ops one at a time, in order. Stops at the first network failure. */
  async flush() {
    if (this.flushing || !this.queue.length || this.stopped) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const item = this.queue[0];
        this.inflight = item.seq;
        try {
          await this.send(item.op);
        } catch (e) {
          if (e instanceof NetworkError || e instanceof TypeError) {
            this.set({ online: false });
            return;
          }
          this.pushError(e); // refused by the server: drop it, the user sees why
        }
        this.inflight = null;
        this.queue = this.queue.filter((q) => q.seq !== item.seq);
        this.recompute();
        await idb.saveQueue(this.tripId, this.queue);
      }
      this.set({ online: true });
      if (this.snap) await idb.saveSnapshot(this.snap);
    } finally {
      this.inflight = null;
      this.flushing = false;
    }
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase().rpc as any)(fn, args);
    if (error) throw error.code ? new Error(error.message) : new NetworkError(error.message);
    return data as T;
  }

  private async send(op: Op) {
    const sb = supabase();
    switch (op.kind) {
      case "save_expense":
      case "delete_expense": {
        const r =
          op.kind === "save_expense"
            ? await this.rpc<RpcResult<Expense>>("save_expense", { p_expense: op.expense, p_base_version: op.baseVersion })
            : await this.rpc<RpcResult<Expense>>("delete_expense", { p_id: op.id, p_base_version: op.baseVersion });
        this.applyRow("expenses", r.row);
        if (r.status === "conflict") {
          const c = judgeConflict(op, r.row);
          if (c) this.set({ conflicts: [...this.state.conflicts.filter((x) => x.id !== c.id), c] });
        }
        return;
      }
      case "record_payment": {
        const r = await this.rpc<RpcResult<Payment>>("record_payment", { p_payment: op.payment });
        this.applyRow("payments", r.row);
        return;
      }
      case "decide_payment": {
        const r = await this.rpc<RpcResult<Payment>>("decide_payment", { p_id: op.id, p_decision: op.decision });
        this.applyRow("payments", r.row);
        return;
      }
      case "add_member": {
        const { data, error } = await sb.from("members").upsert(op.member, { onConflict: "id", ignoreDuplicates: true }).select();
        if (error) throw error.code ? new Error(error.message) : new NetworkError(error.message);
        if (data?.[0]) this.applyRow("members", data[0] as Member);
        return;
      }
      case "update_member": {
        const { data, error } = await sb.from("members").update(op.patch).eq("id", op.id).select();
        if (error) throw error.code ? new Error(error.message) : new NetworkError(error.message);
        if (data?.[0]) this.applyRow("members", data[0] as Member);
        else throw new Error("แก้ข้อมูลของสมาชิกที่เข้าร่วมแล้วได้เฉพาะเจ้าตัว");
        return;
      }
    }
  }
}

/** Subscribes a component to one trip; the page component owns the store. */
export function useTrip(tripId: string): [TripState, TripStore] {
  const store = useMemo(() => new TripStore(tripId), [tripId]);
  useEffect(() => {
    void store.start();
    return () => store.stop();
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return [state, store];
}
