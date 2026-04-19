import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Receipt uploads accept images up to 10MB (client-side cap in
      // `upload-validation.ts`). FormData adds boundary + field overhead, so
      // give the request a little headroom over the raw file cap.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
