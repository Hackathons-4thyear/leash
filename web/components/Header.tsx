"use client";

import { useEffect, useRef, useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { addressUrl, chain, VAULT } from "@/lib/config";
import { errorMessage, shortAddr } from "@/lib/format";
import { useIsOwner } from "@/lib/tx";
import { useVault } from "@/lib/vault";
import { IconAlert, IconExternal, IconUser, IconWallet } from "./icons";
import { cx, Dot, Logo } from "./ui";

export function Header() {
  const { latestBlock, eventsError } = useVault();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">Leash</span>
          <span className="hidden h-5 w-px bg-line sm:block" />
          <span
            className="hidden items-center gap-2 rounded-full border border-line bg-white/[0.03] px-2.5 py-1 text-xs text-muted sm:inline-flex"
            title={latestBlock ? `Latest block ${latestBlock}` : undefined}
          >
            <Dot tone={eventsError ? "warn" : "safe"} pulse={!eventsError} />
            Base Sepolia
            {latestBlock && <span className="font-mono text-faint tabular">#{latestBlock.toString()}</span>}
          </span>
          <a
            href={addressUrl(VAULT)}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-xs text-muted transition hover:border-white/15 hover:text-fg md:inline-flex"
          >
            <span className="font-sans text-faint">Vault</span> {shortAddr(VAULT)}
            <IconExternal width={11} height={11} />
          </a>
        </div>
        <Wallet />
      </div>
      <WrongChain />
    </header>
  );
}

function Wallet() {
  const { address, status } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending, error } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const isOwner = useIsOwner();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!mounted || status === "reconnecting" || status === "connecting") {
    return <div className="h-9 w-36 animate-pulse rounded-xl bg-white/[0.05]" />;
  }

  if (!address) {
    const injected = connectors[0];
    const hasWallet = typeof window !== "undefined" && "ethereum" in window;
    return (
      <div className="flex flex-col items-end">
        <button
          type="button"
          disabled={isPending}
          onClick={() => (hasWallet ? connect({ connector: injected }) : window.open("https://metamask.io/download/", "_blank"))}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-safe px-4 text-sm font-semibold text-ink shadow-[0_0_24px_-6px] shadow-safe/60 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          <IconWallet />
          {isPending ? "Connecting…" : hasWallet ? "Connect wallet" : "Install MetaMask"}
        </button>
        {error && <span className="mt-1 text-[11px] text-danger">{errorMessage(error)}</span>}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      {isOwner && (
        <span className="hidden items-center gap-1 rounded-full bg-safe/10 px-2.5 py-1 text-xs font-medium text-safe ring-1 ring-inset ring-safe/25 sm:inline-flex">
          <IconUser width={12} height={12} /> Owner
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Wallet ${address}`}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-white/[0.04] px-3 font-mono text-sm transition hover:border-white/15"
      >
        <span className="size-2 rounded-full bg-safe" aria-hidden />
        {shortAddr(address)}
      </button>
      {open && (
        <div className="card absolute right-0 top-11 w-56 overflow-hidden p-1 text-sm">
          <a
            href={addressUrl(address)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-lg px-3 py-2 text-muted hover:bg-white/5 hover:text-fg"
          >
            View on BaseScan <IconExternal width={12} height={12} />
          </a>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="w-full rounded-lg px-3 py-2 text-left text-danger hover:bg-danger/10"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function WrongChain() {
  const { chainId, status } = useConnection();
  const { mutate: switchChain, isPending, error } = useSwitchChain();
  if (status !== "connected" || chainId === chain.id) return null;
  return (
    <div className="border-t border-warn/20 bg-warn/[0.08]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm sm:px-6">
        <span className="flex items-center gap-2 text-warn">
          <IconAlert />
          Your wallet is on the wrong network. Leash runs on Base Sepolia.
          {error && <span className="text-xs text-warn/70">({errorMessage(error)})</span>}
        </span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => switchChain({ chainId: chain.id })}
          className={cx("rounded-lg bg-warn px-3 py-1 text-xs font-semibold text-ink transition hover:brightness-110", isPending && "opacity-60")}
        >
          {isPending ? "Switching…" : "Switch to Base Sepolia"}
        </button>
      </div>
    </div>
  );
}
