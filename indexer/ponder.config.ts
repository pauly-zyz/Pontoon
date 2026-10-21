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

const chainId = Number(process.env.PONDER_CHAIN_ID ?? 4663);
// Live Pons V2 launch factory on Robinhood Chain mainnet (also present on a local mainnet fork).
const PONS_FACTORY_MAINNET = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const startBlock = Number(process.env.PONDER_START_BLOCK ?? 0);

function addr(name: string): Address {
  const value = process.env[name];
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
    // Pons V2 factory: PoolGraduated. Events for tokens not launched via Pontoon are ignored.
    PonsV2: {
      chain: "robinhood",
      abi: PonsV2FactoryAbi,
      address: (process.env.PONS_FACTORY_ADDRESS || PONS_FACTORY_MAINNET) as Address,
      startBlock,
    },
  },
});
