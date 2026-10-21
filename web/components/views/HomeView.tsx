"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEther } from "viem";
import { useActivity, useStats, useTokenDetail, useTokens } from "@/lib/api";
import { CONTRACTS_READY, OFFICIAL_TOKEN, PRE_LAUNCH, SOCIAL } from "@/lib/config";
import { formatUsd, usdText, useEthUsd } from "@/lib/price";
import type { TokenTab } from "@/lib/types";
import { CountUp } from "../CountUp";
import { FeeFlow } from "../FeeFlow";
import { OfficialToken } from "../OfficialToken";
import { Ticker } from "../Ticker";
import { TokenCard } from "../TokenCard";
import { TxFeed } from "../TxFeed";
import { XIcon } from "../XIcon";
import { Card, CardTitle, Empty, ErrorBox, Skeleton, Stat, Tabs } from "../ui";

const TABS: { value: TokenTab; label: string }[] = [
  { value: "trending", label: "🔥 Trending" },
  { value: "new", label: "✨ New" },
  { value: "graduating", label: "🎯 Almost graduated" },
  { value: "memestock", label: "📈 Memestocks" },
];

export function TokenGrid({ tab, quote }: { tab: TokenTab; quote?: string }) {
  const { data, isLoading, error } = useTokens(tab, { quote });
  if (error) return <ErrorBox error={error} />;
  if (isLoading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-60" />)}
      </div>
    );
  if (!data?.length)
    return (
      <Empty>
        {PRE_LAUNCH ? (
          <>
            <span className="block font-display text-base font-semibold text-ink">No tokens yet</span>
            <span className="mt-1 block">Pontoon is launching soon on Robinhood Chain. The first tokens will appear here.</span>
          </>
        ) : (
          "No tokens here yet."
        )}
      </Empty>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((t, i) => (
        <div key={t.address} className="animate-fade-up h-full" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <TokenCard token={t} rank={tab === "trending" ? i + 1 : undefined} />
        </div>
      ))}
    </div>
  );
}

