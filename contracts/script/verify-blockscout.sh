#!/usr/bin/env bash
# Verifies the official Pontoon contracts on Robinhood Chain Blockscout.
# Run from contracts/ on a machine with internet access (no private key needed):
#   ./script/verify-blockscout.sh
# Manual alternative: verify/README.md (upload verify/pontoon-standard-input.json in the Blockscout UI).
set -euo pipefail

VERIFIER_URL="https://robinhoodchain.blockscout.com/api/"
COMPILER="v0.8.28+commit.7893614a"
OWNER=0x52fE9A4058cc74fDE4BAd1A2a195F3ffBF01C8C1
PONS=0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e
REGISTRY=0x94B8b52D957f2Bb4006266AfcbECE22a04c64818
TREASURY=0xC31A1F1B2fd11cD9A2E830610f7B963A27A020c8
EXECUTOR=0x8BCfBf71509374062f292c341ab00e9314b72784
CTO=0xCb9Eea98eF137cd19dC6C83AB70e97d805fCB2c3
FEE_VAULT_IMPL=0x5F7e98365a3EB9bAe271f48C9b0499773575EBD7
HOLDER_REWARDS_IMPL=0x951afCC9E236abC484ED2C9731145BB6eE27306F
LAUNCHER=0x23b2f18e2C190dB01E4ae2C13157d8e82a1f548E

FAILED=()
verify() { # address contract [constructor args]; keeps going so one failure does not stop the rest
  local args=()
  [ -n "${3:-}" ] && args=(--constructor-args "$3")
  local out
  if out=$(forge verify-contract "$1" "$2" --chain-id 4663 --verifier blockscout --verifier-url "$VERIFIER_URL" \
    --compiler-version "$COMPILER" --evm-version prague --num-of-optimizations 200 "${args[@]}" --watch 2>&1); then
    echo "OK   $2 $1"
  elif grep -qi "already verified" <<<"$out"; then
    echo "OK   $2 $1 (already verified)"
  else
    echo "FAIL $2 $1"
    echo "$out" | tail -5
    FAILED+=("$2")
  fi
}

verify $REGISTRY src/TokenRegistry.sol:TokenRegistry "$(cast abi-encode 'c(address)' $OWNER)"
verify $TREASURY src/PlatformTreasury.sol:PlatformTreasury "$(cast abi-encode 'c(address)' $OWNER)"
verify $EXECUTOR src/BuybackExecutor.sol:BuybackExecutor "$(cast abi-encode 'c(address,address)' $OWNER $REGISTRY)"
verify $CTO src/CTOManager.sol:CTOManager "$(cast abi-encode 'c(address,address)' $OWNER $REGISTRY)"
verify $FEE_VAULT_IMPL src/FeeVault.sol:FeeVault
verify $HOLDER_REWARDS_IMPL src/HolderRewards.sol:HolderRewards
verify $LAUNCHER src/PontoonLauncher.sol:PontoonLauncher \
  "$(cast abi-encode 'c(address,address,address,address,address,address,address,address)' \
    $OWNER $PONS $REGISTRY $FEE_VAULT_IMPL $HOLDER_REWARDS_IMPL $EXECUTOR $TREASURY $CTO)"
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "Failed: ${FAILED[*]}"
  exit 1
fi
echo "Done. Each token's FeeVault and HolderRewards are minimal-proxy clones of the two implementations above."
