import { defineChain, type Address, zeroAddress } from "viem";

// NEXT_PUBLIC_* values are inlined at build time, so each one must be referenced literally.
const env = {
  indexerUrl: process.env.NEXT_PUBLIC_INDEXER_URL ?? "",
  // Defaults: Robinhood Chain mainnet. Override all four for testnet or a local chain.
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 4663),
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || "Robinhood Chain",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL || "https://robinhoodchain.blockscout.com",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
};

/**
 * No indexer configured yet: pre-launch mode. The site shows real (empty) data, a "launching soon"
 * notice, and contract writes are disabled until addresses are set.
 */
export const PRE_LAUNCH = env.indexerUrl === "";
/** Sample data for local design work only (NEXT_PUBLIC_DEMO_DATA=true). Never enable in production. */
export const USE_MOCK = PRE_LAUNCH && process.env.NEXT_PUBLIC_DEMO_DATA === "true";
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

export const PONS_FACTORY_MAINNET: Address = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

/** Official Pontoon deployment on Robinhood Chain mainnet (contracts/deployments/4663.json). */
export const OFFICIAL_MAINNET = {
  launcher: "0xF322fACa574c05138c30D31997E6ABF03d6441eC",
  registry: "0xc7D03457D9171d0645B19A1002ba855442e55232",
  buybackExecutor: "0xE8D4c92B2868F34E56BB0dDA83D0916a76afAb9f",
  treasury: "0x53dB0bcf8c5e003B5219bE5593a64C894851110b",
  ctoManager: "0xaa0cAecdFa2275FCAe602b43358F43bDFa631680",
} as const satisfies Record<string, Address>;

// Env values win (local fork, testnet); on mainnet the official addresses are the default.
const official = env.chainId === 4663 ? OFFICIAL_MAINNET : undefined;

export const contracts = {
  launcher: addr(process.env.NEXT_PUBLIC_LAUNCHER_ADDRESS) ?? official?.launcher,
  registry: addr(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS) ?? official?.registry,
  buybackExecutor: addr(process.env.NEXT_PUBLIC_BUYBACK_EXECUTOR_ADDRESS) ?? official?.buybackExecutor,
  treasury: addr(process.env.NEXT_PUBLIC_TREASURY_ADDRESS) ?? official?.treasury,
  ctoManager: addr(process.env.NEXT_PUBLIC_CTO_MANAGER_ADDRESS) ?? official?.ctoManager,
  // Live Pons V2 launch factory on Robinhood Chain mainnet (override only for another network).
  ponsFactory: addr(process.env.NEXT_PUBLIC_PONS_FACTORY_ADDRESS) ?? PONS_FACTORY_MAINNET,
};

/**
 * On-chain writes (launch, trade, stake...) need the contracts and a running indexer: without the indexer
 * new tokens would not show on the site. Setting NEXT_PUBLIC_INDEXER_URL opens launches.
 */
export const CONTRACTS_READY = !USE_MOCK && !PRE_LAUNCH && Boolean(contracts.launcher && contracts.registry);

export type QuotePair = { key: string; label: string; address?: Address; kind: "native" | "stable" | "stock" };

/** Only ETH-paired launches are live; stablecoin and tokenized-stock pairs come later. */
export const LIVE_QUOTE_KEYS = new Set(["ETH"]);

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
  // Pons V2 bonding curve
  curveFeeBps: 100,
  creatorTaxBps: 300,
};

/** Address used to filter by quote pair: env address in live mode, dummy address in mock mode. */
export function quoteFilterAddress(key: string): Address | undefined {
  if (key === "ETH") return zeroAddress;
  return USE_MOCK ? MOCK_QUOTES[key] : QUOTE_PAIRS.find((q) => q.key === key)?.address;
}

/** Official Pontoon social accounts. */
export const SOCIAL = {
  x: { url: "https://x.com/PontoonFamily", handle: "@PontoonFamily" },
};
