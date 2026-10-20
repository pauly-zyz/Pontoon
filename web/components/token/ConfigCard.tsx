"use client";

import { useReadContract } from "wagmi";
import { PontoonLauncherAbi } from "@/lib/abis/PontoonLauncherAbi";
import { useNow } from "@/lib/api";
import { contracts, CONTRACTS_READY, PARAMS } from "@/lib/config";
import { countdown, pct } from "@/lib/format";
import type { TokenDetail } from "@/lib/types";
import { FeeSplitBar, splitFromConfig } from "../FeeSplitBar";
import { Badge, Card, CardTitle } from "../ui";

export function usePlatformFeeBps() {
  const r = useReadContract({
    address: contracts.launcher,
    abi: PontoonLauncherAbi,
    functionName: "platformFeeBps",
    query: { enabled: CONTRACTS_READY },
  });
  return r.data ?? PARAMS.defaultPlatformFeeBps;
}

/** Active fee split, the queued one (with its 24h countdown) and recent changes. */
export function ConfigCard({ config }: { config: TokenDetail["config"] }) {
  const now = useNow();
  const platformBps = usePlatformFeeBps();
  const { active, pending } = config;
  const left = pending && now ? countdown(pending.eta, now) : null;

  return (
    <Card>
      <CardTitle aside={<span className="text-xs text-muted">platform {pct(platformBps)}</span>}>Pembagian fee</CardTitle>
      <FeeSplitBar parts={splitFromConfig(active.buybackBps, active.rewardBps, platformBps)} />
      {pending && (
        <div className="mt-5 rounded-xl border border-violet-400/30 bg-violet-400/5 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">Konfigurasi mengantre</span>
            <Badge tone="violet">{left ? `berlaku dalam ${left}` : "siap diterapkan"}</Badge>
          </div>
          <FeeSplitBar parts={splitFromConfig(pending.buybackBps, pending.rewardBps, platformBps)} legend={false} />
          <p className="mt-2 text-xs text-muted">
            Buyback {pct(active.buybackBps)} → {pct(pending.buybackBps)} · reward {pct(active.rewardBps)} →{" "}
            {pct(pending.rewardBps)} · creator {pct(active.creatorBps)} → {pct(pending.creatorBps)}
          </p>
        </div>
      )}
      {config.history.length > 0 && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer text-muted hover:text-ink">Riwayat perubahan</summary>
          <ul className="mt-2 space-y-1">
            {config.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-2">
                <span className="capitalize">{{ queued: "diantrekan", applied: "diterapkan", cancelled: "dibatalkan" }[h.kind]}</span>
                <span className="tabular text-muted">
                  {h.buybackBps !== null ? `buyback ${pct(h.buybackBps)} · reward ${pct(h.rewardBps ?? 0)}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
