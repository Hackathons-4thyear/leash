"use client";

import { useEffect, useState, type ReactNode } from "react";
import { addressUrl, labelOf, txUrl } from "@/lib/config";
import { shortAddr, shortHash } from "@/lib/format";
import { IconCheck, IconCopy, IconExternal } from "./icons";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      className="grid size-5 place-items-center rounded text-faint transition hover:bg-white/5 hover:text-fg"
      title={copied ? "Copied" : "Copy"}
      aria-label="Copy to clipboard"
    >
      {copied ? <IconCheck width={12} height={12} className="text-safe" /> : <IconCopy width={12} height={12} />}
    </button>
  );
}

const toneClass = {
  safe: "text-safe bg-safe/10 ring-safe/20",
  danger: "text-danger bg-danger/10 ring-danger/25",
  accent: "text-info bg-info/10 ring-info/20",
  neutral: "text-muted bg-white/5 ring-white/10",
};

/** Label chip + short address + copy + BaseScan link. */
export function Addr({ address, showLabel = true, className }: { address: string; showLabel?: boolean; className?: string }) {
  const known = labelOf(address);
  return (
    <span className={cx("inline-flex min-w-0 items-center gap-1.5", className)}>
      {showLabel && known && (
        <span className={cx("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", toneClass[known.tone])}>
          {known.label}
        </span>
      )}
      <a
        href={addressUrl(address)}
        target="_blank"
        rel="noreferrer"
        className="truncate font-mono text-xs text-muted transition hover:text-fg"
        title={address}
      >
        {shortAddr(address)}
      </a>
      <CopyButton value={address} />
    </span>
  );
}

export function TxLink({ hash, className }: { hash: string; className?: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className={cx("inline-flex items-center gap-1 font-mono text-[11px] text-faint transition hover:text-fg", className)}
      title={hash}
    >
      {shortHash(hash)}
      <IconExternal width={11} height={11} />
    </a>
  );
}

export function CardHeader({ icon, title, right, sub }: { icon: ReactNode; title: string; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-muted ring-1 ring-inset ring-white/[0.06]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
          {sub && <p className="truncate text-xs text-faint">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Dot({ tone, pulse }: { tone: "safe" | "danger" | "warn" | "muted"; pulse?: boolean }) {
  const c = { safe: "bg-safe text-safe", danger: "bg-danger text-danger", warn: "bg-warn text-warn", muted: "bg-faint text-faint" }[tone];
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", c, pulse && "animate-pulse-ring")} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx("inline-block animate-pulse rounded-md bg-white/[0.06]", className)} />;
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id="leash-g" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2bff88" />
          <stop offset="1" stopColor="#0f8a4a" />
        </linearGradient>
      </defs>
      {/* Shield */}
      <path d="M16 2.5 5 6.8v8.1c0 6.7 4.6 12 11 14.6 6.4-2.6 11-7.9 11-14.6V6.8L16 2.5z" fill="url(#leash-g)" fillOpacity="0.14" stroke="url(#leash-g)" strokeWidth="1.6" strokeLinejoin="round" />
      {/* Leash: a loop handle with a line down to a clasp ring */}
      <path d="M16 8.2a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z" stroke="#2bff88" strokeWidth="1.8" />
      <path d="M16 14.6c0 2.2-2.6 2.9-2.6 5.2 0 1.6 1.2 2.6 2.6 2.6" stroke="#2bff88" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="23.4" r="1.6" fill="#2bff88" />
    </svg>
  );
}
