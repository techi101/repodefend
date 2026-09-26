import type { NextConfig } from "next";

// The browser only ever talks to this Next.js app. /api/* is proxied to the
// FastAPI backend, so the session cookie is first-party: no CORS setup, and no
// third-party-cookie blocking between vercel.app and onrender.com.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
