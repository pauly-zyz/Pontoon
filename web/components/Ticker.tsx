"use client";

import Link from "next/link";
import { useActivity, useTokenMap } from "@/lib/api";
import { formatEth, formatTokens } from "@/lib/format";
import type { Activity } from "@/lib/types";

const KINDS = ["buyback_burn", "launch", "graduated", "distribute", "reward_claim"];

function label(a: Activity, symbol: string) {
  switch (a.kind) {
    case "buyback_burn":
      return (
        <>
          <span className="text-split-buyback">🔥 ${symbol}</span> {formatTokens(String(a.data?.tokensBurned ?? 0))} burned
        </>
      );
    case "launch":
      return (
        <>
          <span className="text-accent">⚓ ${symbol}</span> just launched
        </>
      );
    case "graduated":
      return (
        <>
          <span className="text-emerald-300">🎓 ${symbol}</span> graduated to Uniswap V4
        </>
      );
    case "distribute":
      return (
        <>
          <span className="text-sky-300">◆ ${symbol}</span> {formatEth(a.amount)} ETH in fees split
        </>
      );
    default:
      return (
        <>
          <span className="text-teal-200">✦ ${symbol}</span> {formatEth(a.amount)} ETH in rewards claimed
        </>
      );
  }
}

/** Endless ribbon of recent on-chain events. */
export function Ticker() {
  const { data } = useActivity({ kinds: KINDS, limit: 24 });
  const tokens = useTokenMap();
  const items = (data ?? []).filter((a) => a.token);
  if (items.length === 0) return null;
  const loop = [...items, ...items];

  return (
    <div className="relative -mx-4 -mt-10 overflow-hidden border-y border-line/60 bg-surface/40 py-2.5 sm:-mx-6" aria-label="Latest activity">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent" />
      <div className="animate-marquee flex w-max gap-10 text-sm whitespace-nowrap">
        {loop.map((a, i) => {
          const sym = tokens.get(a.token!.toLowerCase())?.symbol ?? "?";
          return (
            <Link key={`${a.id}-${i}`} href={`/token/${a.token}`} className="text-muted transition-colors hover:text-ink" tabIndex={i >= items.length ? -1 : 0}>
              {label(a, sym)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
