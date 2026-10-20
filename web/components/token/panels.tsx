"use client";

import { useWallet } from "@/lib/wallet";
import { useState } from "react";
import { erc20Abi, formatUnits, maxUint256, type Address } from "viem";
import { useBalance, useReadContract, useReadContracts } from "wagmi";
import { BuybackExecutorAbi } from "@/lib/abis/BuybackExecutorAbi";
import { FeeVaultAbi } from "@/lib/abis/FeeVaultAbi";
import { HolderRewardsAbi } from "@/lib/abis/HolderRewardsAbi";
import { SwapRouteAbi } from "@/lib/abis/SwapRouteAbi";
import { tryParse, withSlippage } from "@/lib/amount";
import { contracts, CONTRACTS_READY, PARAMS } from "@/lib/config";
import { formatEth, formatTokens } from "@/lib/format";
import { useTx } from "@/lib/tx";
import type { Token } from "@/lib/types";
import { TxNotice } from "../TxNotice";
import { Button, Card, CardTitle, cn, inputClass, Tabs } from "../ui";

const SLIPPAGES = [100, 300, 500];

function AmountInput({ value, onChange, unit, onMax }: { value: string; onChange: (v: string) => void; unit: string; onMax?: () => void }) {
  return (
    <div className="relative">
      <input
        className={cn(inputClass, "pr-24 text-base")}
        inputMode="decimal"
        placeholder="0.0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(",", "."))}
      />
      <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2 text-xs text-muted">
        {onMax && (
          <button type="button" onClick={onMax} className="font-semibold text-accent hover:underline">
            MAX
          </button>
        )}
        <span className="font-mono">{unit}</span>
      </div>
    </div>
  );
}

function SlippagePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      Slippage
      {SLIPPAGES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn("rounded-md px-1.5 py-0.5", value === s ? "bg-surface-2 text-ink" : "hover:text-ink")}
        >
          {s / 100}%
        </button>
      ))}
    </div>
  );
}

const routeFor = (t: Token): Address | undefined => (t.graduated ? contracts.v4Adapter : contracts.ponsRouter);

/** Buy through the Pons V2 curve router, or the Uniswap V4 adapter after graduation. */
export function TradePanel({ token }: { token: Token }) {
  const { address: user } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(300);
  const tx = useTx();
  const router = routeFor(token);
  const ethIn = tryParse(amount);
  const enabled = CONTRACTS_READY && Boolean(router);

  const quote = useReadContract({
    address: router,
    abi: SwapRouteAbi,
    functionName: "quoteExactETHForTokens",
    args: [token.address, token.quoteAsset, ethIn ?? 0n],
    query: { enabled: enabled && Boolean(ethIn) },
  });
  const ethBal = useBalance({ address: user, query: { enabled: Boolean(user) } });
  const minOut = quote.data ? withSlippage(quote.data, slippage) : 0n;

  const buy = () =>
    router &&
    ethIn &&
    user &&
    tx.send((write) =>
      write({
        address: router,
        abi: SwapRouteAbi,
        functionName: "swapExactETHForTokens",
        args: [token.address, token.quoteAsset, minOut, user],
        value: ethIn,
      }),
    );

  return (
    <Card>
      <CardTitle aside={<span className="text-xs text-muted">{token.graduated ? "via Uniswap V4" : "via Pons V2 curve"}</span>}>
        Trade
      </CardTitle>
      <Tabs
        tabs={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
        ]}
        value={side}
        onChange={setSide}
      />
      {side === "sell" ? (
        <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
          Selling is waiting on the real Pons V2 router ABI (the placeholder interface only supports buys).
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <AmountInput value={amount} onChange={setAmount} unit="ETH" />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Balance: {ethBal.data ? `${formatEth(ethBal.data.value)} ETH` : "—"}</span>
            <SlippagePicker value={slippage} onChange={setSlippage} />
          </div>
          <div className="rounded-xl bg-bg/50 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Estimated received</span>
              <span className="tabular font-medium">{quote.data ? `${formatTokens(quote.data)} ${token.symbol}` : "—"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Minimum received</span>
              <span className="tabular">{quote.data ? formatTokens(minOut) : "—"}</span>
            </div>
          </div>
          <Button className="w-full py-3" disabled={!enabled || !tx.ready || !ethIn || !quote.data || tx.busy} onClick={buy}>
            {!enabled ? "Trading disabled" : !tx.ready ? "Connect wallet" : tx.busy ? "Processing…" : `Buy ${token.symbol}`}
          </Button>
          <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
        </div>
      )}
    </Card>
  );
}

