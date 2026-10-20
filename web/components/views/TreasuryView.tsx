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
        title="Treasury & transparansi"
        subtitle="Semua angka dihitung dari event on-chain. Fee masuk ke FeeVault tiap token, lalu dibagi lewat distribute() yang bisa dipanggil siapa pun."
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Fee masuk" value={`${formatEth(fees.received, 3)} ETH`} hint={`${formatEth(fees.distributed, 3)} ETH sudah dibagi`} />
        <Stat label="Buyback dieksekusi" value={`${formatEth(buyback.ethSpent, 3)} ETH`} hint={`${buyback.count}× burn · ${formatEth(buyback.ethPending, 3)} ETH menunggu`} />
        <Stat label="Reward ke holder" value={`${formatEth(rewards.funded, 3)} ETH`} hint={`${formatEth(rewards.claimed, 3)} ETH sudah diklaim`} />
        <Stat
          label="Saldo PlatformTreasury"
          value={`${formatEth(onchain.data?.value ?? pt.balance, 3)} ETH`}
          hint={onchain.data ? "saldo on-chain" : "dari indexer"}
        />
      </section>

      <Card>
        <CardTitle>Ke mana fee pergi</CardTitle>
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
          <CardTitle>Transaksi terbaru</CardTitle>
          <TxFeed items={data.feed} />
        </Card>
        <div className="space-y-6">
          <Card>
            <CardTitle aside={contracts.treasury && <AddressLink address={contracts.treasury} />}>PlatformTreasury</CardTitle>
            <dl className="tabular mb-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Total diterima</dt>
                <dd>{formatEth(pt.received)} ETH</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Total ditarik</dt>
                <dd>{formatEth(pt.withdrawn)} ETH</dd>
              </div>
            </dl>
            <p className="mb-3 text-xs text-muted">Penarikan butuh multisig dan timelock 48 jam.</p>
            {pt.withdrawals.length === 0 ? (
              <Empty>Belum ada penarikan.</Empty>
            ) : (
              <Table
                head={["#", "Jumlah", "Ke", "Status"]}
                rows={pt.withdrawals.map((w) => [
                  w.id,
                  `${formatEth(w.amount)} ETH`,
                  <AddressLink key="to" address={w.to} />,
                  w.status === "queued" ? (
                    <Badge key="s" tone="violet">
                      {now && countdown(w.eta, now) ? countdown(w.eta, now) : "siap dieksekusi"}
                    </Badge>
                  ) : (
                    <Badge key="s" tone={w.status === "executed" ? "accent" : "default"}>
                      {w.status === "executed" ? "dieksekusi" : "dibatalkan"}
                    </Badge>
                  ),
                ])}
              />
            )}
          </Card>
          <Card>
            <CardTitle>Alamat contract</CardTitle>
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
                  {a ? <AddressLink address={a} /> : <span className="text-xs text-muted">belum diset</span>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
