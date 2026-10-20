"use client";

import Link from "next/link";
import { useState } from "react";
import { useActivity, useStats, useTokens } from "@/lib/api";
import { formatEth } from "@/lib/format";
import type { TokenTab } from "@/lib/types";
import { TokenCard } from "../TokenCard";
import { TxFeed } from "../TxFeed";
import { Card, CardTitle, Empty, ErrorBox, Skeleton, Stat, Tabs } from "../ui";

const TABS: { value: TokenTab; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "new", label: "Baru" },
  { value: "graduating", label: "Hampir Lulus" },
  { value: "memestock", label: "Memestock" },
];

export function TokenGrid({ tab, quote }: { tab: TokenTab; quote?: string }) {
  const { data, isLoading, error } = useTokens(tab, { quote });
  if (error) return <ErrorBox error={error} />;
  if (isLoading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52" />)}
      </div>
    );
  if (!data?.length) return <Empty>Belum ada token di sini.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((t) => (
        <TokenCard key={t.address} token={t} />
      ))}
    </div>
  );
}

export function HomeView() {
  const [tab, setTab] = useState<TokenTab>("trending");
  const stats = useStats();
  const activity = useActivity({ limit: 12 });
  const s = stats.data;

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Fee creator yang <span className="text-accent">kembali ke holder.</span>
          </h1>
          <p className="mt-3 text-muted">
            Luncurkan token lewat Pons V2. Setiap fee trading masuk ke vault on-chain, lalu dibagi otomatis ke
            buyback-and-burn, reward ETH untuk staker, dan payout creator.
          </p>
        </div>
        <Link
          href="/launch"
          className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-colors hover:bg-teal-300"
        >
          Launch token →
        </Link>
      </section>

      {stats.error ? (
        <ErrorBox error={stats.error} />
      ) : (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Volume 24 jam" value={s ? `${formatEth(s.volume24h, 2)} ETH` : "…"} hint={s && `${s.trades24h} trade`} />
          <Stat
            label="Token diluncurkan"
            value={s ? s.tokensLaunched.toLocaleString("en-US") : "…"}
            hint={s && `+${s.tokensLaunched24h} hari ini · ${s.graduated} graduated`}
          />
          <Stat label="Total buyback" value={s ? `${formatEth(s.totalBuybackEth, 2)} ETH` : "…"} hint="ETH dipakai beli token" />
          <Stat
            label="Total burn"
            value={s ? `${s.buybackCount.toLocaleString("en-US")}×` : "…"}
            hint="eksekusi buyback-and-burn ke 0x…dEaD"
          />
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Tabs tabs={TABS} value={tab} onChange={setTab} />
            {tab === "memestock" && (
              <Link href="/memestocks" className="text-sm text-accent hover:underline">
                Filter per quote pair →
              </Link>
            )}
          </div>
          <TokenGrid tab={tab} />
        </section>
        <aside>
          <Card>
            <CardTitle>Aktivitas terbaru</CardTitle>
            <TxFeed items={activity.data} loading={activity.isLoading} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
