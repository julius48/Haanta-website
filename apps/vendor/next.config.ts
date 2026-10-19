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
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "static.wixstatic.com", pathname: "/media/**" },
      { protocol: backend.protocol.replace(":", "") as "http" | "https", hostname: backend.hostname, port: backend.port, pathname: "/static/**" },
    ],
  },
}

export default config
