"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { parseEther, parseEventLogs, zeroAddress } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { PontoonLauncherAbi } from "@/lib/abis/PontoonLauncherAbi";
import { contracts, CONTRACTS_READY, PARAMS, QUOTE_PAIRS } from "@/lib/config";
import { encodeMetadata, safeUrl } from "@/lib/format";
import { useTx } from "@/lib/tx";
import { FeePreview, FeeSliders, type FeeConfigState } from "../FeeSliders";
import { TokenAvatar } from "../TokenAvatar";
import { TxNotice } from "../TxNotice";
import { Badge, Button, Card, CardTitle, cn, Field, inputClass, PageTitle } from "../ui";

const MAX_META_BYTES = 2_000;

function Step({ n }: { n: number }) {
  return (
    <span className="mr-2.5 inline-grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-teal-300 to-accent align-middle text-xs font-bold text-accent-ink">
      {n}
    </span>
  );
}

const QUOTE_ICON: Record<string, string> = { ETH: "◆", USDG: "$", NVDA: "▲", AAPL: "●", HOOD: "🪶" };

export function LaunchView() {
  const router = useRouter();
  const tx = useTx();
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    image: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
    initialBuy: "",
  });
  const [quoteKey, setQuoteKey] = useState("ETH");
  const [memestock, setMemestock] = useState(false);
  const [fee, setFee] = useState<FeeConfigState>({
    buybackBps: PARAMS.defaultBuybackBps,
    rewardBps: PARAMS.defaultRewardBps,
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: k === "symbol" ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : e.target.value }));

  const platformFee = useReadContract({
    address: contracts.launcher,
    abi: PontoonLauncherAbi,
    functionName: "platformFeeBps",
    query: { enabled: CONTRACTS_READY },
  });
  const platformBps = platformFee.data ?? PARAMS.defaultPlatformFeeBps;

  const configured = QUOTE_PAIRS.filter((q) => q.address);
  const allowed = useReadContracts({
    contracts: configured.map((q) => ({
      address: contracts.launcher,
      abi: PontoonLauncherAbi,
      functionName: "quotePairAllowed" as const,
      args: [q.address!] as const,
    })),
    query: { enabled: CONTRACTS_READY },
  });
  const isAllowed = (key: string) => {
    if (!CONTRACTS_READY) return true; // preview mode
    const i = configured.findIndex((q) => q.key === key);
    return i >= 0 && allowed.data?.[i]?.result === true;
  };

  const metadataURI = useMemo(
    () =>
      encodeMetadata({
        description: form.description.trim() || undefined,
        image: safeUrl(form.image.trim()) ?? undefined,
        twitter: safeUrl(form.twitter.trim()) ?? undefined,
        telegram: safeUrl(form.telegram.trim()) ?? undefined,
        website: safeUrl(form.website.trim()) ?? undefined,
      }),
    [form],
  );

  const errors: string[] = [];
  if (!form.name.trim()) errors.push("Name is required.");
  if (form.name.length > 32) errors.push("Name can be at most 32 characters.");
  if (!form.symbol) errors.push("Ticker is required.");
  if (form.symbol.length > 10) errors.push("Ticker can be at most 10 characters.");
  if (form.description.length > 280) errors.push("Description can be at most 280 characters.");
  for (const k of ["image", "twitter", "telegram", "website"] as const)
    if (form[k].trim() && !safeUrl(form[k].trim())) errors.push(`Invalid ${k} URL.`);
  if (metadataURI.length > MAX_META_BYTES) errors.push("Metadata is too long.");
  let value = 0n;
  try {
    value = form.initialBuy.trim() ? parseEther(form.initialBuy.trim()) : 0n;
  } catch {
    errors.push("Invalid initial buy amount.");
  }
  if (!isAllowed(quoteKey)) errors.push(`Quote pair ${quoteKey} is not open yet.`);

  const quote = QUOTE_PAIRS.find((q) => q.key === quoteKey)!;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (errors.length || !contracts.launcher) return;
    const launcher = contracts.launcher;
    const receipt = await tx.send((write) =>
      write({
      address: launcher,
      abi: PontoonLauncherAbi,
      functionName: "launch",
      args: [
        { name: form.name.trim(), symbol: form.symbol, metadataURI },
        quote.address ?? zeroAddress,
        memestock,
        fee,
      ],
      value,
      }),
    );
    if (!receipt) return;
    const [launched] = parseEventLogs({ abi: PontoonLauncherAbi, eventName: "TokenLaunched", logs: receipt.logs });
    if (launched) router.push(`/token/${launched.args.token}`);
  }

  return (
    <div>
      <PageTitle
        title="Launch token"
        subtitle="Your token is created on Pons V2 with a Pontoon FeeVault as the creator-fee recipient. You can change the fee split later, behind a 24h timelock."
      />
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
                const enabled = isAllowed(q.key) && (q.key === "ETH" || Boolean(q.address) || !CONTRACTS_READY);
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
                      {q.kind === "native" ? "Native" : q.kind === "stable" ? "Stablecoin" : "Tokenized stock"}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted">
              For pairs other than ETH, buybacks swap ETH into the quote asset first, then into the token.
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
                </div>
              </div>
            </div>
            <FeePreview config={fee} platformBps={platformBps} />
          </Card>

          <Card>
            <Field label="Initial buy (optional)" hint="ETH spent on your token for you at launch.">
              <div className="relative">
                <input className={cn(inputClass, "pr-14")} inputMode="decimal" value={form.initialBuy} onChange={set("initialBuy")} placeholder="0.0" />
                <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">ETH</span>
              </div>
            </Field>
            {errors.length > 0 && (form.name || form.symbol) && (
              <ul className="mt-4 space-y-1 text-xs text-danger">
                {errors.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}
            <Button type="submit" className="mt-5 w-full py-3" disabled={!CONTRACTS_READY || !tx.ready || errors.length > 0 || tx.busy}>
              {!CONTRACTS_READY ? "Deploy (disabled in demo mode)" : !tx.ready ? "Connect your wallet first" : tx.busy ? "Processing…" : "Deploy token"}
            </Button>
            <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
          </Card>
        </div>
      </form>
    </div>
  );
}
