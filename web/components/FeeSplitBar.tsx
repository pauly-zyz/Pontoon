import { pct } from "@/lib/format";

export type SplitKey = "platform" | "creator" | "buyback" | "rewards" | "incentive";

const META: Record<SplitKey, { label: string; color: string }> = {
  platform: { label: "Platform", color: "var(--color-split-platform)" },
  creator: { label: "Creator", color: "var(--color-split-creator)" },
  buyback: { label: "Buyback & burn", color: "var(--color-split-buyback)" },
  rewards: { label: "Reward holder", color: "var(--color-split-rewards)" },
  incentive: { label: "Insentif pemanggil", color: "var(--color-split-incentive)" },
};

/** Share of the whole fee going to each destination, in bps of the total. */
export function splitFromConfig(buybackBps: number, rewardBps: number, platformBps: number) {
  const rest = 10_000 - platformBps;
  return {
    platform: platformBps,
    buyback: (rest * buybackBps) / 10_000,
    rewards: (rest * rewardBps) / 10_000,
    creator: (rest * (10_000 - buybackBps - rewardBps)) / 10_000,
  };
}

/** Colored bar showing how fees split between platform, creator, buyback and rewards. */
export function FeeSplitBar({
  parts,
  legend = true,
  format,
}: {
  parts: Partial<Record<SplitKey, number>>;
  legend?: boolean;
  /** Formats the raw value shown in the legend (defaults to percent of total). */
  format?: (value: number, key: SplitKey) => string;
}) {
  const entries = (Object.keys(META) as SplitKey[])
    .filter((k) => parts[k] !== undefined)
    .map((k) => [k, Math.max(parts[k] ?? 0, 0)] as const);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {entries.map(([k, v]) =>
          v > 0 ? <div key={k} style={{ width: `${(v / total) * 100}%`, background: META[k].color }} title={META[k].label} /> : null,
        )}
      </div>
      {legend && (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-5 gap-y-1.5 text-xs">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: META[k].color }} />
              <span className="text-muted">{META[k].label}</span>
              <span className="tabular ml-auto font-medium">{format ? format(v, k) : pct((v / total) * 10_000, 1)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
