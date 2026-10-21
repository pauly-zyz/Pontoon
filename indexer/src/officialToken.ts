import { token } from "ponder:schema";
import { createPublicClient, http, zeroAddress, type Address } from "viem";

import { bumpStats, type Db, encodeMetadata, type EventLike, newToken } from "./helpers";
import { OFFICIAL_TOKEN } from "./official";

/**
 * Reads the latest chain state. The public RPC drops state after ~30 minutes, so historical reads for
 * $PONTOON trades from before the indexer existed would fail; its price and curve progress are taken
 * from the latest state instead (equal to the trade's state while the indexer is live).
 */
export const latestClient = createPublicClient({ transport: http(process.env.PONDER_RPC_URL) });

/** Creates the $PONTOON row the first time one of its events is seen. */
export async function ensureOfficialToken(db: Db, event: EventLike) {
  const address = OFFICIAL_TOKEN.token as Address;
  if (await db.find(token, { address })) return;
  await db.insert(token).values({
    ...newToken({
      address,
      creator: OFFICIAL_TOKEN.deployer,
      vault: zeroAddress,
      holderRewards: zeroAddress,
      curve: OFFICIAL_TOKEN.curve,
      quoteAsset: zeroAddress,
      isMemestock: false,
      event,
    }),
    name: OFFICIAL_TOKEN.name,
    symbol: OFFICIAL_TOKEN.symbol,
    metadataURI: encodeMetadata({
      logo: OFFICIAL_TOKEN.logo,
      description: OFFICIAL_TOKEN.description,
      twitter: OFFICIAL_TOKEN.twitter,
      telegram: "",
      website: "",
    }),
  });
  await bumpStats(db, (s) => ({ tokensLaunched: s.tokensLaunched + 1 }));
}
