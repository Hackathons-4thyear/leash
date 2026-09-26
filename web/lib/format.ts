import { formatUnits } from "viem";
import { DECIMALS } from "./config";

export function usdc(amount: bigint | undefined): string {
  if (amount === undefined) return "—";
  const n = Number(formatUnits(amount, DECIMALS));
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export const REASONS: Record<string, string> = {
  VAULT_PAUSED: "Kill switch on",
  INVALID_PAYMENT: "Invalid payment",
  EXCEEDS_PER_TX_CAP: "Over per-payment limit",
  EXCEEDS_DAILY_CAP: "Daily limit reached",
  LOW_REPUTATION: "Untrusted recipient",
  INSUFFICIENT_BALANCE: "Vault balance too low",
};
export const humanReason = (code?: string) => (code ? REASONS[code] ?? code : "Blocked");

export function relTime(tsMs: number, now: number): string {
  const s = Math.max(0, Math.round((now - tsMs) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function countdown(msLeft: number): string {
  if (msLeft <= 0) return "0:00";
  const s = Math.floor(msLeft / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function duration(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** Short, readable message from a wallet / viem error. */
export function errorMessage(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string; name?: string };
  if (e?.name === "UserRejectedRequestError" || /rejected|denied/i.test(e?.message ?? "")) return "Rejected in wallet";
  return (e?.shortMessage || e?.message || "Transaction failed").split("\n")[0];
}
