"use client";

import { useWallet } from "@/lib/wallet";
import { useState } from "react";
import { erc20Abi, formatUnits, maxUint256, zeroAddress } from "viem";
import { useBalance, useReadContracts, useSimulateContract } from "wagmi";
import { BuybackExecutorAbi } from "@/lib/abis/BuybackExecutorAbi";
import { FeeVaultAbi } from "@/lib/abis/FeeVaultAbi";
import { HolderRewardsAbi } from "@/lib/abis/HolderRewardsAbi";
import { PonsV2CurveAbi } from "@/lib/abis/PonsV2CurveAbi";
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

const BPS = 10_000n;

/** Live state of a token's Pons V2 bonding curve. */
function useCurve(token: Token) {
  const enabled = CONTRACTS_READY && Boolean(token.curve) && token.curve !== zeroAddress;
  const reads = useReadContracts({
    contracts: [
      { address: token.curve, abi: PonsV2CurveAbi, functionName: "quoteReserve" },
      { address: token.curve, abi: PonsV2CurveAbi, functionName: "tokenReserve" },
      { address: token.curve, abi: PonsV2CurveAbi, functionName: "realQuoteReserve" },
      { address: token.curve, abi: PonsV2CurveAbi, functionName: "creatorTaxBps" },
      { address: token.curve, abi: PonsV2CurveAbi, functionName: "graduated" },
    ],
    query: { enabled, refetchInterval: 8_000 },
  });
  const quoteReserve = reads.data?.[0]?.result;
  const tokenReserve = reads.data?.[1]?.result;
  const realQuoteReserve = reads.data?.[2]?.result ?? 0n;
  const taxBps = BigInt(reads.data?.[3]?.result ?? PARAMS.creatorTaxBps);
  const graduated = reads.data?.[4]?.result ?? token.graduated;
  const feeBps = BigInt(PARAMS.curveFeeBps) + taxBps;
  const ready = enabled && quoteReserve !== undefined && tokenReserve !== undefined && tokenReserve > 0n;

  /** Tokens out for `ethIn` (curve fee + creator tax are taken from the ETH first). */
  const quoteBuy = (ethIn: bigint) => {
    if (!ready || ethIn <= 0n) return undefined;
    const net = (ethIn * (BPS - feeBps)) / BPS;
    return (tokenReserve! * net) / (quoteReserve! + net);
  };
  /** ETH out for `tokensIn` (fees are taken from the ETH proceeds). */
  const quoteSell = (tokensIn: bigint) => {
    if (!ready || tokensIn <= 0n) return undefined;
    let gross = (quoteReserve! * tokensIn) / (tokenReserve! + tokensIn);
    if (gross > realQuoteReserve) gross = realQuoteReserve;
    return (gross * (BPS - feeBps)) / BPS;
  };
  return { enabled, ready, graduated, taxBps, quoteBuy, quoteSell };
}

