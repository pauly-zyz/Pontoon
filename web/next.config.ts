import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
    // See lib/base-account-stub.js
    resolveAlias: { "@base-org/account": "./lib/base-account-stub.js" },
  },
};

export default nextConfig;
