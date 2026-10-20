import type { Metadata } from "next";
import { FeeSplitBar, splitFromConfig } from "@/components/FeeSplitBar";
import { Card, PageTitle } from "@/components/ui";
import { contracts, PARAMS } from "@/lib/config";

export const metadata: Metadata = { title: "Docs" };

const PARAM_ROWS: [string, string, string][] = [
  ["Platform fee", "20% of incoming fees (max 30%)", "Pontoon revenue; the multisig can change it within the cap"],
  ["distribute() caller incentive", "0.5%, max 0.005 ETH", "Covers gas without draining fees"],
  ["Buyback-and-burn", "0–80% of the remainder", "Never 100%, so the creator keeps an incentive"],
  ["Holder rewards", "0–50% of the remainder", "Prevents overpromising rewards"],
  ["Creator payout", "Whatever is left", "Automatic"],
  ["Default", "40% buyback, 20% rewards, 40% creator", "A safe starting point"],
  ["Config change timelock", "24 hours", "Holders can see changes before they apply"],
  ["Buyback cap per execution", "min(0.5 ETH, 1% of pool liquidity)", "Limits price impact and sandwich risk"],
  ["CTO timelock", "3 days + multisig approval", "Follows the Pons V2 flow"],
  ["Treasury withdrawal timelock", "48 hours", "Platform withdrawals are visible in advance"],
];

const RISKS = [
  "The contracts have not been audited yet. Only use what you can afford to lose during testing.",
  "The Pons V2 integration uses placeholder interfaces until the official ABI is available.",
  "Buybacks can suffer slippage or sandwiching. minOut is mandatory and each execution is capped, but the risk does not go away.",
  "Rewards only go to stakers. Unstaked tokens (including those in liquidity pools) earn no ETH.",
  "Tokenized-stock pairs depend on ETH liquidity into NVDA/AAPL/HOOD/USDG and on the rules in your jurisdiction.",
  "An emergency pause only stops new launches and buybacks; claims are never locked.",
];

export default function DocsPage() {
  const addresses = [
    ["PontoonLauncher", contracts.launcher],
    ["TokenRegistry", contracts.registry],
    ["BuybackExecutor", contracts.buybackExecutor],
    ["PlatformTreasury", contracts.treasury],
    ["CTOManager", contracts.ctoManager],
    ["Pons V2 factory (placeholder)", contracts.ponsFactory],
    ["Pons V2 router (placeholder)", contracts.ponsRouter],
    ["Uniswap V4 adapter (placeholder)", contracts.v4Adapter],
  ] as const;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageTitle
        title="How Pontoon works"
        subtitle="Pontoon is a layer on top of Pons V2: tokens launch on Pons, but creator fees are routed to Pontoon contracts that split them according to the creator's settings."
      />

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Fee flow</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Traders buy or sell on Pons V2 (the bonding curve before graduation, Uniswap V4 after).</li>
          <li>Pons V2 sends the creator fee in ETH to that token&apos;s FeeVault, not to the creator&apos;s wallet.</li>
          <li>Anyone can call distribute() and earn a small incentive.</li>
          <li>The FeeVault takes the platform fee and sends it to the PlatformTreasury.</li>
          <li>The rest is split between the creator payout, buyback-and-burn, and holder rewards.</li>
          <li>The BuybackExecutor buys the token on the market and sends it to 0x…dEaD.</li>
          <li>HolderRewards distributes ETH to stakers using a reward-per-share model.</li>
        </ol>
        <div className="mt-6">
          <div className="mb-2 text-xs font-medium tracking-wider text-muted uppercase">Default split of total fees</div>
          <FeeSplitBar parts={splitFromConfig(PARAMS.defaultBuybackBps, PARAMS.defaultRewardBps, PARAMS.defaultPlatformFeeBps)} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Parameters</h2>
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[520px] text-sm">
            <tbody className="divide-y divide-line">
              {PARAM_ROWS.map(([k, v, why]) => (
                <tr key={k}>
                  <td className="py-2 pr-3 font-medium">{k}</td>
                  <td className="py-2 pr-3">{v}</td>
                  <td className="py-2 text-muted">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Quote pairs & buybacks</h2>
        <p className="text-sm text-muted">
          Creators pick ETH, USDG, or a tokenized stock (NVDA, AAPL, HOOD). For ETH pairs, buybacks swap ETH straight into the
          token. For other pairs, ETH is swapped into the quote asset first, then into the token. Before graduation, buybacks go
          through the Pons V2 bonding-curve router; after graduation, through the Uniswap V4 pool.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Permissions</h2>
        <ul className="space-y-2 text-sm text-muted">
          <li>
            <span className="font-medium text-ink">Creator:</span> queues config changes and claims payouts. Cannot withdraw
            buyback or reward funds.
          </li>
          <li>
            <span className="font-medium text-ink">Anyone:</span> calls distribute() and buybacks, stakes, and claims.
          </li>
          <li>
            <span className="font-medium text-ink">Pontoon multisig:</span> changes the platform fee within its cap, approves
            CTOs, and can trigger an emergency pause. Cannot touch funds in a FeeVault or HolderRewards.
          </li>
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Contract addresses</h2>
        <ul className="space-y-1.5 text-sm">
          {addresses.map(([name, a]) => (
            <li key={name} className="flex flex-wrap justify-between gap-2">
              <span className="text-muted">{name}</span>
              <span className="font-mono text-xs break-all">{a ?? "not deployed yet"}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Risks</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          {RISKS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
