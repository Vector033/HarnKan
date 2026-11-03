import type { Split, SplitMode } from "@/lib/core/split";

export interface Trip {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface Member {
  id: string;
  trip_id: string;
  user_id: string | null;
  nickname: string;
  promptpay_id: string | null;
  payee_name: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  paid_by: string;
  split_mode: SplitMode;
  split: Split;
  spent_at: string;
  deleted: boolean;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = "claimed" | "confirmed" | "rejected" | "cancelled";

/** What is kept from a slip. Never the image, never full account numbers. */
export interface SlipSummary {
  amount: number | null; // baht as printed
  dateTime: string | null;
  receiverName: string | null;
  receiverLast4: string | null;
  bank: string | null;
  reference: string | null;
  confidence: number;
  reasons: string[];
}

export interface Payment {
  id: string;
  trip_id: string;
  from_member: string;
  to_member: string;
  amount: number;
  status: PaymentStatus;
  source: "manual" | "slip";
  slip: SlipSummary | null;
  created_by: string | null;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface Snapshot {
  trip: Trip;
  members: Member[];
  expenses: Expense[];
  payments: Payment[];
  userId: string;
  savedAt: string;
}

export type ExpenseDraft = Pick<
  Expense,
  "id" | "trip_id" | "title" | "amount" | "paid_by" | "split_mode" | "split" | "spent_at"
>;

export type PaymentDraft = Pick<Payment, "id" | "trip_id" | "from_member" | "to_member" | "amount" | "source"> & {
  slip?: SlipSummary | null;
};

export type MemberPatch = Partial<Pick<Member, "nickname" | "promptpay_id" | "payee_name">>;

/** A change made on this device, waiting to reach the server. */
export type Op =
  | { kind: "save_expense"; expense: ExpenseDraft; baseVersion: number | null }
  | { kind: "delete_expense"; id: string; baseVersion: number }
  | { kind: "record_payment"; payment: PaymentDraft }
  | { kind: "decide_payment"; id: string; decision: "confirmed" | "rejected" | "cancelled" }
  | { kind: "add_member"; member: Pick<Member, "id" | "trip_id" | "nickname"> }
  | { kind: "update_member"; id: string; patch: MemberPatch };

export interface QueuedOp {
  seq: number;
  tripId: string;
  op: Op;
  queuedAt: string;
}

/** A queued edit the server refused because someone else changed the row first. */
export interface Conflict {
  id: string;
  mine: ExpenseDraft | "deleted";
  theirs: Expense;
}
