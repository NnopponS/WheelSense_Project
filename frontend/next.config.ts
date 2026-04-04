import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
