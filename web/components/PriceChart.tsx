"use client";

import { useMemo } from "react";
import type { Trade } from "@/lib/types";
import { Empty } from "./ui";

/** Simple price line (ETH per token) built from indexed trades. */
export function PriceChart({ trades }: { trades: Trade[] }) {
  const points = useMemo(
    () =>
      trades
        .filter((t) => BigInt(t.tokenAmount) > 0n)
        .map((t) => ({ ts: t.timestamp, price: Number(t.ethAmount) / Number(t.tokenAmount) }))
        .sort((a, b) => a.ts - b.ts),
    [trades],
  );

  if (points.length < 2) return <Empty>Belum cukup trade untuk grafik.</Empty>;

  const W = 600;
  const Hh = 220;
  const pad = 8;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const t0 = points[0]!.ts;
  const t1 = points[points.length - 1]!.ts || t0 + 1;
  const x = (ts: number) => pad + ((ts - t0) / Math.max(t1 - t0, 1)) * (W - pad * 2);
  const y = (p: number) => pad + (1 - (p - min) / Math.max(max - min, max * 1e-9)) * (Hh - pad * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${Hh} L${x(t0).toFixed(1)},${Hh} Z`;
  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  const change = ((last - first) / first) * 100;
  const up = change >= 0;
  const color = up ? "#2dd4bf" : "#f87171";
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumSignificantDigits: 4 });

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="tabular font-display text-2xl font-semibold">{fmt(last)} ETH</span>
        <span className={`tabular text-sm font-medium ${up ? "text-accent" : "text-danger"}`}>
          {up ? "+" : ""}
          {change.toFixed(2)}%
        </span>
        <span className="text-xs text-muted">per token · {points.length} trade</span>
      </div>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="h-56 w-full" preserveAspectRatio="none" role="img" aria-label="Grafik harga">
        <defs>
          <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#pc-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