/** Buy and sell on the token's Pons V2 bonding curve. */
export function TradePanel({ token }: { token: Token }) {
  const { address: user } = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(300);
  const tx = useTx();
  const curve = useCurve(token);
  const value = tryParse(amount);

  const ethBal = useBalance({ address: user, query: { enabled: Boolean(user) } });
  const tokenReads = useReadContracts({
    contracts: [
      { address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [user!] },
      { address: token.address, abi: erc20Abi, functionName: "allowance", args: [user!, token.curve] },
    ],
    query: { enabled: curve.enabled && Boolean(user), refetchInterval: 8_000 },
  });
  const tokenBal = tokenReads.data?.[0]?.result ?? 0n;
  const allowance = tokenReads.data?.[1]?.result ?? 0n;

  const out = value ? (side === "buy" ? curve.quoteBuy(value) : curve.quoteSell(value)) : undefined;
  const minOut = out ? withSlippage(out, slippage) : 0n;
  const limit = side === "buy" ? ethBal.data?.value : tokenBal;
  const tooMuch = value !== null && limit !== undefined && value > limit;
  const needsApproval = side === "sell" && value !== null && allowance < value;

  async function submit() {
    if (!value || !user || !out) return;
    const target = token.curve;
    if (side === "buy") {
      const ok = await tx.send((write) =>
        write({ address: target, abi: PonsV2CurveAbi, functionName: "buy", args: [value, minOut, user], value }),
      );
      if (ok) setAmount("");
      return;
    }
    if (needsApproval) {
      const ok = await tx.send((write) =>
        write({ address: token.address, abi: erc20Abi, functionName: "approve", args: [target, value] }),
      );
      if (!ok) return;
    }
    const done = await tx.send((write) =>
      write({ address: target, abi: PonsV2CurveAbi, functionName: "sell", args: [value, minOut, user] }),
    );
    if (done) setAmount("");
  }

  if (curve.graduated) {
    return (
      <Card>
        <CardTitle aside={<span className="text-xs text-muted">Uniswap V4</span>}>Trade</CardTitle>
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs leading-relaxed text-muted">
          This token graduated from the bonding curve and now trades in its Pons V2 pool on Uniswap V4. In-app V4 trading
          is coming soon.
        </p>
      </Card>
    );
  }

  const unit = side === "buy" ? "ETH" : token.symbol;
  return (
    <Card>
      <CardTitle aside={<span className="text-xs text-muted">via Pons V2 curve</span>}>Trade</CardTitle>
      <Tabs
        tabs={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
        ]}
        value={side}
        onChange={(v) => {
          setSide(v);
          setAmount("");
        }}
      />
      <div className="mt-4 space-y-3">
        <AmountInput
          value={amount}
          onChange={setAmount}
          unit={unit}
          onMax={side === "sell" ? () => setAmount(formatUnits(tokenBal, 18)) : undefined}
        />
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Balance:{" "}
            {side === "buy"
              ? ethBal.data
                ? `${formatEth(ethBal.data.value)} ETH`
                : "—"
              : user && curve.enabled
                ? `${formatTokens(tokenBal)} ${token.symbol}`
                : "—"}
          </span>
          <SlippagePicker value={slippage} onChange={setSlippage} />
        </div>
        <div className="rounded-xl bg-bg/50 px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Estimated received</span>
            <span className="tabular font-medium">
              {out ? (side === "buy" ? `${formatTokens(out)} ${token.symbol}` : `${formatEth(out, 5)} ETH`) : "—"}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Minimum received</span>
            <span className="tabular">{out ? (side === "buy" ? formatTokens(minOut) : formatEth(minOut, 5)) : "—"}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted">Fees</span>
            <span className="tabular">
              {PARAMS.curveFeeBps / 100}% curve + {Number(curve.taxBps) / 100}% creator fee
            </span>
          </div>
        </div>
        <Button
          className="w-full py-3"
          disabled={!curve.enabled || !tx.ready || !value || !out || tooMuch || tx.busy}
          onClick={submit}
        >
          {!curve.enabled
            ? "Trading disabled"
            : !tx.ready
              ? "Connect wallet"
              : tx.busy
                ? "Processing…"
                : tooMuch
                  ? "Exceeds balance"
                  : side === "buy"
                    ? `Buy ${token.symbol}`
                    : needsApproval
                      ? `Approve & sell ${token.symbol}`
                      : `Sell ${token.symbol}`}
        </Button>
        <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
      </div>
    </Card>
  );
}

