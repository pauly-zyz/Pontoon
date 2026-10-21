"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useNow, useTokens } from "@/lib/api";
import { formatEth, formatTokens, pct, shortAddr, timeAgo } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { Empty, Skeleton, TxLink } from "./ui";

const KIND: Record<string, { label: string; color: string }> = {
  launch: { label: "Launch", color: "bg-accent" },
  distribute: { label: "Distribution", color: "bg-sky-400" },
  initial_buy: { label: "Creator buy", color: "bg-accent" },
  buyback_burn: { label: "Buyback-burn", color: "bg-amber-400" },
  buyback_to_stakers: { label: "Buyback to stakers", color: "bg-teal-400" },
  stake: { label: "Stake", color: "bg-teal-400" },
  unstake: { label: "Unstake", color: "bg-slate-400" },
  reward_claim: { label: "Reward claim", color: "bg-teal-300" },
  creator_claim: { label: "Creator claim", color: "bg-violet-400" },
  config_queued: { label: "Config queued", color: "bg-violet-300" },
  config_applied: { label: "Config applied", color: "bg-violet-400" },
  config_cancelled: { label: "Config cancelled", color: "bg-slate-500" },
  graduated: { label: "Graduated", color: "bg-emerald-400" },
  cto_requested: { label: "CTO requested", color: "bg-rose-300" },
  cto_approved: { label: "CTO approved", color: "bg-rose-400" },
  cto_executed: { label: "CTO executed", color: "bg-rose-500" },
  cto_cancelled: { label: "CTO cancelled", color: "bg-slate-500" },
  treasury_withdraw_queued: { label: "Withdrawal queued", color: "bg-slate-300" },
  treasury_withdraw: { label: "Treasury withdrawal", color: "bg-slate-200" },
  treasury_withdraw_cancelled: { label: "Withdrawal cancelled", color: "bg-slate-500" },
};

function describe(a: Activity): string {
  const d = a.data ?? {};
  const eth = (v: unknown) => `${formatEth(String(v ?? 0))} ETH`;
  switch (a.kind) {
    case "launch":
      return `by ${shortAddr(a.actor)}`;
    case "distribute":
      return `${eth(a.amount)} split · buyback ${eth(d.buyback)} · rewards ${eth(d.rewards)}`;
    case "buyback_burn":
      return `${eth(a.amount)} → ${formatTokens(String(d.tokensBurned ?? 0))} tokens burned`;
    case "initial_buy":
      return `${eth(a.amount)} → ${formatTokens(String(d.tokensOut ?? 0))} tokens`;
    case "buyback_to_stakers":
      return `${eth(a.amount)} sent to stakers (token graduated)`;
    case "stake":
    case "unstake":
      return `${formatTokens(a.amount)} tokens · ${shortAddr(a.actor)}`;
    case "reward_claim":
    case "creator_claim":
      return `${eth(a.amount)} · ${shortAddr(a.actor)}`;
    case "config_queued":
    case "config_applied":
      return `buyback ${pct(Number(d.buybackBps ?? 0))} · rewards ${pct(Number(d.rewardBps ?? 0))}`;
    case "cto_requested":
    case "cto_approved":
      return `new admin ${shortAddr(String(d.newAdmin ?? ""))}`;
    case "cto_executed":
      return `${shortAddr(String(d.oldAdmin ?? ""))} → ${shortAddr(String(d.newAdmin ?? ""))}`;
    case "treasury_withdraw_queued":
    case "treasury_withdraw":
      return `${eth(a.amount)} to ${shortAddr(String(d.to ?? ""))}`;
    default:
      return "";
  }
}

/** Latest events from the indexer. */
export function TxFeed({ items, loading, showToken = true }: { items?: Activity[]; loading?: boolean; showToken?: boolean }) {
  const now = useNow();
  const { data: tokens } = useTokens("new", { limit: 100 });
  const symbols = useMemo(
    () => new Map((tokens ?? []).map((t) => [t.address.toLowerCase(), t.symbol])),
    [tokens],
  );

  if (loading) return <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (!items?.length) return <Empty>No activity yet.</Empty>;

  return (
    <ul className="divide-y divide-line">
      {items.map((a) => {
        const k = KIND[a.kind] ?? { label: a.kind, color: "bg-slate-500" };
        const sym = a.token ? symbols.get(a.token.toLowerCase()) : undefined;
        return (
          <li key={a.id} className="animate-fade-up flex items-start gap-3 py-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${k.color} shadow-[0_0_10px] shadow-current`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{k.label}</span>
                {showToken && a.token && (
                  <Link href={`/token/${a.token}`} className="font-mono text-xs text-accent hover:underline">
                    {sym ? `$${sym}` : shortAddr(a.token)}
                  </Link>
                )}
              </div>
              <div className="truncate text-xs text-muted">{describe(a)}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[11px] text-muted">{now ? timeAgo(a.timestamp, now) : " "}</div>
              <TxLink hash={a.txHash} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
