#!/usr/bin/env bash
# Starts an anvil FORK of Robinhood Chain mainnet, deploys Pontoon on top of the real Pons V2 contracts,
# generates activity for every indexed event (launches, curve trades, fee distribution, buyback-burn,
# staking, graduation, CTO + config timelocks) and writes .env.local for both indexer/ and web/.
# Then run `npm run dev` in each. Nothing is sent to the real chain.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
contracts="$here/../contracts"
rpc="${FORK_RPC:-http://127.0.0.1:8546}"
upstream="${UPSTREAM_RPC:-https://rpc.mainnet.chain.robinhood.com}"

if ! curl -s -o /dev/null "$rpc"; then
  echo "Starting anvil fork of $upstream ..."
  anvil --fork-url "$upstream" --port "${rpc##*:}" --silent >/dev/null 2>&1 &
  for _ in $(seq 1 30); do curl -s -o /dev/null "$rpc" && break; sleep 1; done
fi

cd "$contracts"
forge script script/LocalDemo.s.sol --rpc-url "$rpc" --broadcast --slow >/dev/null
cast rpc evm_increaseTime 10 --rpc-url "$rpc" >/dev/null   # past the Pons snipe tax
cast rpc evm_mine --rpc-url "$rpc" >/dev/null
forge script script/LocalDemo.s.sol --sig "trade()" --rpc-url "$rpc" --broadcast --slow >/dev/null
cast rpc evm_increaseTime 259201 --rpc-url "$rpc" >/dev/null   # past the CTO + config timelocks
cast rpc evm_mine --rpc-url "$rpc" >/dev/null
forge script script/LocalDemo.s.sol --sig "phase2()" --rpc-url "$rpc" --broadcast --slow >/dev/null

node - "$contracts/deployments/local.json" "$here/.env.local" "$rpc" <<'JS'
const [file, out, rpc] = process.argv.slice(2);
const d = JSON.parse(require("fs").readFileSync(file, "utf8"));
require("fs").writeFileSync(out, [
  "PONDER_CHAIN_ID=4663",
  `PONDER_RPC_URL=${rpc}`,
  `PONDER_START_BLOCK=${d.startBlock - 5}`,
  "PONDER_LOCAL_FORK=true",
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
  "NEXT_PUBLIC_CHAIN_ID=4663",
  "NEXT_PUBLIC_CHAIN_NAME=Robinhood Chain (local fork)",
  `NEXT_PUBLIC_RPC_URL=${rpc}`,
  "NEXT_PUBLIC_EXPLORER_URL=",
  `NEXT_PUBLIC_LAUNCHER_ADDRESS=${d.PontoonLauncher}`,
  `NEXT_PUBLIC_REGISTRY_ADDRESS=${d.TokenRegistry}`,
  `NEXT_PUBLIC_BUYBACK_EXECUTOR_ADDRESS=${d.BuybackExecutor}`,
  `NEXT_PUBLIC_TREASURY_ADDRESS=${d.PlatformTreasury}`,
  `NEXT_PUBLIC_CTO_MANAGER_ADDRESS=${d.CTOManager}`,
  `NEXT_PUBLIC_PONS_FACTORY_ADDRESS=${d.PonsFactory}`,
  "",
].join("\n"));
console.log(`Wrote ${web}`);
console.log(`Demo tokens: ${d.tokens.join(", ")} (2nd one is graduated, CTO done)`);
JS
