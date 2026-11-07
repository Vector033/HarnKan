"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { formatBaht } from "@/lib/core/money";

const TINTS = ["--color-t0", "--color-t1", "--color-t2", "--color-t3", "--color-t4", "--color-t5"];

/** Each member keeps one coupon tint for the whole trip, by join order. */
export function memberTint(members: { id: string }[], id: string) {
  const i = Math.max(0, members.findIndex((m) => m.id === id));
  return `var(${TINTS[i % TINTS.length]})`;
}

/** Bottom sheet on phones, centred dialog on wider screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[var(--radius-coupon)] bg-ground p-0 text-ink sm:m-auto sm:max-w-lg sm:rounded-[var(--radius-coupon)]"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-3 bg-paper px-5 pb-3.5 pt-4">
            <h2 className="text-body font-bold leading-tight">{title}</h2>
            <button type="button" onClick={onClose} className="-mr-2 grid size-11 place-items-center rounded-lg hover:bg-ground" aria-label="ปิด">
              <X className="size-5" strokeWidth={2.2} />
            </button>
          </div>
          <div className="perf-x" aria-hidden />
          <div className="overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <div className="border-t border-line bg-paper px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}

/** A member's coupon-tinted tile with their first letter. */
export function MemberTile({ name, tint, size = 36 }: { name: string; tint: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-lg font-bold text-ink shadow-[inset_0_0_0_1.5px_rgb(20_48_43/0.16)]"
      style={{ width: size, height: size, background: tint, fontSize: size * 0.44 }}
    >
      {[...name.trim()][0] ?? "?"}
    </span>
  );
}

export function Baht({ satang, className = "" }: { satang: number; className?: string }) {
  return (
    <span className={`num ${className}`}>
      {formatBaht(satang)}
      <span className="ml-1 text-[0.72em] font-medium">฿</span>
    </span>
  );
}

/**
 * A change on this device that has not reached the server yet. Pending is
 * shown by a dashed outline, the same mark the coupons use for "not settled".
 */
export function PendingMark({ label = "รอส่ง" }: { label?: string }) {
  return (
    <span className="chip border border-dashed border-wait bg-wait-soft text-wait" title="ยังไม่ถึงเซิร์ฟเวอร์">
      {label}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-coupon)] border-2 border-dashed border-perf px-5 py-10 text-center">
      <p className="text-body font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-[32ch] text-body text-muted">{children}</div>}
    </div>
  );
}
