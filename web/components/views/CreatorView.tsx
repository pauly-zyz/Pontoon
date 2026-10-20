"use client";

import Link from "next/link";
import { useState } from "react";
import type { Address } from "viem";
import { useReadContract } from "wagmi";
import { FeeVaultAbi } from "@/lib/abis/FeeVaultAbi";
import { useCreatorTokens, useNow } from "@/lib/api";
import { CONTRACTS_READY } from "@/lib/config";
import { countdown, formatEth, parseMetadata, pct } from "@/lib/format";
import { useTx } from "@/lib/tx";
import type { Token } from "@/lib/types";
import { FeePreview, FeeSliders, type FeeConfigState } from "../FeeSliders";
import { usePlatformFeeBps } from "../token/ConfigCard";
import { TokenAvatar } from "../TokenAvatar";
import { TxNotice } from "../TxNotice";
import { WalletGate } from "../WalletGate";
import { Badge, Button, Card, CardTitle, Empty, ErrorBox, PageTitle, Skeleton } from "../ui";

export function CreatorView() {
  return (
    <div>
      <PageTitle
        title="Creator dashboard"
        subtitle="Claim your payout and queue changes to your fee split. Changes take effect 24 hours after queueing, so holders can see them coming."
      />
      <WalletGate reason="Connect your creator wallet to manage your tokens.">{(user) => <CreatorTokens user={user} />}</WalletGate>
    </div>
  );
}

function CreatorTokens({ user }: { user: Address }) {
  const { data, isLoading, error } = useCreatorTokens(user);
  if (error) return <ErrorBox error={error} />;
  if (isLoading) return <Skeleton className="h-64" />;
  if (!data?.length)
    return (
      <Empty>
        You have not created or managed any tokens yet. <Link href="/launch" className="text-accent">Launch a token</Link>
      </Empty>
    );
  return (
    <div className="space-y-6">
      {data.map((t) => (
        <CreatorTokenCard key={t.address} token={t} user={user} />
      ))}
    </div>
  );
}

function CreatorTokenCard({ token: t, user }: { token: Token; user: Address }) {
  const now = useNow();
  const platformBps = usePlatformFeeBps();
  const isAdmin = t.admin.toLowerCase() === user.toLowerCase();
  const claimTx = useTx();
  const configTx = useTx();
  const [draft, setDraft] = useState<FeeConfigState>({ buybackBps: t.buybackBps, rewardBps: t.rewardBps });
  const owed = useReadContract({
    address: t.vault,
    abi: FeeVaultAbi,
    functionName: "creatorOwed",
    args: [user],
    query: { enabled: CONTRACTS_READY, refetchInterval: 10_000 },
  });
  const owedWei = owed.data ?? 0n;
  const pending = t.pendingConfigEta !== null;
  const left = pending && now ? countdown(t.pendingConfigEta!, now) : null;
  const unchanged = draft.buybackBps === t.buybackBps && draft.rewardBps === t.rewardBps;
  const meta = parseMetadata(t.metadataURI);

  return (
    <Card>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <TokenAvatar symbol={t.symbol} address={t.address} image={meta.image} />
        <div className="flex-1">
          <Link href={`/token/${t.address}`} className="font-display text-lg font-semibold hover:text-accent">
            {t.name}
          </Link>
          <div className="font-mono text-xs text-muted">${t.symbol}</div>
        </div>
        {!isAdmin && <Badge tone="danger">Admin moved via CTO</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3">
          <CardTitle>Payout</CardTitle>
          <dl className="tabular space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Claimable</dt>
              <dd className="font-semibold text-accent">{CONTRACTS_READY ? `${formatEth(owedWei, 5)} ETH` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Total creator share</dt>
              <dd>{formatEth(t.creatorFees)} ETH</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Claimed so far</dt>
              <dd>{formatEth(t.creatorClaimed)} ETH</dd>
            </div>
          </dl>
          <Button
            className="w-full"
            disabled={!CONTRACTS_READY || !claimTx.ready || owedWei === 0n || claimTx.busy}
            onClick={() => claimTx.send((write) => write({ address: t.vault, abi: FeeVaultAbi, functionName: "claimCreator" }))}
          >
            Claim payout
          </Button>
          <TxNotice status={claimTx.status} hash={claimTx.hash} error={claimTx.error} />
          <p className="text-xs text-muted">Undistributed fees need a distribute() call first (button on the token page).</p>
        </div>

        <div className="space-y-3">
          <CardTitle>Change fee split</CardTitle>
          <FeeSliders value={draft} onChange={setDraft} />
          <Button
            variant="secondary"
            className="w-full"
            disabled={!CONTRACTS_READY || !configTx.ready || !isAdmin || unchanged || configTx.busy}
            onClick={() =>
              configTx.send((write) => write({ address: t.vault, abi: FeeVaultAbi, functionName: "queueConfig", args: [draft] }))
            }
          >
            {pending ? "Replace queued change (restarts timelock)" : "Queue change (24h)"}
          </Button>
        </div>

        <div className="space-y-3">
          <CardTitle>Status</CardTitle>
          <p className="text-sm">
            Active: buyback {pct(t.buybackBps)} · rewards {pct(t.rewardBps)} · creator {pct(10_000 - t.buybackBps - t.rewardBps)}
          </p>
          {pending ? (
            <div className="rounded-xl border border-violet-400/30 bg-violet-400/5 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">Queued</span>
                <Badge tone="violet">{left ?? "ready to apply"}</Badge>
              </div>
              <p className="text-muted">
                buyback {pct(t.pendingBuybackBps ?? 0)} · rewards {pct(t.pendingRewardBps ?? 0)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  disabled={!CONTRACTS_READY || !configTx.ready || Boolean(left) || configTx.busy}
                  onClick={() => configTx.send((write) => write({ address: t.vault, abi: FeeVaultAbi, functionName: "applyConfig" }))}
                >
                  Apply
                </Button>
                <Button
                  variant="danger"
                  disabled={!CONTRACTS_READY || !configTx.ready || !isAdmin || configTx.busy}
                  onClick={() => configTx.send((write) => write({ address: t.vault, abi: FeeVaultAbi, functionName: "cancelConfig" }))}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No change queued.</p>
          )}
          <TxNotice status={configTx.status} hash={configTx.hash} error={configTx.error} />
          <div className="pt-2">
            <FeePreview config={draft} platformBps={platformBps} />
          </div>
        </div>
      </div>
    </Card>
  );
}
