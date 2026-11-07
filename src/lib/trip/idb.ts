// Local copy of each trip plus the queue of changes made while offline.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { QueuedOp, Snapshot } from "./types";

interface HarnKanDB extends DBSchema {
  snapshots: { key: string; value: Snapshot };
  outbox: { key: number; value: QueuedOp; indexes: { byTrip: string } };
}

let dbPromise: Promise<IDBPDatabase<HarnKanDB>> | null = null;

function db() {
  dbPromise ??= openDB<HarnKanDB>("harnkan", 1, {
    upgrade(d) {
      d.createObjectStore("snapshots");
      d.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true }).createIndex("byTrip", "tripId");
    },
  });
  return dbPromise;
}

export async function loadSnapshot(tripId: string) {
  return (await db()).get("snapshots", tripId);
}

export async function saveSnapshot(snap: Snapshot) {
  await (await db()).put("snapshots", snap, snap.trip.id);
}

export async function allSnapshots() {
  return (await db()).getAll("snapshots");
}

export async function loadQueue(tripId: string) {
  const all = await (await db()).getAllFromIndex("outbox", "byTrip", tripId);
  return all.sort((a, b) => a.seq - b.seq);
}

/** Replaces this trip's queue with `queue` (after merging or removing ops). */
export async function saveQueue(tripId: string, queue: QueuedOp[]) {
  const tx = (await db()).transaction("outbox", "readwrite");
  const keep = new Set(queue.map((q) => q.seq));
  for (const q of await tx.store.index("byTrip").getAll(tripId)) if (!keep.has(q.seq)) await tx.store.delete(q.seq);
  for (const q of queue) await tx.store.put(q);
  await tx.done;
}

/** Reserves a sequence number that orders ops across tabs and reloads. */
export async function nextSeq(): Promise<number> {
  const cursor = await (await db()).transaction("outbox").store.openCursor(null, "prev");
  return Math.max(cursor?.value.seq ?? 0, Date.now() * 1000 + Math.floor(Math.random() * 1000)) + 1;
}

/** Removes everything this device keeps about one trip. */
export async function forgetTrip(tripId: string) {
  const d = await db();
  const tx = d.transaction(["snapshots", "outbox"], "readwrite");
  await tx.objectStore("snapshots").delete(tripId);
  const outbox = tx.objectStore("outbox");
  for (const q of await outbox.index("byTrip").getAll(tripId)) await outbox.delete(q.seq);
  await tx.done;
}

/** Removes every trip from this device (shared or borrowed phones). */
export async function forgetAll() {
  const d = await db();
  const tx = d.transaction(["snapshots", "outbox"], "readwrite");
  await tx.objectStore("snapshots").clear();
  await tx.objectStore("outbox").clear();
  await tx.done;
}
