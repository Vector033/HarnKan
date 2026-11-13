"use client";

import { Check, Ticket, X } from "lucide-react";
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
  fluted = false,
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
  /** Upgrades the sheet backdrop to #2 Fluted Glass (vertical ribbed refraction + blur). */
  fluted?: boolean;
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
      className={`m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[var(--radius-coupon)] bg-ground p-0 text-ink sm:m-auto sm:max-w-lg sm:rounded-[var(--radius-coupon)] ${fluted ? "sheet-fluted" : ""}`}
    >
      {open && (
        <div className="paper-tint flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between gap-3 bg-paper px-5 pb-3.5 pt-4">
            <h2 id={titleId} className="text-body font-bold leading-tight">
              {title}
            </h2>
            {dismissible && (
              <button type="button" onClick={requestClose} className="-my-1 -mr-3 grid size-12 place-items-center rounded-lg hover:bg-ground" aria-label="ปิด">
                <X className="size-5" strokeWidth={1.75} />
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
      className="paper-tint inline-grid shrink-0 place-items-center rounded-lg font-bold text-ink shadow-[inset_0_0_0_1.5px_rgb(20_48_43/0.16)]"
      style={{ width: size, height: size, background: tint, fontSize: size * 0.44 }}
    >
      {initial(name)}
    </span>
  );
}

export function Baht({ satang, className = "" }: { satang: number; className?: string }) {
  return (
    <span className={`num font-num tabular-nums ${className}`}>
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
          {done && <Check className="size-4 shrink-0" strokeWidth={2} aria-hidden />}
          {done ? (compact ? "โอนครบแล้ว" : "ทุกคนโอนกันครบแล้ว") : label}
        </span>
        <span className={`num font-num tabular-nums shrink-0 whitespace-nowrap text-muted ${done && compact ? "hidden" : ""}`}>
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
    <div className="relative overflow-hidden rounded-[var(--radius-coupon)] border-2 border-dashed border-perf bg-paper/45 px-5 py-9 text-center">
      <div className="ledger-dot-grid absolute inset-0 opacity-75" aria-hidden />
      <div className="relative">
        <span className="mx-auto mb-3 inline-grid size-11 place-items-center rounded-lg border border-dashed border-perf bg-paper text-muted" aria-hidden>
          <Ticket className="size-5" strokeWidth={1.75} />
        </span>
        <p className="text-body font-semibold">{title}</p>
        {children && <div className="mx-auto mt-1.5 max-w-[32ch] text-body text-muted">{children}</div>}
      </div>
    </div>
  );
}

export function InkBandWatermark({ variant = "bar" }: { variant?: "bar" | "panel" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={variant === "bar" ? "0 0 640 140" : "0 0 560 640"}
      preserveAspectRatio="xMaxYMid slice"
      className={`pointer-events-none absolute inset-y-0 right-0 h-full ${
        variant === "bar" ? "w-[78%] max-w-2xl opacity-[0.22]" : "inset-x-0 w-full opacity-[0.19]"
      }`}
      style={{
        WebkitMaskImage:
          variant === "bar"
            ? "linear-gradient(270deg, #000 22%, rgb(0 0 0 / 0.6) 62%, transparent 100%)"
            : "radial-gradient(ellipse 90% 85% at 50% 50%, #000 35%, transparent 100%)",
        maskImage:
          variant === "bar"
            ? "linear-gradient(270deg, #000 22%, rgb(0 0 0 / 0.6) 62%, transparent 100%)"
            : "radial-gradient(ellipse 90% 85% at 50% 50%, #000 35%, transparent 100%)",
      }}
    >
      <g fill="none" stroke="var(--color-t1)">
        {variant === "bar" ? (
          <>
            <path d="M60,108 C190,48 320,122 470,56 C545,22 605,40 650,28" strokeWidth="1.4" strokeOpacity="0.55" />
            <path d="M90,128 C220,76 340,136 495,78 C565,50 612,64 650,54" strokeWidth="1.15" strokeOpacity="0.4" />
            <circle cx="496" cy="68" r="48" strokeWidth="1.4" strokeDasharray="3 3" strokeOpacity="0.75" />
            <circle cx="496" cy="68" r="36" strokeWidth="1.1" strokeOpacity="0.55" />
            <circle cx="496" cy="68" r="22" strokeWidth="1" strokeDasharray="2 3" strokeOpacity="0.5" />
            <g transform="translate(278 24) rotate(-7)">
              <rect x="0" y="0" width="132" height="68" rx="10" strokeWidth="1.4" strokeOpacity="0.65" />
              <line x1="90" y1="0" x2="90" y2="68" strokeWidth="1.4" strokeDasharray="4 4" strokeOpacity="0.7" />
              <circle cx="90" cy="0" r="4.5" fill="var(--color-ink)" strokeOpacity="0.65" />
              <circle cx="90" cy="68" r="4.5" fill="var(--color-ink)" strokeOpacity="0.65" />
              <line x1="14" y1="22" x2="66" y2="22" strokeWidth="1.75" strokeLinecap="round" strokeOpacity="0.55" />
              <line x1="14" y1="36" x2="52" y2="36" strokeWidth="1.35" strokeLinecap="round" strokeOpacity="0.45" />
              <line x1="14" y1="50" x2="40" y2="50" strokeWidth="1.35" strokeLinecap="round" strokeOpacity="0.4" />
              <line x1="102" y1="34" x2="120" y2="34" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.6" />
            </g>
          </>
        ) : (
          <>
            <path d="M-40,120 C120,55 240,185 400,125 C500,88 560,140 600,115" strokeWidth="1.4" strokeOpacity="0.55" />
            <path d="M-30,260 C130,195 250,320 420,260 C515,225 560,285 600,260" strokeWidth="1.25" strokeOpacity="0.45" />
            <path d="M-50,430 C110,365 260,490 430,430 C520,395 565,455 600,430" strokeWidth="1.25" strokeOpacity="0.42" />
            <path d="M-20,560 C140,500 280,610 440,555 C525,525 565,575 600,555" strokeWidth="1.1" strokeOpacity="0.36" />
            <circle cx="430" cy="140" r="56" strokeWidth="1.4" strokeDasharray="3 3" strokeOpacity="0.6" />
            <circle cx="430" cy="140" r="38" strokeWidth="1.1" strokeOpacity="0.45" />
          </>
        )}
      </g>
    </svg>
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
