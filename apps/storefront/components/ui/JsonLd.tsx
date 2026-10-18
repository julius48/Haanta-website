import { headers } from "next/headers"
import { serializeJsonLd, type JsonLdObject } from "@/lib/jsonld"

/** JSON-LD is the only inline script allowed; it carries the per-request CSP nonce. */
export async function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
