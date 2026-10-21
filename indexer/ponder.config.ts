import { createConfig, factory } from "ponder";
import { getAbiItem, type Address } from "viem";

import { BuybackExecutorAbi } from "./abis/BuybackExecutorAbi";
import { CTOManagerAbi } from "./abis/CTOManagerAbi";
import { FeeVaultAbi } from "./abis/FeeVaultAbi";
import { HolderRewardsAbi } from "./abis/HolderRewardsAbi";
import { PlatformTreasuryAbi } from "./abis/PlatformTreasuryAbi";
import { PonsV2CurveAbi } from "./abis/PonsV2CurveAbi";
import { PonsV2FactoryAbi } from "./abis/PonsV2FactoryAbi";
import { PontoonLauncherAbi } from "./abis/PontoonLauncherAbi";
import { TokenRegistryAbi } from "./abis/TokenRegistryAbi";
import { OFFICIAL_TOKEN } from "./src/official";

const chainId = Number(process.env.PONDER_CHAIN_ID ?? 4663);
// Live Pons V2 launch factory on Robinhood Chain mainnet (also present on a local mainnet fork).
const PONS_FACTORY_MAINNET = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
// Official Pontoon deployment on Robinhood Chain mainnet (contracts/deployments/4663.json). Used when the env
// does not set the addresses; a local mainnet fork (PONDER_LOCAL_FORK) always sets its own.
const OFFICIAL_MAINNET: Record<string, string> = {
  PONDER_START_BLOCK: "94087197",
  PONTOON_LAUNCHER_ADDRESS: "0x23b2f18e2C190dB01E4ae2C13157d8e82a1f548E",
  TOKEN_REGISTRY_ADDRESS: "0x94B8b52D957f2Bb4006266AfcbECE22a04c64818",
  BUYBACK_EXECUTOR_ADDRESS: "0x8BCfBf71509374062f292c341ab00e9314b72784",
  PLATFORM_TREASURY_ADDRESS: "0xC31A1F1B2fd11cD9A2E830610f7B963A27A020c8",
  CTO_MANAGER_ADDRESS: "0xCb9Eea98eF137cd19dC6C83AB70e97d805fCB2c3",
};
const defaults = chainId === 4663 && process.env.PONDER_LOCAL_FORK !== "true" ? OFFICIAL_MAINNET : {};
const env = (name: string) => process.env[name] || defaults[name];

const startBlock = Number(env("PONDER_START_BLOCK") ?? 0);
// Mainnet has ~94M blocks: indexing from 0 would take days. Use the block of the official deployment
// (contracts/deployments/4663.json "startBlock"), which also keeps test activity off the site.
if (chainId === 4663 && process.env.PONDER_LOCAL_FORK !== "true" && !(startBlock > 0)) {
  throw new Error("Set PONDER_START_BLOCK to the PontoonLauncher deployment block (see contracts/deployments/4663.json)");
}

function addr(name: string): Address {
  const value = env(name);
  if (!value) throw new Error(`Missing env ${name} (see .env.example)`);
  return value as Address;
}

const launcher = addr("PONTOON_LAUNCHER_ADDRESS");
const registry = addr("TOKEN_REGISTRY_ADDRESS");

export default createConfig({
  chains: {
    robinhood: {
      id: chainId,
      rpc: process.env.PONDER_RPC_URL ?? "http://127.0.0.1:8545",
      // Local forks get reset often; never cache their RPC responses.
      cacheRpcRequests: process.env.PONDER_LOCAL_FORK !== "true",
    },
  },
  contracts: {
    PontoonLauncher: { chain: "robinhood", abi: PontoonLauncherAbi, address: launcher, startBlock },
    TokenRegistry: { chain: "robinhood", abi: TokenRegistryAbi, address: registry, startBlock },
    BuybackExecutor: {
      chain: "robinhood",
      abi: BuybackExecutorAbi,
      address: addr("BUYBACK_EXECUTOR_ADDRESS"),
      startBlock,
    },
    PlatformTreasury: {
      chain: "robinhood",
      abi: PlatformTreasuryAbi,
      address: addr("PLATFORM_TREASURY_ADDRESS"),
      startBlock,
    },
    CTOManager: { chain: "robinhood", abi: CTOManagerAbi, address: addr("CTO_MANAGER_ADDRESS"), startBlock },
    // One FeeVault clone per token, discovered from PontoonLauncher.TokenLaunched.
    FeeVault: {
      chain: "robinhood",
      abi: FeeVaultAbi,
      address: factory({
        address: launcher,
        event: getAbiItem({ abi: PontoonLauncherAbi, name: "TokenLaunched" }),
        parameter: "vault",
      }),
      startBlock,
    },
    // One HolderRewards clone per token, discovered from TokenRegistry.TokenRegistered.
    HolderRewards: {
      chain: "robinhood",
      abi: HolderRewardsAbi,
      address: factory({
        address: registry,
        event: getAbiItem({ abi: TokenRegistryAbi, name: "TokenRegistered" }),
        parameter: "holderRewards",
      }),
      startBlock,
    },
    // Pons V2 bonding curve of each Pontoon token (CurveBuy / CurveSell), from TokenRegistry.TokenRegistered.
    PonsV2Curve: {
      chain: "robinhood",
      abi: PonsV2CurveAbi,
      address: factory({
        address: registry,
        event: getAbiItem({ abi: TokenRegistryAbi, name: "TokenRegistered" }),
        parameter: "curve",
      }),
      startBlock,
    },
    // Bonding curve of the official $PONTOON token, launched directly on Pons V2.
    OfficialCurve: {
      chain: "robinhood",
      abi: PonsV2CurveAbi,
      address: OFFICIAL_TOKEN.curve,
      startBlock: Math.max(startBlock, OFFICIAL_TOKEN.launchBlock),
    },
    // Pons V2 factory: PoolGraduated, and TokenLaunched for the official token. Events for other
    // tokens not launched via Pontoon are ignored.
    PonsV2: {
      chain: "robinhood",
      abi: PonsV2FactoryAbi,
      address: (process.env.PONS_FACTORY_ADDRESS || PONS_FACTORY_MAINNET) as Address,
      startBlock,
    },
  },
});
