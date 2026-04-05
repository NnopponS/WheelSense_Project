import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/staff/supervisor",
        destination: "/supervisor",
        permanent: false,
      },
      {
        source: "/staff/supervisor/:path*",
        destination: "/supervisor/:path*",
        permanent: false,
      },
      {
        source: "/staff/observer",
        destination: "/observer",
        permanent: false,
      },
    ];
  },
  // API traffic is proxied by `app/api/[[...path]]/route.ts` so PATCH/DELETE/etc.
  // reliably reach FastAPI (dev rewrites alone can yield generic 404 + "Not Found" HTML).
};

export default nextConfig;
