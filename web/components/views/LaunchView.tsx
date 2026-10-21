"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { parseEther, parseEventLogs, zeroAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { PontoonLauncherAbi } from "@/lib/abis/PontoonLauncherAbi";
import { contracts, CONTRACTS_READY, LIVE_QUOTE_KEYS, PARAMS, PRE_LAUNCH, QUOTE_PAIRS, SOCIAL } from "@/lib/config";
import { formatEth, safeUrl } from "@/lib/format";
import { clearDraft, loadDraft, saveDraft } from "@/lib/launchDraft";
import { useTx } from "@/lib/tx";
import { FeePreview, FeeSliders, type FeeConfigState } from "../FeeSliders";
import { TokenAvatar } from "../TokenAvatar";
import { TxNotice } from "../TxNotice";
import { Badge, Button, Card, CardTitle, cn, Field, inputClass, PageTitle } from "../ui";

const MAX_META_BYTES = 2_000;
/** Pons V2 launch fee, used for the preview until the launcher is deployed. */
const DEFAULT_LAUNCH_FEE = 500_000_000_000_000n; // 0.0005 ETH

function Step({ n }: { n: number }) {
  return (
    <span className="mr-2.5 inline-grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-teal-300 to-accent align-middle text-xs font-bold text-accent-ink">
      {n}
    </span>
  );
}

const QUOTE_ICON: Record<string, string> = { ETH: "◆", USDG: "$", NVDA: "▲", AAPL: "●", HOOD: "🪶" };

const EMPTY_FORM = {
  name: "",
  symbol: "",
  image: "",
  description: "",
  twitter: "",
  telegram: "",
  website: "",
  initialBuy: "",
};
const DEFAULT_FEE: FeeConfigState = { buybackBps: PARAMS.defaultBuybackBps, rewardBps: PARAMS.defaultRewardBps };
/** 150 bps -> "1.5%". */
const taxPct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