/** Creator fees waiting in Pons + the vault, and the permissionless distribute() call. */
export function VaultPanel({ token }: { token: Token }) {
  const { address: user } = useWallet();
  const tx = useTx();
  const reads = useReadContracts({
    contracts: [
      { address: token.vault, abi: FeeVaultAbi, functionName: "pendingDistribution" },
      { address: token.vault, abi: FeeVaultAbi, functionName: "claimableFromPons" },
    ],
    query: { enabled: CONTRACTS_READY, refetchInterval: 10_000 },
  });
  // distribute() first harvests the curve and claims from the Pons FeeEscrow, so simulate it to see
  // whether anything is ready (fees still inside the curve are not visible from a plain read).
  const sim = useSimulateContract({
    address: token.vault,
    abi: FeeVaultAbi,
    functionName: "distribute",
    account: user,
    query: { enabled: CONTRACTS_READY && Boolean(user), refetchInterval: 15_000 },
  });
  const known = (reads.data?.[0]?.result ?? 0n) + (reads.data?.[1]?.result ?? 0n);
  const incentive = (() => {
    const i = (known * BigInt(PARAMS.callerIncentiveBps)) / 10_000n;
    const cap = 5n * 10n ** 15n;
    return i > cap ? cap : i;
  })();
  const ready = user ? sim.isSuccess : known > 0n;

  return (
    <Card>
      <CardTitle>FeeVault</CardTitle>
      <dl className="tabular space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Ready to distribute</dt>
          <dd className="font-semibold">{CONTRACTS_READY ? `${formatEth(known)} ETH` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Your incentive</dt>
          <dd>{CONTRACTS_READY ? `≥ ${formatEth(incentive, 5)} ETH` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Total fees received</dt>
          <dd>{formatEth(token.feesReceived)} ETH</dd>
        </div>
      </dl>
      <Button
        variant="secondary"
        className="mt-4 w-full"
        disabled={!CONTRACTS_READY || !tx.ready || !ready || tx.busy}
        onClick={() => tx.send((write) => write({ address: token.vault, abi: FeeVaultAbi, functionName: "distribute" }))}
      >
        {tx.busy ? "Processing…" : CONTRACTS_READY && tx.ready && !ready ? "Nothing to distribute yet" : "Run distribute()"}
      </Button>
      <p className="mt-2 text-xs text-muted">
        Anyone can call it. It collects this token&apos;s trading fees from Pons V2 and splits them. The caller earns 0.5%
        (max 0.005 ETH). Pons releases a token&apos;s curve fees once about 0.0035 ETH has built up (roughly 0.09 ETH of
        trading).
      </p>
      <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
    </Card>
  );
}

/** Pending buyback ETH: buyback-and-burn on the curve, or (after graduation) sent to stakers. */
export function BuybackPanel({ token }: { token: Token }) {
  const tx = useTx();
  const [slippage, setSlippage] = useState(300);
  const executor = contracts.buybackExecutor;
  const enabled = CONTRACTS_READY && Boolean(executor);
  const curve = useCurve(token);
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
  // The executor pays the same curve fee + creator tax as any buyer.
  const quote = curve.quoteBuy(amount);
  const minOut = quote ? withSlippage(quote, slippage) : 0n;
  const graduated = curve.graduated;

  return (
    <Card>
      <CardTitle>Buyback & burn</CardTitle>
      <dl className="tabular space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">ETH awaiting buyback</dt>
          <dd className="font-semibold">{enabled ? `${formatEth(pendingEth)} ETH` : "—"}</dd>
        </div>
        {!graduated && (
          <div className="flex justify-between">
            <dt className="text-muted">Cap per execution</dt>
            <dd>{enabled ? `${formatEth(cap)} ETH` : `min(${PARAMS.maxBuybackEth} ETH, 1% of liquidity)`}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted">Burned so far</dt>
          <dd>
            {formatTokens(token.tokensBurned)} {token.symbol}
          </dd>
        </div>
      </dl>
      {graduated ? (
        <>
          <Button
            variant="secondary"
            className="mt-4 w-full"
            disabled={!enabled || !tx.ready || pendingEth === 0n || tx.busy}
            onClick={() =>
              executor &&
              tx.send((write) =>
                write({
                  address: executor,
                  abi: BuybackExecutorAbi,
                  functionName: "redirectToRewards",
                  args: [token.address],
                }),
              )
            }
          >
            {tx.busy ? "Processing…" : enabled && pendingEth === 0n ? "No ETH queued" : "Send to stakers"}
          </Button>
          <p className="mt-2 text-xs text-muted">
            This token graduated to Uniswap V4. Until V4 buybacks are supported, anyone can send its buyback ETH to the
            stakers instead.
          </p>
        </>
      ) : (
        <>
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
          <p className="mt-2 text-xs text-muted">Buys on the bonding curve and sends the tokens to 0x…dEaD.</p>
        </>
      )}
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
