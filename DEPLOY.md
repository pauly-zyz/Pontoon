# Going live

Checklist for opening Pontoon to the public on Robinhood Chain mainnet (chain ID 4663).
Do the steps in order; do not skip the checks.

## 0. Before deploying

- [ ] Mainnet smoke test passed: `contracts/script/MainnetSmoke.s.sol` (throwaway contracts, tiny amounts).
      Verify the token, trades and burn on chain.
- [ ] A Safe multisig exists on Robinhood Chain (e.g. 2-of-3). Safe 1.3.0 and 1.4.1 contracts are
      deployed there. Its address is `MULTISIG` below. Never use a wallet whose key was shared anywhere.
- [ ] A deployer wallet with ~0.002 ETH for gas. It owns nothing after the deploy.
- [ ] Audit (strongly recommended before user funds flow through the contracts).

## 1. Deploy the official contracts

```sh
cd contracts
MULTISIG=0x<safe> forge script script/Deploy.s.sol \
  --rpc-url https://rpc.mainnet.chain.robinhood.com --broadcast --slow --private-key <deployer key, via env>
```

The script refuses an owner that is not a contract, checks after deploying that every contract is
owned by the multisig, and writes `contracts/deployments/4663.json` (addresses + `startBlock`).
Commit that file.

## 2. Host the indexer

Any Node 22 host with Postgres works (Railway, Render, Fly). Root directory `indexer`, build
`npm ci`, start `npm run start`. Get the env values with:

```sh
cd indexer && node scripts/print-env.mjs 4663 https://<indexer-host>
```

`PONDER_START_BLOCK` is the official deployment block, so smoke-test contracts never show on the site.
Check `https://<indexer-host>/ready` returns 200 and `/api/stats` answers.

## 3. Switch the website on

Add the `NEXT_PUBLIC_*` values printed above to Vercel (Production) and redeploy. Pre-launch mode
turns off automatically once `NEXT_PUBLIC_INDEXER_URL` is set.

## 4. Final checks, then announce

- [ ] Home, launch, token, treasury, rewards, creator, CTO and docs pages load with no test data.
- [ ] One real launch from the website with a small initial buy, then a buy and a sell.
- [ ] The token shows up via the indexer; market cap and volume are in USD.
- [ ] Owner approval, then announce on https://x.com/PontoonFamily.
