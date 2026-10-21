# Verifying the official contracts on Blockscout

`pontoon-standard-input.json` is the exact compiler input (solc 0.8.28, optimizer 200 runs, EVM prague)
that produced the deployed bytecode (checked byte for byte against the chain).

Quickest: `./script/verify-blockscout.sh` from `contracts/` (needs Foundry and internet, no private key).

By hand, for each contract below: open its address on https://robinhoodchain.blockscout.com, then
**Contract → Verify & publish → Solidity (Standard JSON input)**, compiler `v0.8.28+commit.7893614a`,
upload `pontoon-standard-input.json`, pick the contract name, and submit. Blockscout reads the
constructor arguments from the creation transaction.

| Contract | Address | Source |
|---|---|---|
| PontoonLauncher | 0x23b2f18e2C190dB01E4ae2C13157d8e82a1f548E | src/PontoonLauncher.sol |
| TokenRegistry | 0x94B8b52D957f2Bb4006266AfcbECE22a04c64818 | src/TokenRegistry.sol |
| BuybackExecutor | 0x8BCfBf71509374062f292c341ab00e9314b72784 | src/BuybackExecutor.sol |
| PlatformTreasury | 0xC31A1F1B2fd11cD9A2E830610f7B963A27A020c8 | src/PlatformTreasury.sol |
| CTOManager | 0xCb9Eea98eF137cd19dC6C83AB70e97d805fCB2c3 | src/CTOManager.sol |
| FeeVault (implementation) | 0x5F7e98365a3EB9bAe271f48C9b0499773575EBD7 | src/FeeVault.sol |
| HolderRewards (implementation) | 0x951afCC9E236abC484ED2C9731145BB6eE27306F | src/HolderRewards.sol |

Each token's FeeVault and HolderRewards are minimal-proxy clones of the two implementations; Blockscout
shows them as proxies of the verified code.

## Fallback: single file

If the Standard JSON form does nothing, use **Solidity (Single file)** with the flattened source in
`flat/<Contract>.sol`: compiler `v0.8.28+commit.7893614a`, EVM version `prague`, optimization **on**
with **200** runs, contract name = the file name (e.g. `PontoonLauncher`), license MIT. Blockscout
may mark it "partially verified" (only the metadata hash differs); the code is still public and checked.
