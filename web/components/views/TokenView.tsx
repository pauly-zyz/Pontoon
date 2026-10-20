"use client";

import Link from "next/link";
import { isAddress } from "viem";
import { useActivity, useNow, useTokenDetail, useTrades } from "@/lib/api";
import { countdown, formatEth, formatTokens, parseMetadata, safeUrl, timeAgo } from "@/lib/format";
import type { TokenDetail } from "@/lib/types";
import { CurveProgress } from "../CurveProgress";
import { PriceChart } from "../PriceChart";
import { ConfigCard } from "../token/ConfigCard";
import { BuybackPanel, StakingPanel, TradePanel, VaultPanel } from "../token/panels";
import { QuoteBadge } from "../TokenCard";
import { TokenAvatar, tokenHue } from "../TokenAvatar";
import { TxFeed } from "../TxFeed";
import { AddressLink, Badge, Card, CardTitle, Empty, ErrorBox, Skeleton, Stat, TxLink } from "../ui";

export function TokenView({ address }: { address: string }) {
  const valid = isAddress(address, { strict: false });
  const { data, isLoading, error } = useTokenDetail(valid ? address : "0x0");

  if (!valid) return <Empty>Alamat token tidak valid.</Empty>;
  if (error) return <ErrorBox error={error} />;
  if (isLoading) return <TokenSkeleton />;
  if (!data)
    return (
      <Empty>
        Token ini tidak terdaftar di Pontoon. <Link href="/" className="text-accent">Kembali ke beranda</Link>
      </Empty>
    );
  return <TokenBody detail={data} />;
}

export function TokenSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

