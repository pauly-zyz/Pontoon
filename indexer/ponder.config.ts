import { createConfig, factory } from "ponder";
import { getAbiItem, type Address } from "viem";

import { BuybackExecutorAbi } from "./abis/BuybackExecutorAbi";
import { CTOManagerAbi } from "./abis/CTOManagerAbi";
import { FeeVaultAbi } from "./abis/FeeVaultAbi";
import { HolderRewardsAbi } from "./abis/HolderRewardsAbi";
import { PlatformTreasuryAbi } from "./abis/PlatformTreasuryAbi";
import { PonsV2FactoryAbi } from "./abis/PonsV2FactoryAbi";
import { PontoonLauncherAbi } from "./abis/PontoonLauncherAbi";
import { TokenRegistryAbi } from "./abis/TokenRegistryAbi";

const chainId = Number(process.env.PONDER_CHAIN_ID ?? 31337);
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
      // Local anvil chains get reset often; never cache their RPC responses.
      cacheRpcRequests: chainId !== 31337,
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
    // PLACEHOLDER ABI: Graduated + Trade from Pons V2. Events for tokens not launched via Pontoon are ignored.
    PonsV2: { chain: "robinhood", abi: PonsV2FactoryAbi, address: addr("PONS_FACTORY_ADDRESS"), startBlock },
  },
});
