"use client";

import { useBalance } from "wagmi";
import { useNow, useTreasury } from "@/lib/api";
import { contracts, CONTRACTS_READY } from "@/lib/config";
import { countdown, formatEth } from "@/lib/format";
import { FeeSplitBar } from "../FeeSplitBar";
import { TxFeed } from "../TxFeed";
import { AddressLink, Badge, Card, CardTitle, Empty, ErrorBox, PageTitle, Skeleton, Stat } from "../ui";
import { Table } from "./TokenView";

const toNum = (wei: string) => Number(BigInt(wei)) / 1e18;

export function TreasuryView() {
  const { data, isLoading, error } = useTreasury();
  const now = useNow();
  const onchain = useBalance({ address: contracts.treasury, query: { enabled: CONTRACTS_READY && Boolean(contracts.treasury) } });

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data)
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );

  const { fees, buyback, rewards, platformTreasury: pt } = data;
  const split = fees.split;

  return (
    <div className="space-y-6">
      <PageTitle
        title="Treasury & transparency"
        subtitle="Every number is computed from on-chain events. Fees land in each token's FeeVault and are split by distribute(), which anyone can call."
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fees received" value={`${formatEth(fees.received, 3)} ETH`} hint={`${formatEth(fees.distributed, 3)} ETH distributed`} />
        <Stat label="Buybacks executed" value={`${formatEth(buyback.ethSpent, 3)} ETH`} hint={`${buyback.count} burns · ${formatEth(buyback.ethPending, 3)} ETH pending`} />
        <Stat label="Holder rewards" value={`${formatEth(rewards.funded, 3)} ETH`} hint={`${formatEth(rewards.claimed, 3)} ETH claimed`} />
        <Stat
          label="PlatformTreasury balance"
          value={`${formatEth(onchain.data?.value ?? pt.balance, 3)} ETH`}
          hint={onchain.data ? "on-chain balance" : "from the indexer"}
        />
      </section>

      <Card>
        <CardTitle>Where the fees go</CardTitle>
        <FeeSplitBar
          parts={{
            platform: toNum(split.platform),
            creator: toNum(split.creator),
            buyback: toNum(split.buyback),
            rewards: toNum(split.rewards),
            incentive: toNum(split.callerIncentives),
          }}
          format={(v) => `${v.toLocaleString("en-US", { maximumFractionDigits: 3 })} ETH`}
        />
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardTitle>Latest transactions</CardTitle>
          <TxFeed items={data.feed} />
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle aside={contracts.treasury && <AddressLink address={contracts.treasury} />}>PlatformTreasury</CardTitle>
            <dl className="tabular mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Total received</dt>
                <dd>{formatEth(pt.received)} ETH</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total withdrawn</dt>
                <dd>{formatEth(pt.withdrawn)} ETH</dd>
              </div>
            </dl>
            <p className="mb-3 text-xs text-muted">Withdrawals require the multisig and a 48h timelock.</p>
            {pt.withdrawals.length === 0 ? (
              <Empty>No withdrawals yet.</Empty>
            ) : (
              <Table
                head={["#", "Amount", "To", "Status"]}
                rows={pt.withdrawals.map((w) => [
                  w.id,
                  `${formatEth(w.amount)} ETH`,
                  <AddressLink key="to" address={w.to} />,
                  w.status === "queued" ? (
                    <Badge key="s" tone="violet">
                      {now && countdown(w.eta, now) ? countdown(w.eta, now) : "ready to execute"}
                    </Badge>
                  ) : (
                    <Badge key="s" tone={w.status === "executed" ? "accent" : "default"}>
                      {w.status === "executed" ? "executed" : "cancelled"}
                    </Badge>
                  ),
                ])}
              />
            )}
          </Card>
          <Card>
            <CardTitle>Contract addresses</CardTitle>
            <ul className="space-y-1.5 text-sm">
              {(
                [
                  ["PontoonLauncher", contracts.launcher],
                  ["TokenRegistry", contracts.registry],
                  ["BuybackExecutor", contracts.buybackExecutor],
                  ["PlatformTreasury", contracts.treasury],
                  ["CTOManager", contracts.ctoManager],
                ] as const
              ).map(([name, a]) => (
                <li key={name} className="flex justify-between">
                  <span className="text-muted">{name}</span>
                  {a ? <AddressLink address={a} /> : <span className="text-xs text-muted">not set</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
