"use client";

import Link from "next/link";
import type { Address } from "viem";
import { useReadContracts } from "wagmi";
import { HolderRewardsAbi } from "@/lib/abis/HolderRewardsAbi";
import { useTokenMap, useUserStakes } from "@/lib/api";
import { CONTRACTS_READY } from "@/lib/config";
import { formatEth, formatTokens } from "@/lib/format";
import { useTx } from "@/lib/tx";
import type { StakePosition } from "@/lib/types";
import { TokenAvatar } from "../TokenAvatar";
import { TxNotice } from "../TxNotice";
import { WalletGate } from "../WalletGate";
import { Button, Card, Empty, ErrorBox, PageTitle, Skeleton, Stat } from "../ui";

export function RewardsView() {
  return (
    <div>
      <PageTitle
        title="Rewards"
        subtitle="Stake Pontoon tokens to earn a share of trading fees in ETH. Rewards are computed on-chain with a reward-per-share model and can be claimed at any time."
      />
      <WalletGate reason="Connect your wallet to see your staking positions and claimable ETH.">
        {(user) => <Positions user={user} />}
      </WalletGate>
    </div>
  );
}

function Positions({ user }: { user: Address }) {
  const { data, isLoading, error } = useUserStakes(user);
  const tokens = useTokenMap();
  const tx = useTx();
  const positions = (data ?? []).filter((p) => BigInt(p.staked) > 0n || BigInt(p.claimed) > 0n);
  const withRewards = positions.filter((p) => p.holderRewards);

  const pending = useReadContracts({
    contracts: withRewards.map((p) => ({
      address: p.holderRewards!,
      abi: HolderRewardsAbi,
      functionName: "pendingReward" as const,
      args: [user] as const,
    })),
    query: { enabled: CONTRACTS_READY && withRewards.length > 0, refetchInterval: 10_000 },
  });
  const claimable = new Map(
    withRewards.map((p, i) => [p.token.toLowerCase(), (pending.data?.[i]?.result as bigint | undefined) ?? 0n]),
  );
  const total = [...claimable.values()].reduce((a, b) => a + b, 0n);
  const claimedTotal = positions.reduce((a, p) => a + BigInt(p.claimed), 0n);

  async function claimAll() {
    for (const p of withRewards) {
      if ((claimable.get(p.token.toLowerCase()) ?? 0n) === 0n) continue;
      const ok = await tx.send((write) => write({ address: p.holderRewards!, abi: HolderRewardsAbi, functionName: "claim" }));
      if (!ok) break;
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Claimable" value={CONTRACTS_READY ? `${formatEth(total, 5)} ETH` : "—"} />
        <Stat label="Claimed so far" value={`${formatEth(claimedTotal, 4)} ETH`} />
        <Stat label="Active positions" value={positions.filter((p) => BigInt(p.staked) > 0n).length} />
      </section>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
        <Button disabled={!CONTRACTS_READY || !tx.ready || total === 0n || tx.busy} onClick={claimAll}>
          Claim all ({formatEth(total, 5)} ETH)
        </Button>
      </div>
      {positions.length === 0 ? (
        <Empty>
          No staking positions yet. Open any token page and stake in the <em>Staking rewards</em> panel.
        </Empty>
      ) : (
        <div className="space-y-3">
          {positions.map((p) => (
            <PositionRow
              key={p.token}
              position={p}
              symbol={tokens.get(p.token.toLowerCase())?.symbol}
              name={tokens.get(p.token.toLowerCase())?.name}
              claimable={claimable.get(p.token.toLowerCase())}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PositionRow({ position: p, symbol, name, claimable }: { position: StakePosition; symbol?: string; name?: string; claimable?: bigint }) {
  const tx = useTx();
  return (
    <Card className="flex flex-wrap items-center gap-4">
      <TokenAvatar symbol={symbol ?? "?"} address={p.token} />
      <div className="min-w-[140px] flex-1">
        <Link href={`/token/${p.token}`} className="font-display font-semibold hover:text-accent">
          {name ?? p.token}
        </Link>
        <div className="font-mono text-xs text-muted">${symbol ?? "?"}</div>
      </div>
      <dl className="tabular grid flex-[2] grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-xs text-muted">Staked</dt>
          <dd className="font-semibold">{formatTokens(p.staked)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Claimable</dt>
          <dd className="font-semibold text-accent">{claimable !== undefined && CONTRACTS_READY ? `${formatEth(claimable, 5)} ETH` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Claimed</dt>
          <dd>{formatEth(p.claimed)} ETH</dd>
        </div>
      </dl>
      <div className="flex flex-col items-end">
        <Button
          variant="secondary"
          disabled={!CONTRACTS_READY || !tx.ready || !claimable || tx.busy || !p.holderRewards}
          onClick={() => tx.send((write) => write({ address: p.holderRewards!, abi: HolderRewardsAbi, functionName: "claim" }))}
        >
          Claim
        </Button>
        <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
      </div>
    </Card>
  );
}
