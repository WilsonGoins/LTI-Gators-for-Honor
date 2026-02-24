import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the page to be embedded in Canvas iframes
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* https://*.instructure.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
