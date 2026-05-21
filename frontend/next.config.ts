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
      {
        source: "/supervisor/workflow",
        destination: "/supervisor/tasks",
        permanent: false,
      },
      {
        source: "/supervisor/directives",
        destination: "/supervisor/tasks?wtab=directives",
        permanent: false,
      },
      {
        source: "/supervisor/calendar",
        destination: "/supervisor/tasks?tab=calendar",
        permanent: false,
      },
      {
        source: "/head-nurse/workflow",
        destination: "/head-nurse/tasks",
        permanent: false,
      },
      {
        source: "/observer/workflow",
        destination: "/observer/tasks",
        permanent: false,
      },
    ];
  },
  // API traffic is proxied by `app/api/[[...path]]/route.ts` so PATCH/DELETE/etc.
  // reliably reach FastAPI (dev rewrites alone can yield generic 404 + "Not Found" HTML).
};

export default nextConfig;
