// Prints the env values for the hosted indexer and for Vercel from contracts/deployments/<chainId>.json
// (written by `forge script script/Deploy.s.sol`). Usage: node scripts/print-env.mjs [chainId] [indexerUrl]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [chainId = "4663", indexerUrl = "https://<your-indexer-host>"] = process.argv.slice(2);
const d = JSON.parse(readFileSync(join(root, "..", "contracts", "deployments", `${chainId}.json`), "utf8"));

console.log(`# --- Indexer host (e.g. Railway / Render), start command: npm run start ---
PONDER_CHAIN_ID=${d.chainId}
PONDER_RPC_URL=https://rpc.mainnet.chain.robinhood.com
PONDER_START_BLOCK=${d.startBlock}
DATABASE_URL=<postgres connection string from your host>
DATABASE_SCHEMA=pontoon_v1
PONS_FACTORY_ADDRESS=${d.PonsFactory}
PONTOON_LAUNCHER_ADDRESS=${d.PontoonLauncher}
TOKEN_REGISTRY_ADDRESS=${d.TokenRegistry}
BUYBACK_EXECUTOR_ADDRESS=${d.BuybackExecutor}
PLATFORM_TREASURY_ADDRESS=${d.PlatformTreasury}
CTO_MANAGER_ADDRESS=${d.CTOManager}

# --- Vercel (Project Settings > Environment Variables, Production), then redeploy ---
NEXT_PUBLIC_INDEXER_URL=${indexerUrl}
NEXT_PUBLIC_LAUNCHER_ADDRESS=${d.PontoonLauncher}
NEXT_PUBLIC_REGISTRY_ADDRESS=${d.TokenRegistry}
NEXT_PUBLIC_BUYBACK_EXECUTOR_ADDRESS=${d.BuybackExecutor}
NEXT_PUBLIC_TREASURY_ADDRESS=${d.PlatformTreasury}
NEXT_PUBLIC_CTO_MANAGER_ADDRESS=${d.CTOManager}`);
