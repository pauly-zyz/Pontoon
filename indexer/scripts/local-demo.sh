#!/usr/bin/env bash
# Starts anvil, deploys Pontoon with mock Pons V2 contracts, generates activity for every
# indexed event (including a 3-day time jump for the CTO + config timelocks) and writes .env.local
# for both indexer/ and web/. Then run `npm run dev` in each.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
contracts="$here/../contracts"
rpc="http://127.0.0.1:8545"

if ! curl -s -o /dev/null "$rpc"; then
  echo "Starting anvil..."
  anvil --silent >/dev/null 2>&1 &
  sleep 2
fi

cd "$contracts"
forge script script/LocalDemo.s.sol --rpc-url "$rpc" --broadcast >/dev/null
cast rpc evm_increaseTime 259201 --rpc-url "$rpc" >/dev/null
cast rpc evm_mine --rpc-url "$rpc" >/dev/null
forge script script/LocalDemo.s.sol --sig "phase2()" --rpc-url "$rpc" --broadcast >/dev/null

node - "$contracts/deployments/local.json" "$here/.env.local" <<'JS'
const [file, out] = process.argv.slice(2);
const d = JSON.parse(require("fs").readFileSync(file, "utf8"));
require("fs").writeFileSync(out, [
  "PONDER_CHAIN_ID=31337",
  "PONDER_RPC_URL=http://127.0.0.1:8545",
  "PONDER_START_BLOCK=0",
  "DATABASE_SCHEMA=pontoon",
  `PONS_FACTORY_ADDRESS=${d.PonsFactory}`,
  `PONTOON_LAUNCHER_ADDRESS=${d.PontoonLauncher}`,
  `TOKEN_REGISTRY_ADDRESS=${d.TokenRegistry}`,
  `BUYBACK_EXECUTOR_ADDRESS=${d.BuybackExecutor}`,
  `PLATFORM_TREASURY_ADDRESS=${d.PlatformTreasury}`,
  `CTO_MANAGER_ADDRESS=${d.CTOManager}`,
  "",
].join("\n"));
console.log(`Wrote ${out}`);

const web = require("path").join(require("path").dirname(out), "..", "web", ".env.local");
require("fs").writeFileSync(web, [
  "NEXT_PUBLIC_INDEXER_URL=http://localhost:42069",
  "NEXT_PUBLIC_CHAIN_ID=31337",
  "NEXT_PUBLIC_CHAIN_NAME=Anvil (local)",
  "NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545",
  "NEXT_PUBLIC_EXPLORER_URL=",
  `NEXT_PUBLIC_LAUNCHER_ADDRESS=${d.PontoonLauncher}`,
  `NEXT_PUBLIC_REGISTRY_ADDRESS=${d.TokenRegistry}`,
  `NEXT_PUBLIC_BUYBACK_EXECUTOR_ADDRESS=${d.BuybackExecutor}`,
  `NEXT_PUBLIC_TREASURY_ADDRESS=${d.PlatformTreasury}`,
  `NEXT_PUBLIC_CTO_MANAGER_ADDRESS=${d.CTOManager}`,
  `NEXT_PUBLIC_PONS_FACTORY_ADDRESS=${d.PonsFactory}`,
  `NEXT_PUBLIC_PONS_ROUTER_ADDRESS=${d.PonsRouter}`,
  `NEXT_PUBLIC_V4_ADAPTER_ADDRESS=${d.V4Adapter}`,
  `NEXT_PUBLIC_QUOTE_USDG=${d.USDG}`,
  `NEXT_PUBLIC_QUOTE_NVDA=${d.NVDA}`,
  `NEXT_PUBLIC_QUOTE_AAPL=${d.AAPL}`,
  `NEXT_PUBLIC_QUOTE_HOOD=${d.HOOD}`,
  "",
].join("\n"));
console.log(`Wrote ${web}`);
console.log(`Demo tokens: ${d.tokenA} (ETH pair), ${d.tokenB} (NVDA pair, memestock, graduated, CTO done)`);
JS
