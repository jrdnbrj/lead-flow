import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep browser assets and Server Actions aligned with the immutable image
  // during deployments. A stale tab must hard-navigate to the current build.
  deploymentId: process.env.DEPLOYMENT_VERSION || process.env.GIT_SHA || "local",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
