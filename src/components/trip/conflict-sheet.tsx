"use client";

import type { TripState, TripStore } from "@/lib/trip/store";
import type { Conflict, ExpenseDraft } from "@/lib/trip/types";
import { Baht, Sheet } from "../ui";

/** Shows both versions when a queued edit lost a race, and lets the user pick one. */
export function ConflictSheet({ conflict, state, store }: { conflict: Conflict; state: TripState; store: TripStore }) {
  const names = new Map(state.view!.members.map((m) => [m.id, m.nickname]));
  const theirsBy = state.view!.members.find((m) => m.user_id === conflict.theirs.updated_by)?.nickname ?? "เพื่อน";
  const { theirs, mine } = conflict;

  async function keepMine() {
    store.dismissConflict(conflict.id);
    if (mine === "deleted") {
      if (!theirs.deleted) await store.do({ kind: "delete_expense", id: theirs.id, baseVersion: theirs.version });
    } else if (theirs.deleted) {
      // Bring it back as a new expense so the delete is not silently undone under the same id.
      await store.do({ kind: "save_expense", expense: { ...mine, id: crypto.randomUUID() }, baseVersion: null });
    } else {
      await store.do({ kind: "save_expense", expense: mine, baseVersion: theirs.version });
    }
  }

  return (
    <Sheet
      open
      onClose={() => store.dismissConflict(conflict.id)}
      title="มีคนแก้รายการเดียวกัน"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button className="btn" onClick={() => store.dismissConflict(conflict.id)} data-testid="keep-theirs">
            ใช้ของ {theirsBy}
          </button>
          <button className="btn-primary" onClick={keepMine} data-testid="keep-mine">
            ใช้ของฉัน
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted">
        {theirsBy} บันทึกรายการนี้ก่อนการแก้ของคุณจะถึงเซิร์ฟเวอร์ เลือกว่าจะเก็บแบบไหน
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Version heading={`ของ ${theirsBy}`} e={theirs.deleted ? "deleted" : theirs} names={names} />
        <Version heading="ของฉัน" e={mine} names={names} highlight />
      </div>
    </Sheet>
  );
}

function Version({
  heading,
  e,
  names,
  highlight,
}: {
  heading: string;
  e: ExpenseDraft | "deleted";
  names: Map<string, string>;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-brand bg-brand-soft/40" : "border-line"}`}>
      <p className="mb-2 text-xs font-semibold text-muted">{heading}</p>
      {e === "deleted" ? (
        <p className="font-medium text-owe">ลบรายการนี้</p>
      ) : (
        <dl className="space-y-1 text-sm">
          <dt className="sr-only">รายการ</dt>
          <dd className="font-medium">{e.title}</dd>
          <dt className="sr-only">จำนวน</dt>
          <dd>
            <Baht satang={e.amount} className="text-lg font-bold" />
          </dd>
          <dd className="text-muted">{names.get(e.paid_by)} จ่าย</dd>
          <dd className="text-muted">
            หารกับ{" "}
            {Object.entries(e.split)
              .filter(([, v]) => v > 0)
              .map(([id]) => names.get(id))
              .join(", ")}
          </dd>
        </dl>
      )}
    </div>
  );
}
