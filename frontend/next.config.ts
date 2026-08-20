import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  async redirects() {
    return [
      // Legacy /staff/* redirects
      {
        source: "/staff/supervisor",
        destination: "/head-caregiver",
        permanent: false,
      },
      {
        source: "/staff/supervisor/:path*",
        destination: "/head-caregiver/:path*",
        permanent: false,
      },
      {
        source: "/staff/observer",
        destination: "/caregiver",
        permanent: false,
      },
      // Old role routes → new canonical routes
      {
        source: "/supervisor",
        destination: "/head-caregiver",
        permanent: false,
      },
      {
        source: "/supervisor/:path*",
        destination: "/head-caregiver/:path*",
        permanent: false,
      },
      {
        source: "/head-nurse",
        destination: "/head-caregiver",
        permanent: false,
      },
      {
        source: "/head-nurse/:path*",
        destination: "/head-caregiver/:path*",
        permanent: false,
      },
      {
        source: "/observer",
        destination: "/caregiver",
        permanent: false,
      },
      {
        source: "/observer/:path*",
        destination: "/caregiver/:path*",
        permanent: false,
      },
      // Internal route normalizations
      {
        source: "/head-caregiver/workflow",
        destination: "/head-caregiver/tasks",
        permanent: false,
      },
      {
        source: "/head-caregiver/directives",
        destination: "/head-caregiver/tasks?wtab=directives",
        permanent: false,
      },
      {
        source: "/head-caregiver/calendar",
        destination: "/head-caregiver/tasks?tab=calendar",
        permanent: false,
      },
      {
        source: "/caregiver/workflow",
        destination: "/caregiver/tasks",
        permanent: false,
      },
    ];
  },
  // API traffic is proxied by `app/api/[[...path]]/route.ts` so PATCH/DELETE/etc.
  // reliably reach FastAPI (dev rewrites alone can yield generic 404 + "Not Found" HTML).
};

export default nextConfig;
