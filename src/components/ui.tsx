"use client";

import { Check, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
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
  dismissible = true,
  onRequestClose,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** false: only the footer buttons can close it (Escape, backdrop and X do nothing). */
  dismissible?: boolean;
  /** Called instead of onClose for Escape, backdrop and X, e.g. to ask before dropping a draft. */
  onRequestClose?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const requestClose = () => {
    if (dismissible) (onRequestClose ?? onClose)();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        // Escape goes through the same gate as the X and the backdrop.
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => e.target === ref.current && requestClose()}
      aria-labelledby={titleId}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[var(--radius-coupon)] bg-ground p-0 text-ink sm:m-auto sm:max-w-lg sm:rounded-[var(--radius-coupon)]"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-3 bg-paper px-5 pb-3.5 pt-4">
            <h2 id={titleId} className="text-body font-bold leading-tight">
              {title}
            </h2>
            {dismissible && (
              <button type="button" onClick={requestClose} className="-my-1 -mr-3 grid size-12 place-items-center rounded-lg hover:bg-ground" aria-label="ปิด">
                <X className="size-5" strokeWidth={2.2} />
              </button>
            )}
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
      {initial(name)}
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

/**
 * How much of the trip is settled, drawn in the coupon's own line language:
 * the dashed track is money not settled yet, the solid ink fill is settled.
 */
export function SettleStrip({ settled, total, label = "โอนแล้ว", compact = false }: { settled: number; total: number; label?: string; compact?: boolean }) {
  const pct = total ? Math.min(100, Math.round((settled / total) * 100)) : 0;
  const done = total > 0 && settled >= total;
  return (
    <div>
      <p className="flex items-baseline justify-between gap-3 text-meta">
        <span className={`inline-flex min-w-0 items-center gap-1 font-semibold ${done ? "text-ok" : "text-muted"}`}>
          {done && <Check className="size-4 shrink-0" aria-hidden />}
          {done ? (compact ? "โอนครบแล้ว" : "ทุกคนโอนกันครบแล้ว") : label}
        </span>
        <span className={`num shrink-0 whitespace-nowrap text-muted ${done && compact ? "hidden" : ""}`}>
          <span className="font-semibold text-ink">{formatBaht(settled)}</span> / {formatBaht(total)} ฿
        </span>
      </p>
      <div
        className="relative mt-1.5 h-2.5 rounded-[3px] border-2 border-dashed border-perf"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span className="absolute -inset-y-0.5 -left-0.5 rounded-[3px] bg-ink transition-[width] duration-500 ease-out" style={{ width: `calc(${pct}% + 4px)`, maxWidth: "calc(100% + 4px)", display: pct ? undefined : "none" }} />
      </div>
    </div>
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

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "grapheme" }) : null;

/** First letter for a tile: skips Thai leading vowels (เบียร์ → บ) and keeps a whole emoji or grapheme. */
export function initial(name: string) {
  const s = name.trim().replace(/^[เแโใไ]+/, "") || name.trim();
  if (!s) return "?";
  if (segmenter) for (const { segment } of segmenter.segment(s)) return segment;
  return [...s][0];
}
