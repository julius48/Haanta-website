import type { NextConfig } from "next"

const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"
if (!URL.canParse(backendUrl)) {
  throw new Error(`NEXT_PUBLIC_MEDUSA_BACKEND_URL must be a full URL starting with https:// (got "${backendUrl}")`)
}
const backend = new URL(backendUrl)

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@haanta/ui"],
  images: {
    formats: ["image/avif", "image/webp"],
    // Short width ladder: every srcset is repeated in the HTML and the RSC payload (48 cards x 2 images).
    deviceSizes: [640, 828, 1080, 1440, 1920],
    imageSizes: [128, 256, 384],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "static.wixstatic.com", pathname: "/media/**" },
      { protocol: "https", hostname: "cdn.sanity.io" },
      { protocol: backend.protocol.replace(":", "") as "http" | "https", hostname: backend.hostname, port: backend.port, pathname: "/static/**" },
    ],
  },
  // Legacy Wix redirects are served from proxy.ts (Map lookup).
}

export default config
