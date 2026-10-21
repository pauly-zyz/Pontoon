// Official Pontoon token ($PONTOON). It was launched directly on Pons V2 (not through PontoonLauncher),
// so it has no FeeVault: the indexer only follows its bonding curve and lists it as the official token.
// Metadata is copied from the token contract because the public RPC keeps only recent state.
export const OFFICIAL_TOKEN = {
  token: "0x172eBBE24234F6372aE2A8c59280e27d236ff177",
  curve: "0xdc1eec3CF4718Cb5E86a8142c7D1E1c3971Fa0f0",
  deployer: "0x79ddeB442E0A7b5C29f5c148319986670535Ff21",
  launchBlock: 94327409,
  name: "Pontoon",
  symbol: "PONTOON",
  logo: "ipfs://bafkreihg6iwceh36k7dt3ibzt2sudzwcc2sjvxhavpeanjcvcpi2forurq",
  description: "Where tokens float, not sink. Built for Robinhood Chain.",
  twitter: "https://x.com/pontoonfamily",
} as const;

export const isOfficialToken = (address: string) => address.toLowerCase() === OFFICIAL_TOKEN.token.toLowerCase();
export const isOfficialCurve = (address: string) => address.toLowerCase() === OFFICIAL_TOKEN.curve.toLowerCase();
