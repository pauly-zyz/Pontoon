"use client";

import { useMemo, useState } from "react";
import type { Trade } from "@/lib/types";
import { Empty } from "./ui";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumSignificantDigits: 4 });

/** Price line (ETH per token) from indexed trades, with a hover crosshair. */
export function PriceChart({ trades }: { trades: Trade[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = useMemo(
    () =>
      trades
        .filter((t) => BigInt(t.tokenAmount) > 0n)
        .map((t) => ({ ts: t.timestamp, price: Number(t.ethAmount) / Number(t.tokenAmount), isBuy: t.isBuy }))
        .sort((a, b) => a.ts - b.ts),
    [trades],
  );

  if (points.length < 2) return <Empty>Not enough trades for a chart yet.</Empty>;

  const W = 640;
  const H = 240;
  const pad = 10;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const t0 = points[0]!.ts;
  const t1 = points[points.length - 1]!.ts;
  const x = (ts: number) => pad + ((ts - t0) / Math.max(t1 - t0, 1)) * (W - pad * 2);
  const y = (p: number) => pad + (1 - (p - min) / Math.max(max - min, max * 1e-9)) * (H - pad * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.ts).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${H} L${x(t0).toFixed(1)},${H} Z`;
  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  const change = ((last - first) / first) * 100;
  const up = change >= 0;
  const color = up ? "#2dd4bf" : "#f87171";
  const h = hover !== null ? points[hover]! : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i]!.ts) - px) < Math.abs(x(points[best]!.ts) - px)) best = i;
    setHover(best);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="tabular font-display text-3xl font-semibold">{fmt(h ? h.price : last)} ETH</span>
        {h ? (
          <span className="text-sm text-muted">{new Date(h.ts * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
        ) : (
          <span
            className={`tabular rounded-md px-1.5 py-0.5 text-sm font-semibold ${up ? "bg-accent/15 text-accent" : "bg-red-400/15 text-danger"}`}
          >
            {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
          </span>
        )}
        <span className="text-xs text-muted">per token · {points.length} trades</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-60 w-full cursor-crosshair touch-none"
        preserveAspectRatio="none"
        role="img"
        aria-label="Price chart"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="pc-glow" x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgb(255 255 255 / 0.05)" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#pc-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="5" opacity="0.35" filter="url(#pc-glow)" vectorEffect="non-scaling-stroke" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {h && (
          <>
            <line x1={x(h.ts)} x2={x(h.ts)} y1="0" y2={H} stroke="rgb(255 255 255 / 0.25)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={x(h.ts)} cy={y(h.price)} r="4" fill={h.isBuy ? "#2dd4bf" : "#f87171"} stroke="#070c16" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
    </div>
  );
}
