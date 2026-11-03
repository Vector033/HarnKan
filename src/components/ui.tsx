"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatBaht } from "@/lib/core/money";

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
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-white p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="btn-ghost -mr-2" aria-label="ปิด">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

const AVATAR_COLORS = ["#12715b", "#1b3f73", "#a1620b", "#7a3e9d", "#b4412f", "#2f6f8f", "#5b6b1f", "#8f4a2f"];

export function Avatar({ name, id, size = 36 }: { name: string; id: string; size?: number }) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: AVATAR_COLORS[h % AVATAR_COLORS.length], fontSize: size * 0.42 }}
    >
      {[...name.trim()][0] ?? "?"}
    </span>
  );
}

export function Baht({ satang, className = "" }: { satang: number; className?: string }) {
  return (
    <span className={`num ${className}`}>
      {formatBaht(satang)}
      <span className="ml-0.5 text-[0.8em] font-normal opacity-70">฿</span>
    </span>
  );
}

export function PendingDot({ label = "รอซิงก์" }: { label?: string }) {
  return (
    <span className="chip bg-wait-soft text-wait" title="ยังไม่ถึงเซิร์ฟเวอร์">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-wait" />
      {label}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}
