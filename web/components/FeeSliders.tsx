"use client";

import { PARAMS } from "@/lib/config";
import { formatEth, pct } from "@/lib/format";
import { FeeSplitBar, splitFromConfig } from "./FeeSplitBar";

export type FeeConfigState = { buybackBps: number; rewardBps: number };

/** Sliders for buyback / reward (creator gets the rest), clamped to the contract's bounds. */
export function FeeSliders({ value, onChange }: { value: FeeConfigState; onChange: (v: FeeConfigState) => void }) {
  const creatorBps = 10_000 - value.buybackBps - value.rewardBps;
  const setBuyback = (b: number) => onChange({ buybackBps: b, rewardBps: Math.min(value.rewardBps, 10_000 - b) });
  const setReward = (r: number) => onChange({ rewardBps: r, buybackBps: Math.min(value.buybackBps, 10_000 - r) });

  return (
    <div className="space-y-5">
      <Slider
        label="Buyback & burn"
        color="var(--color-split-buyback)"
        value={value.buybackBps}
        max={PARAMS.maxBuybackBps}
        onChange={setBuyback}
        hint="Max 80%, so the creator keeps an incentive."
      />
      <Slider
        label="Holder rewards (staking)"
        color="var(--color-split-rewards)"
        value={value.rewardBps}
        max={PARAMS.maxRewardBps}
        onChange={setReward}
        hint="Max 50%, to prevent overpromising rewards."
      />
      <div className="flex items-center justify-between rounded-xl border border-line bg-bg/40 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-split-creator)" }} />
          Creator payout (remainder)
        </span>
        <span className="tabular font-semibold">{pct(creatorBps)}</span>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  max,
  onChange,
  hint,
  color,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  hint: string;
  color: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
        <span className="tabular font-semibold">{pct(value)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: color }}
      />
      <span className="text-xs text-muted">{hint}</span>
    </label>
  );
}

/** "For every 1 ETH of fees" preview, including the caller incentive and platform fee. */
export function FeePreview({ config, platformBps }: { config: FeeConfigState; platformBps: number }) {
  const one = 10n ** 18n;
  const incentive = (one * BigInt(PARAMS.callerIncentiveBps)) / 10_000n;
  const capped = incentive > 5n * 10n ** 15n ? 5n * 10n ** 15n : incentive;
  const rest = one - capped;
  const platform = (rest * BigInt(platformBps)) / 10_000n;
  const remainder = rest - platform;
  const buyback = (remainder * BigInt(config.buybackBps)) / 10_000n;
  const rewards = (remainder * BigInt(config.rewardBps)) / 10_000n;
  const creator = remainder - buyback - rewards;
  const rows: [string, bigint, string][] = [
    ["distribute() caller incentive", capped, "var(--color-split-incentive)"],
    [`Platform (${pct(platformBps)})`, platform, "var(--color-split-platform)"],
    ["Buyback & burn", buyback, "var(--color-split-buyback)"],
    ["Holder rewards", rewards, "var(--color-split-rewards)"],
    ["Creator payout", creator, "var(--color-split-creator)"],
  ];

  return (
    <div className="space-y-4">
      <FeeSplitBar parts={splitFromConfig(config.buybackBps, config.rewardBps, platformBps)} />
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Out of every 1 ETH in fees</div>
        <ul className="tabular space-y-1 text-sm">
          {rows.map(([label, v, color]) => (
            <li key={label} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
              <span className="text-muted">{label}</span>
              <span className="ml-auto font-medium">{formatEth(v, 4)} ETH</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
