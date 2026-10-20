import { defineChain, type Address, zeroAddress } from "viem";

// NEXT_PUBLIC_* values are inlined at build time, so each one must be referenced literally.
const env = {
  indexerUrl: process.env.NEXT_PUBLIC_INDEXER_URL ?? "",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 31337),
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || "Robinhood Chain",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
};

/** Without an indexer URL the site runs on dummy data and contract writes are disabled. */
export const USE_MOCK = env.indexerUrl === "";
export const INDEXER_URL = env.indexerUrl.replace(/\/$/, "");
export const WALLETCONNECT_PROJECT_ID = env.walletConnectProjectId;
export const EXPLORER_URL = env.explorerUrl.replace(/\/$/, "");

// Robinhood Chain as a custom chain. Set the official chain ID / RPC / explorer via env.
export const chain = defineChain({
  id: env.chainId,
  name: env.chainName,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [env.rpcUrl] } },
  blockExplorers: EXPLORER_URL ? { default: { name: "Explorer", url: EXPLORER_URL } } : undefined,
});

function addr(value: string | undefined): Address | undefined {
  return value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;
}

export const contracts = {
  launcher: addr(process.env.NEXT_PUBLIC_LAUNCHER_ADDRESS),
  registry: addr(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS),
  buybackExecutor: addr(process.env.NEXT_PUBLIC_BUYBACK_EXECUTOR_ADDRESS),
  treasury: addr(process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
  ctoManager: addr(process.env.NEXT_PUBLIC_CTO_MANAGER_ADDRESS),
  // PLACEHOLDER Pons V2 contracts
  ponsFactory: addr(process.env.NEXT_PUBLIC_PONS_FACTORY_ADDRESS),
  ponsRouter: addr(process.env.NEXT_PUBLIC_PONS_ROUTER_ADDRESS),
  v4Adapter: addr(process.env.NEXT_PUBLIC_V4_ADAPTER_ADDRESS),
};

export const CONTRACTS_READY = !USE_MOCK && Boolean(contracts.launcher && contracts.registry);

export type QuotePair = { key: string; label: string; address?: Address; kind: "native" | "stable" | "stock" };

export const QUOTE_PAIRS: QuotePair[] = [
  { key: "ETH", label: "ETH", address: zeroAddress, kind: "native" },
  { key: "USDG", label: "USDG", address: addr(process.env.NEXT_PUBLIC_QUOTE_USDG), kind: "stable" },
  { key: "NVDA", label: "NVDA", address: addr(process.env.NEXT_PUBLIC_QUOTE_NVDA), kind: "stock" },
  { key: "AAPL", label: "AAPL", address: addr(process.env.NEXT_PUBLIC_QUOTE_AAPL), kind: "stock" },
  { key: "HOOD", label: "HOOD", address: addr(process.env.NEXT_PUBLIC_QUOTE_HOOD), kind: "stock" },
];

/** Dummy addresses used for quote pairs in mock mode. */
export const MOCK_QUOTES: Record<string, Address> = {
  USDG: "0x00000000000000000000000000000000000000a1",
  NVDA: "0x00000000000000000000000000000000000000a2",
  AAPL: "0x00000000000000000000000000000000000000a3",
  HOOD: "0x00000000000000000000000000000000000000a4",
};

export function quotePairOf(address: string): QuotePair {
  const a = address.toLowerCase();
  const byEnv = QUOTE_PAIRS.find((q) => q.address?.toLowerCase() === a);
  if (byEnv) return byEnv;
  const mockKey = Object.entries(MOCK_QUOTES).find(([, v]) => v.toLowerCase() === a)?.[0];
  if (mockKey) return QUOTE_PAIRS.find((q) => q.key === mockKey)!;
  return { key: "?", label: `${a.slice(0, 6)}…`, address: a as Address, kind: "stable" };
}

// Spec parameters (mirrors the contracts; used for previews)
export const PARAMS = {
  maxBuybackBps: 8_000,
  maxRewardBps: 5_000,
  defaultBuybackBps: 4_000,
  defaultRewardBps: 2_000,
  defaultPlatformFeeBps: 2_000,
  callerIncentiveBps: 50,
  maxCallerIncentiveEth: 0.005,
  configTimelockHours: 24,
  ctoTimelockDays: 3,
  maxBuybackEth: 0.5,
};

/** Address used to filter by quote pair: env address in live mode, dummy address in mock mode. */
export function quoteFilterAddress(key: string): Address | undefined {
  if (key === "ETH") return zeroAddress;
  return USE_MOCK ? MOCK_QUOTES[key] : QUOTE_PAIRS.find((q) => q.key === key)?.address;
}