function TokenBody({ detail }: { detail: TokenDetail }) {
  const { token: t } = detail;
  const meta = parseMetadata(t.metadataURI);
  const hue = tokenHue(t.address);
  const now = useNow();
  const trades = useTrades(t.address);
  const activity = useActivity({ token: t.address, limit: 15 });
  const links = (
    [
      ["X", meta.twitter],
      ["Telegram", meta.telegram],
      ["Website", meta.website],
    ] as const
  )
    .map(([label, u]) => [label, safeUrl(u)] as const)
    .filter(([, u]) => u);

  return (
    <div className="space-y-6">
      <header className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -top-24 -left-10 h-72 w-72 rounded-full opacity-40 blur-[90px]"
          style={{ background: `hsl(${hue} 80% 55%)` }}
        />
        <div
          className="pointer-events-none absolute -right-10 -bottom-24 h-64 w-64 rounded-full opacity-25 blur-[90px]"
          style={{ background: `hsl(${(hue + 70) % 360} 80% 55%)` }}
        />
        <div className="relative flex flex-wrap items-start gap-5">
          <TokenAvatar symbol={t.symbol} address={t.address} image={meta.image} size={76} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{t.name}</h1>
              <span className="font-mono text-lg text-muted">${t.symbol}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <QuoteBadge quoteAsset={t.quoteAsset} />
              {t.isMemestock && <Badge tone="amber">Memestock</Badge>}
              {t.graduated ? <Badge tone="accent">🎓 Graduated · Uniswap V4</Badge> : <Badge>Bonding curve</Badge>}
            </div>
            {meta.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/80">{meta.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                Token <AddressLink address={t.address} />
              </span>
              <span>
                Creator <AddressLink address={t.creator} />
              </span>
              {t.admin.toLowerCase() !== t.creator.toLowerCase() && (
                <span>
                  Admin (CTO) <AddressLink address={t.admin} />
                </span>
              )}
              <span>
                Vault <AddressLink address={t.vault} />
              </span>
              {now && <span>Diluncurkan {timeAgo(t.launchedAt, now)}</span>}
            </div>
          </div>
          {links.length > 0 && (
            <div className="flex gap-2">
              {links.map(([label, u]) => (
                <a
                  key={label}
                  href={u!}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/50 hover:text-accent"
                >
                  {label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Market cap" value={`${formatEth(t.marketCapEth, 2)} ETH`} />
        <Stat label="Volume 24 jam" value={`${formatEth(detail.volume24h, 2)} ETH`} hint={`${detail.trades24h} trade`} />
        <Stat label="Buyback" value={`${formatEth(t.buybackEthSpent, 3)} ETH`} hint={`${formatTokens(t.tokensBurned)} ${t.symbol} dibakar`} />
        <Stat label="Reward ke holder" value={`${formatEth(t.rewardsFunded, 3)} ETH`} hint={`${t.stakerCount} staker`} />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardTitle>Harga</CardTitle>
            {trades.isLoading ? <Skeleton className="h-56" /> : <PriceChart trades={trades.data ?? []} />}
            <div className="mt-4">
              <CurveProgress bps={t.curveProgressBps} graduated={t.graduated} />
            </div>
          </Card>

          <ConfigCard config={detail.config} />

          <Card>
            <CardTitle>Riwayat buyback-burn</CardTitle>
            {detail.buybacks.length === 0 ? (
              <Empty>Belum ada buyback.</Empty>
            ) : (
              <Table
                head={["Waktu", "ETH masuk", "Token dibakar", "Tx"]}
                rows={detail.buybacks.map((b) => [
                  now ? timeAgo(b.timestamp, now) : "",
                  `${formatEth(b.ethIn)} ETH`,
                  `${formatTokens(b.tokensBurned)} ${t.symbol}`,
                  <TxLink key="tx" hash={b.txHash} />,
                ])}
              />
            )}
          </Card>

          <Card>
            <CardTitle>Distribusi fee</CardTitle>
            {detail.distributions.length === 0 ? (
              <Empty>Belum ada distribusi.</Empty>
            ) : (
              <Table
                head={["Waktu", "Platform", "Creator", "Buyback", "Reward", "Tx"]}
                rows={detail.distributions.map((d) => [
                  now ? timeAgo(d.timestamp, now) : "",
                  formatEth(d.platform),
                  formatEth(d.creator),
                  formatEth(d.buyback),
                  formatEth(d.rewards),
                  <TxLink key="tx" hash={d.txHash} />,
                ])}
              />
            )}
          </Card>

          <Card>
            <CardTitle aside={<span className="text-xs text-muted">total {formatTokens(t.totalStaked)} di-stake</span>}>
              Holder (staker teratas)
            </CardTitle>
            {detail.topStakers.length === 0 ? (
              <Empty>Belum ada yang stake.</Empty>
            ) : (
              <Table
                head={["Alamat", "Di-stake", "Porsi", "Reward diklaim"]}
                rows={detail.topStakers.map((s) => [
                  <AddressLink key="a" address={s.user} />,
                  formatTokens(s.staked),
                  BigInt(t.totalStaked) > 0n ? `${((Number(s.staked) / Number(t.totalStaked)) * 100).toFixed(1)}%` : "—",
                  `${formatEth(s.claimed)} ETH`,
                ])}
              />
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <TradePanel token={t} />
          <StakingPanel token={t} />
          <VaultPanel token={t} />
          <BuybackPanel token={t} />
          <CtoCard detail={detail} now={now} />
          <Card>
            <CardTitle>Aktivitas</CardTitle>
            <TxFeed items={activity.data} loading={activity.isLoading} showToken={false} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function CtoCard({ detail, now }: { detail: TokenDetail; now: number | null }) {
  const active = detail.cto.active;
  const last = detail.cto.history.find((r) => r.status === "executed");
  return (
    <Card>
      <CardTitle aside={<Link href="/cto" className="text-xs text-accent hover:underline">Halaman CTO →</Link>}>
        Status CTO
      </CardTitle>
      {active ? (
        <div className="space-y-1 text-sm">
          <Badge tone={active.status === "approved" ? "violet" : "default"}>
            {active.status === "approved" ? "Disetujui multisig" : "Menunggu persetujuan"}
          </Badge>
          <p className="text-muted">
            Admin baru <AddressLink address={active.newAdmin} />
          </p>
          <p className="text-muted">
            {now && countdown(active.eta, now) ? `Timelock: ${countdown(active.eta, now)}` : "Timelock 3 hari sudah lewat"}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Tidak ada pengajuan aktif.
          {last && (
            <>
              {" "}
              Takeover terakhir: <AddressLink address={last.oldAdmin ?? ""} /> → <AddressLink address={last.newAdmin} />.
            </>
          )}
        </p>
      )}
    </Card>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="tabular w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            {head.map((h) => (
              <th key={h} className="pb-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-3">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