const savedTime = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function LaunchView() {
  const router = useRouter();
  const tx = useTx();
  const [form, setForm] = useState(EMPTY_FORM);
  const [quoteKey, setQuoteKey] = useState("ETH");
  const [memestock, setMemestock] = useState(false);
  const [fee, setFee] = useState<FeeConfigState>(DEFAULT_FEE);
  const [creatorTax, setCreatorTax] = useState<number | null>(null); // null = the launcher default
  // Saved draft: restored after mount (the server never sees localStorage).
  const [draft, setDraft] = useState<{ status: "none" | "restored" | "saved" | "unsaved"; savedAt?: number }>({
    status: "none",
  });

  useEffect(() => {
    const id = setTimeout(() => {
      const d = loadDraft();
      if (!d) return;
      setForm({ ...EMPTY_FORM, ...d.form });
      setQuoteKey(LIVE_QUOTE_KEYS.has(d.quoteKey) ? d.quoteKey : "ETH");
      setMemestock(d.memestock);
      setFee(d.fee);
      setCreatorTax(d.creatorTaxBps ?? null);
      setDraft({ status: "restored", savedAt: d.savedAt });
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function saveLaunch() {
    const savedAt = Date.now();
    const ok = saveDraft({ form, quoteKey, memestock, fee, creatorTaxBps: creatorTax ?? undefined, savedAt });
    setDraft(ok ? { status: "saved", savedAt } : { status: "unsaved" });
  }

  function startOver() {
    clearDraft();
    setForm(EMPTY_FORM);
    setQuoteKey("ETH");
    setMemestock(false);
    setFee(DEFAULT_FEE);
    setCreatorTax(null);
    setDraft({ status: "none" });
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: k === "symbol" ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : e.target.value }));

  const platformFee = useReadContract({
    address: contracts.launcher,
    abi: PontoonLauncherAbi,
    functionName: "platformFeeBps",
    query: { enabled: CONTRACTS_READY },
  });
  const platformBps = platformFee.data ?? PARAMS.defaultPlatformFeeBps;

  const launchFeeRead = useReadContract({
    address: contracts.launcher,
    abi: PontoonLauncherAbi,
    functionName: "launchFee",
    query: { enabled: CONTRACTS_READY },
  });
  const launchFee = launchFeeRead.data ?? DEFAULT_LAUNCH_FEE;

  // Creator tax range from the launcher (the max is the Pons V2 maximum).
  const taxReads = useReadContracts({
    contracts: (["minCreatorTaxBps", "defaultCreatorTaxBps", "maxCreatorTaxBps"] as const).map((functionName) => ({
      address: contracts.launcher,
      abi: PontoonLauncherAbi,
      functionName,
    })),
    query: { enabled: CONTRACTS_READY },
  });
  const minTax = Number(taxReads.data?.[0]?.result ?? PARAMS.minCreatorTaxBps);
  const defaultTax = Number(taxReads.data?.[1]?.result ?? PARAMS.defaultCreatorTaxBps);
  const maxTax = Number(taxReads.data?.[2]?.result ?? PARAMS.maxCreatorTaxBps);
  const taxBps = creatorTax ?? defaultTax;
  const isAllowed = (key: string) => LIVE_QUOTE_KEYS.has(key);

  // Stored on-chain by Pons V2 and in the Pontoon TokenMetadata event.
  const meta = useMemo(
    () => ({
      name: form.name.trim(),
      symbol: form.symbol,
      logo: safeUrl(form.image.trim()) ?? "",
      description: form.description.trim(),
      twitter: safeUrl(form.twitter.trim()) ?? "",
      telegram: safeUrl(form.telegram.trim()) ?? "",
      website: safeUrl(form.website.trim()) ?? "",
    }),
    [form],
  );
  const metaBytes = new TextEncoder().encode(Object.values(meta).join("")).length;

  const errors: string[] = [];
  if (!form.name.trim()) errors.push("Name is required.");
  if (form.name.length > 32) errors.push("Name can be at most 32 characters.");
  if (!form.symbol) errors.push("Ticker is required.");
  if (form.symbol.length > 10) errors.push("Ticker can be at most 10 characters.");
  if (form.description.length > 280) errors.push("Description can be at most 280 characters.");
  for (const k of ["image", "twitter", "telegram", "website"] as const)
    if (form[k].trim() && !safeUrl(form[k].trim())) errors.push(`Invalid ${k} URL.`);
  if (metaBytes > MAX_META_BYTES) errors.push("Metadata is too long.");
  let initialBuy = 0n;
  try {
    initialBuy = form.initialBuy.trim() ? parseEther(form.initialBuy.trim()) : 0n;
  } catch {
    errors.push("Invalid initial buy amount.");
  }
  if (taxBps < minTax || taxBps > maxTax) errors.push(`Creator tax must be between ${taxPct(minTax)} and ${taxPct(maxTax)}.`);
  if (!isAllowed(quoteKey)) errors.push(`Quote pair ${quoteKey} is not open yet.`);
  const value = launchFee + initialBuy;

  const quote = QUOTE_PAIRS.find((q) => q.key === quoteKey)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (errors.length) return;
    if (!CONTRACTS_READY || !contracts.launcher) {
      saveLaunch();
      return;
    }
    const launcher = contracts.launcher;
    const receipt = await tx.send((write) =>
      write({
      address: launcher,
      abi: PontoonLauncherAbi,
      functionName: "launch",
      args: [meta, quote.address ?? zeroAddress, memestock, fee, taxBps],
      value,
      }),
    );
    if (!receipt) return;
    clearDraft();
    const [launched] = parseEventLogs({ abi: PontoonLauncherAbi, eventName: "TokenLaunched", logs: receipt.logs });
    if (launched) router.push(`/token/${launched.args.token}`);
  }

  return (
    <div>
      <PageTitle
        title="Launch token"
        subtitle={
          CONTRACTS_READY
            ? "Your token is created on Pons V2 with a Pontoon FeeVault as the creator-fee recipient. You can change the fee split later, behind a 24h timelock."
            : "Prepare your token now. Launches open soon: save your launch and it will be ready to deploy on launch day."
        }
      />
      {draft.status === "restored" && (
        <div className="animate-fade-up mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
          <span>
            Welcome back. We restored the launch you saved{draft.savedAt ? ` on ${savedTime(draft.savedAt)}` : ""}.
          </span>
          <button type="button" onClick={startOver} className="text-xs font-medium text-muted underline underline-offset-2 hover:text-ink">
            Start over
          </button>
        </div>
      )}
      <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardTitle>
              <Step n={1} />
              Identity
            </CardTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input className={inputClass} value={form.name} onChange={set("name")} placeholder="Pontoon Dog" maxLength={32} />
              </Field>
              <Field label="Ticker">
                <input className={cn(inputClass, "font-mono")} value={form.symbol} onChange={set("symbol")} placeholder="PDOG" maxLength={10} />
              </Field>
              <Field label="Image URL" hint="https://… (PNG/JPG/GIF). Image upload is coming soon.">
                <input className={inputClass} value={form.image} onChange={set("image")} placeholder="https://…" />
              </Field>
              <Field label="Description" hint={`${form.description.length}/280`}>
                <textarea className={cn(inputClass, "min-h-[42px]")} rows={2} value={form.description} onChange={set("description")} maxLength={280} />
              </Field>
              <Field label="X / Twitter">
                <input className={inputClass} value={form.twitter} onChange={set("twitter")} placeholder="https://x.com/…" />
              </Field>
              <Field label="Telegram">
                <input className={inputClass} value={form.telegram} onChange={set("telegram")} placeholder="https://t.me/…" />
              </Field>
              <Field label="Website">
                <input className={inputClass} value={form.website} onChange={set("website")} placeholder="https://…" />
              </Field>
            </div>
          </Card>

          <Card>
            <CardTitle>
              <Step n={2} />
              Quote pair
            </CardTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {QUOTE_PAIRS.map((q) => {
                const enabled = isAllowed(q.key);
                return (
                  <button
                    key={q.key}
                    type="button"
                    disabled={!enabled}
                    onClick={() => {
                      setQuoteKey(q.key);
                      if (q.kind === "stock") setMemestock(true);
                    }}
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      quoteKey === q.key
                        ? "border-accent bg-accent/10 shadow-[0_0_24px_-8px_rgb(45_212_191/0.7)]"
                        : "border-line bg-bg/40 hover:-translate-y-0.5 hover:border-accent/40",
                    )}
                  >
                    <div className="flex items-center gap-1.5 font-mono font-semibold">
                      <span className="text-accent">{QUOTE_ICON[q.key]}</span>
                      {q.label}
                    </div>
                    <div className="text-[11px] text-muted">
                      {!enabled ? "Coming soon" : q.kind === "native" ? "Native" : q.kind === "stable" ? "Stablecoin" : "Tokenized stock"}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">
              Launches are paired with ETH for now. USDG and tokenized-stock pairs are coming soon.
            </p>
            <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-bg/40 px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Memestock tag</span>
                <span className="text-xs text-muted">Stock- or company-themed tokens appear on the Memestocks page.</span>
              </span>
              <input type="checkbox" className="h-5 w-5 accent-teal-400" checked={memestock} onChange={(e) => setMemestock(e.target.checked)} />
            </label>
          </Card>

          <Card>
            <CardTitle>
              <Step n={3} />
              Creator tax
            </CardTitle>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">Tax on every curve trade</span>
                <span className="tabular font-semibold text-accent">{taxPct(taxBps)}</span>
              </span>
              <input
                type="range"
                min={minTax}
                max={maxTax}
                step={10}
                value={taxBps}
                onChange={(e) => setCreatorTax(Number(e.target.value))}
                className="w-full accent-teal-400"
              />
              <span className="flex justify-between text-xs text-muted">
                <span>{taxPct(minTax)}</span>
                <span>{taxPct(maxTax)}</span>
              </span>
            </label>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Paid by traders on top of the 1% curve fee and sent to your token&apos;s FeeVault, where it is split below.
              A higher tax earns more per trade but can discourage trading. It is fixed once the token is launched.
            </p>
          </Card>

          <Card>
            <CardTitle>
              <Step n={4} />
              Fee split
            </CardTitle>
            <FeeSliders value={fee} onChange={setFee} />
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardTitle>Preview</CardTitle>
            <div className="mb-5 flex items-center gap-3">
              <TokenAvatar symbol={form.symbol || "?"} address="0x5a5a5a" image={safeUrl(form.image) ?? undefined} size={52} />
              <div className="min-w-0">
                <div className="truncate font-display text-lg font-semibold">{form.name || "Token name"}</div>
                <div className="flex flex-wrap gap-1.5 text-xs text-muted">
                  <span className="font-mono">${form.symbol || "TICKER"}</span>
                  <Badge tone={quote.kind === "stock" ? "violet" : "default"}>/{quote.label}</Badge>
                  {memestock && <Badge tone="amber">Memestock</Badge>}
                  <Badge tone="default">{taxPct(taxBps)} tax</Badge>
                </div>
              </div>
            </div>
            <FeePreview config={fee} platformBps={platformBps} />
          </Card>

          <Card>
            <Field
              label="Initial buy (optional)"
              hint="Bought for you in the launch transaction, before anyone else can buy, with no snipe tax."
            >
              <div className="relative">
                <input className={cn(inputClass, "pr-14")} inputMode="decimal" value={form.initialBuy} onChange={set("initialBuy")} placeholder="0.0" />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">ETH</span>
              </div>
            </Field>
            <dl className="tabular mt-4 space-y-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">Pons V2 launch fee</dt>
                <dd>{formatEth(launchFee, 4)} ETH</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Initial buy</dt>
                <dd>{formatEth(initialBuy, 4)} ETH</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-1 text-sm font-semibold">
                <dt>Total</dt>
                <dd>{formatEth(value, 4)} ETH</dd>
              </div>
            </dl>
            {errors.length > 0 && (form.name || form.symbol) && (
              <ul className="mt-4 space-y-1 text-xs text-danger">
                {errors.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}
            {CONTRACTS_READY ? (
              <>
                <Button type="submit" className="mt-5 w-full py-3" disabled={!tx.ready || errors.length > 0 || tx.busy}>
                  {!tx.ready ? "Connect your wallet first" : tx.busy ? "Processing…" : "Deploy token"}
                </Button>
                <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
              </>
            ) : (
              <>
                <Button type="submit" className="mt-5 w-full py-3" disabled={errors.length > 0}>
                  💾 {draft.status === "saved" || draft.status === "restored" ? "Update my launch" : "Save my launch"}
                </Button>
                {draft.status === "saved" && (
                  <p className="animate-fade-up mt-3 text-xs text-accent" role="status">
                    ✓ Saved in this browser{draft.savedAt ? ` on ${savedTime(draft.savedAt)}` : ""}. It will be ready to deploy on
                    launch day.
                  </p>
                )}
                {draft.status === "unsaved" && (
                  <p className="mt-3 text-xs text-danger" role="status">
                    Could not save here (private browsing or storage is blocked).
                  </p>
                )}
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  {PRE_LAUNCH ? "Launches open soon." : "Launches are not open yet."} Your draft stays in this browser only and
                  nothing is sent on-chain.{" "}
                  <a href={SOCIAL.x.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    Follow {SOCIAL.x.handle}
                  </a>{" "}
                  for the launch date.
                </p>
              </>
            )}
          </Card>
        </div>
      </form>
    </div>
  );
}