/** Pending fee in the vault and the permissionless distribute() call. */
export function VaultPanel({ token }: { token: Token }) {
  const tx = useTx();
  const pending = useReadContract({
    address: token.vault,
    abi: FeeVaultAbi,
    functionName: "pendingDistribution",
    query: { enabled: CONTRACTS_READY, refetchInterval: 10_000 },
  });
  const amount = pending.data ?? 0n;
  const incentive = (() => {
    const i = (amount * BigInt(PARAMS.callerIncentiveBps)) / 10_000n;
    const cap = 5n * 10n ** 15n;
    return i > cap ? cap : i;
  })();

  return (
    <Card>
      <CardTitle>FeeVault</CardTitle>
      <dl className="tabular space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Awaiting distribution</dt>
          <dd className="font-semibold">{CONTRACTS_READY ? `${formatEth(amount)} ETH` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Your incentive</dt>
          <dd>{CONTRACTS_READY ? `${formatEth(incentive, 5)} ETH` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Total fees received</dt>
          <dd>{formatEth(token.feesReceived)} ETH</dd>
        </div>
      </dl>
      <Button
        variant="secondary"
        className="mt-4 w-full"
        disabled={!CONTRACTS_READY || !tx.ready || amount === 0n || tx.busy}
        onClick={() => tx.send((write) => write({ address: token.vault, abi: FeeVaultAbi, functionName: "distribute" }))}
      >
        {tx.busy ? "Processing…" : "Run distribute()"}
      </Button>
      <p className="mt-2 text-xs text-muted">Anyone can call it. The caller earns 0.5% (max 0.005 ETH).</p>
      <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
    </Card>
  );
}

/** Pending buyback ETH and a permissionless buybackAndBurn with a quoted minOut. */
export function BuybackPanel({ token }: { token: Token }) {
  const tx = useTx();
  const [slippage, setSlippage] = useState(300);
  const executor = contracts.buybackExecutor;
  const enabled = CONTRACTS_READY && Boolean(executor);
  const reads = useReadContracts({
    contracts: [
      { address: executor, abi: BuybackExecutorAbi, functionName: "pendingETH", args: [token.address] },
      { address: executor, abi: BuybackExecutorAbi, functionName: "maxBuyback", args: [token.address] },
      { address: executor, abi: BuybackExecutorAbi, functionName: "paused" },
    ],
    query: { enabled, refetchInterval: 10_000 },
  });
  const pendingEth = reads.data?.[0]?.result ?? 0n;
  const cap = reads.data?.[1]?.result ?? 0n;
  const paused = reads.data?.[2]?.result ?? false;
  const amount = pendingEth < cap ? pendingEth : cap;

  const router = routeFor(token);
  const quote = useReadContract({
    address: router,
    abi: SwapRouteAbi,
    functionName: "quoteExactETHForTokens",
    args: [token.address, token.quoteAsset, amount],
    query: { enabled: enabled && Boolean(router) && amount > 0n },
  });
  const minOut = quote.data ? withSlippage(quote.data, slippage) : 0n;

  return (
    <Card>
      <CardTitle>Buyback & burn</CardTitle>
      <dl className="tabular space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">ETH awaiting buyback</dt>
          <dd className="font-semibold">{enabled ? `${formatEth(pendingEth)} ETH` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Cap per execution</dt>
          <dd>{enabled ? `${formatEth(cap)} ETH` : `min(${PARAMS.maxBuybackEth} ETH, 1% of liquidity)`}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Burned so far</dt>
          <dd>
            {formatTokens(token.tokensBurned)} {token.symbol}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex justify-end">
        <SlippagePicker value={slippage} onChange={setSlippage} />
      </div>
      <Button
        variant="secondary"
        className="mt-2 w-full"
        disabled={!enabled || !tx.ready || paused || amount === 0n || minOut === 0n || tx.busy}
        onClick={() =>
          executor &&
          tx.send((write) =>
            write({
              address: executor,
              abi: BuybackExecutorAbi,
              functionName: "buybackAndBurn",
              args: [token.address, amount, minOut],
            }),
          )
        }
      >
        {paused
          ? "Buybacks paused"
          : tx.busy
            ? "Processing…"
            : enabled && pendingEth === 0n
              ? "No ETH queued for buyback"
              : enabled && cap === 0n
                ? "Not enough pool liquidity"
                : `Buyback ${formatEth(amount)} ETH`}
      </Button>
      <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
    </Card>
  );
}

/** Stake the token in HolderRewards to earn ETH. */
export function StakingPanel({ token }: { token: Token }) {
  const { address: user } = useWallet();
  const tx = useTx();
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");
  const enabled = CONTRACTS_READY && Boolean(user);
  const reads = useReadContracts({
    contracts: [
      { address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [user!] },
      { address: token.address, abi: erc20Abi, functionName: "allowance", args: [user!, token.holderRewards] },
      { address: token.holderRewards, abi: HolderRewardsAbi, functionName: "stakedOf", args: [user!] },
      { address: token.holderRewards, abi: HolderRewardsAbi, functionName: "pendingReward", args: [user!] },
    ],
    query: { enabled, refetchInterval: 10_000 },
  });
  const balance = reads.data?.[0]?.result ?? 0n;
  const allowance = reads.data?.[1]?.result ?? 0n;
  const staked = reads.data?.[2]?.result ?? 0n;
  const reward = reads.data?.[3]?.result ?? 0n;
  const value = tryParse(amount);
  const limit = mode === "stake" ? balance : staked;
  const needsApproval = mode === "stake" && value !== null && allowance < value;
  const tooMuch = value !== null && value > limit;

  async function submit() {
    if (!value) return;
    const target = token.holderRewards;
    if (needsApproval) {
      const ok = await tx.send((write) =>
        write({ address: token.address, abi: erc20Abi, functionName: "approve", args: [target, maxUint256] }),
      );
      if (!ok) return;
    }
    const done = await tx.send((write) =>
      write({ address: target, abi: HolderRewardsAbi, functionName: mode === "stake" ? "stake" : "unstake", args: [value] }),
    );
    if (done) setAmount("");
  }

  return (
    <Card>
      <CardTitle aside={<span className="text-xs text-muted">{token.stakerCount} stakers</span>}>Staking rewards</CardTitle>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-bg/50 p-3">
          <div className="text-xs text-muted">Staked</div>
          <div className="tabular font-semibold">{enabled ? formatTokens(staked) : "—"}</div>
        </div>
        <div className="rounded-xl bg-bg/50 p-3">
          <div className="text-xs text-muted">Claimable rewards</div>
          <div className="tabular font-semibold text-accent">{enabled ? `${formatEth(reward, 5)} ETH` : "—"}</div>
        </div>
      </div>
      <Tabs
        tabs={[
          { value: "stake", label: "Stake" },
          { value: "unstake", label: "Unstake" },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setAmount("");
        }}
      />
      <div className="mt-3 space-y-3">
        <AmountInput value={amount} onChange={setAmount} unit={token.symbol} onMax={() => setAmount(formatUnits(limit, 18))} />
        <div className="text-xs text-muted">
          {mode === "stake" ? "Balance" : "Staked"}: {enabled ? formatTokens(limit) : "—"}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!enabled || !tx.ready || !value || tooMuch || tx.busy} onClick={submit}>
            {tooMuch ? "Exceeds balance" : needsApproval ? "Approve & stake" : mode === "stake" ? "Stake" : "Unstake"}
          </Button>
          <Button
            variant="secondary"
            disabled={!enabled || !tx.ready || reward === 0n || tx.busy}
            onClick={() =>
              tx.send((write) => write({ address: token.holderRewards, abi: HolderRewardsAbi, functionName: "claim" }))
            }
          >
            Claim ETH
          </Button>
        </div>
        <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
      </div>
    </Card>
  );
}