const eth = (wei: string | undefined) => Number(formatEther(BigInt(wei ?? 0)));
const fmtEth = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 })} ETH`;
const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");

function Hero() {
  return (
    <section className="relative -mx-4 overflow-hidden px-4 pt-6 pb-16 sm:-mx-6 sm:px-6 lg:pt-10">
      {/* glow orbs */}
      <div className="pointer-events-none absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-accent/20 blur-[100px]" />
      <div className="pointer-events-none absolute top-10 right-10 h-64 w-64 rounded-full bg-violet-500/15 blur-[100px]" />

      <div className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-accent" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            Launchpad on Robinhood Chain · built on Pons V2
          </span>
          <h1 className="mt-5 font-display text-[2.6rem] leading-[1.05] font-bold tracking-tight sm:text-6xl">
            Every trade
            <br />
            <span className="text-gradient">gives back.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            Creator fees flow into an on-chain vault and are split automatically between{" "}
            <span className="text-split-buyback">buyback-and-burn</span>,{" "}
            <span className="text-split-rewards">ETH rewards for stakers</span>, and the{" "}
            <span className="text-split-creator">creator payout</span>. Nobody can withdraw the holders&apos; share.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/launch"
              className="rounded-xl bg-gradient-to-r from-teal-300 to-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-[0_10px_30px_-10px_rgb(45_212_191/0.8)] transition hover:brightness-110"
            >
              {CONTRACTS_READY ? "Launch token →" : "Prepare your launch →"}
            </Link>
            <Link
              href="/docs"
              className="rounded-xl border border-line bg-surface/60 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:border-accent/40"
            >
              How it works
            </Link>
            <a
              href={SOCIAL.x.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface/60 px-5 py-3 text-sm font-semibold backdrop-blur transition hover:border-accent/40"
            >
              <XIcon /> Follow on X
            </a>
          </div>
          <OfficialToken className="mt-6 max-w-xl" />
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            <li>✓ 24h timelock on fee changes</li>
            <li>✓ Verifiable burns to 0x…dEaD</li>
            <li>✓ Claims are never locked</li>
          </ul>
        </div>

        <div className="glass animate-float relative rounded-3xl p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between text-xs text-muted">
            <span className="font-medium tracking-[0.14em] uppercase">Fee flow</span>
            <span>per trade</span>
          </div>
          <FeeFlow />
        </div>
      </div>

      {/* waves */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden opacity-60" aria-hidden>
        <svg className="wave-slow absolute bottom-0 h-12 w-[200%]" viewBox="0 0 1600 60" preserveAspectRatio="none">
          <path d="M0 30 Q 100 10 200 30 T 400 30 T 600 30 T 800 30 T 1000 30 T 1200 30 T 1400 30 T 1600 30 V60 H0Z" fill="rgb(167 139 250 / 0.06)" />
        </svg>
        <svg className="wave absolute bottom-0 h-10 w-[200%]" viewBox="0 0 1600 60" preserveAspectRatio="none">
          <path d="M0 35 Q 100 15 200 35 T 400 35 T 600 35 T 800 35 T 1000 35 T 1200 35 T 1400 35 T 1600 35 V60 H0Z" fill="rgb(45 212 191 / 0.08)" />
        </svg>
      </div>
    </section>
  );
}

/** The official $PONTOON token, pinned above the token lists once the indexer has it. */
function OfficialTokenSection() {
  const { data } = useTokenDetail(OFFICIAL_TOKEN.address);
  if (!data) return null;
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="font-display text-xl font-semibold">Official token</h2>
        <span className="text-xs text-muted">Pinned</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <TokenCard token={{ ...data.token, volume24h: data.volume24h }} />
      </div>
    </section>
  );
}

export function HomeView() {
  const [tab, setTab] = useState<TokenTab>("trending");
  const stats = useStats();
  const activity = useActivity({ limit: 12 });
  const s = stats.data;
  const ethUsd = useEthUsd();

  return (
    <div className="space-y-10">
      <Hero />
      <Ticker />

      {stats.error ? (
        <ErrorBox error={stats.error} />
      ) : (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="24h volume"
            value={
              s ? (
                ethUsd ? (
                  <CountUp value={eth(s.volume24h) * ethUsd} format={formatUsd} />
                ) : (
                  usdText(s.volume24h, undefined)
                )
              ) : (
                "…"
              )
            }
            hint={s && `${s.trades24h} trades`}
          />
          <Stat
            label="Tokens launched"
            value={s ? <CountUp value={s.tokensLaunched} format={fmtInt} /> : "…"}
            hint={s && `+${s.tokensLaunched24h} today · ${s.graduated} graduated`}
          />
          <Stat label="Total buyback" value={s ? <CountUp value={eth(s.totalBuybackEth)} format={fmtEth} /> : "…"} hint="ETH spent buying tokens" />
          <Stat
            label="Total burn"
            value={s ? <CountUp value={s.buybackCount} format={(n) => (Math.round(n) === 0 ? "0" : `${fmtInt(n)}×`)} /> : "…"}
            hint="buyback-and-burns to 0x…dEaD"
          />
        </section>
      )}

      <OfficialTokenSection />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Tabs tabs={TABS} value={tab} onChange={setTab} />
            {tab === "memestock" && (
              <Link href="/memestocks" className="text-sm text-accent hover:underline">
                Filter by quote pair →
              </Link>
            )}
          </div>
          <TokenGrid tab={tab} />
        </section>
        <aside>
          <Card className="lg:sticky lg:top-24">
            <CardTitle
              aside={
                !PRE_LAUNCH && (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-accent">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping-soft absolute inline-flex h-full w-full rounded-full bg-accent" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                    </span>
                    Live
                  </span>
                )
              }
            >
              Latest activity
            </CardTitle>
            <TxFeed items={activity.data} loading={activity.isLoading} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
