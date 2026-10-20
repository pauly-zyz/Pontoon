// Pontoon does not offer the Base Account wallet. RainbowKit still references its connector, which
// lazily imports @base-org/account (and, through it, the Coinbase CDP SDK with many optional deps
// that break the build). next.config.ts aliases that package here instead.
export function createBaseAccountSDK() {
  throw new Error("Base Account wallet is not supported in Pontoon");
}
