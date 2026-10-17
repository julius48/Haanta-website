import type { Metadata } from "next"
import Image from "next/image"
import { StoreForm } from "@/components/store-form"
import { htmlToLite } from "@/lib/rich-text"
import { getMe, vendorGet } from "@/lib/server/session"
import type { StorePage } from "@/lib/types"

export const metadata: Metadata = { title: "Store page" }

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000"

export default async function StorePageEditor() {
  const [me, data] = await Promise.all([getMe(), vendorGet<{ store: StorePage; preview_path: string }>("/vendor/store")])
  const s = data.store
  const canEdit = me?.vendor.status !== "paused" && me?.vendor.status !== "rejected"
  let previewUrl: string | null = null
  try {
    const u = new URL(data.preview_path, STOREFRONT_URL)
    if (u.origin === new URL(STOREFRONT_URL).origin) previewUrl = u.toString()
  } catch {
    previewUrl = null
  }
  return (
    <>
      <div className="v-page-head">
        <h1>Store page</h1>
        {previewUrl ? (
          <a className="h-btn h-btn--secondary" href={previewUrl} target="_blank" rel="noopener noreferrer">
            Open on the storefront<span className="h-sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
      <div className="v-grid v-grid--2" style={{ alignItems: "start" }}>
        <section className="v-card" aria-labelledby="edit-h">
          <h2 id="edit-h">Edit</h2>
          <StoreForm
            canEdit={canEdit}
            values={{
              logo_url: s.logo_url ?? "",
              banner_url: s.banner_url ?? "",
              story: htmlToLite(s.story),
              policies: s.policies ?? "",
              size_notes: s.size_notes ?? "",
              region: s.region ?? "",
            }}
          />
        </section>
        <section aria-labelledby="preview-h">
          <h2 id="preview-h" style={{ fontSize: "var(--type-subhead-size)" }}>
            Preview (saved version)
          </h2>
          <article className="v-preview" data-testid="store-preview">
            <div className="v-preview__banner">{s.banner_url ? <Image src={s.banner_url} alt="" width={960} height={320} unoptimized /> : null}</div>
            <div className="v-preview__body">
              <div className="v-preview__head">
                {s.logo_url ? <Image className="v-preview__logo" src={s.logo_url} alt={`${s.name} logo`} width={72} height={72} unoptimized /> : <span className="v-preview__logo" aria-hidden="true" />}
                <div>
                  <h3 style={{ margin: 0, fontSize: "var(--type-section-header-size)" }}>{s.name}</h3>
                  {s.region ? <p className="v-muted" style={{ margin: 0 }}>{s.region}</p> : null}
                </div>
              </div>
              {s.story ? (
                // Sanitised by the Haanta API (allow-list) before storage; rendered as the storefront does.
                <div className="v-prose" dangerouslySetInnerHTML={{ __html: s.story }} />
              ) : (
                <p className="v-muted">Add your story so buyers get to know your brand.</p>
              )}
              {s.size_notes ? (
                <p>
                  <strong>Sizing:</strong> {s.size_notes}
                </p>
              ) : null}
              {s.policies ? (
                <>
                  <h4 style={{ margin: "var(--space-4) 0 var(--space-2)" }}>Policies</h4>
                  <p style={{ whiteSpace: "pre-line" }}>{s.policies}</p>
                </>
              ) : null}
            </div>
          </article>
        </section>
      </div>
    </>
  )
}
