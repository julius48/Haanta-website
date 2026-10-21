import type { Metadata } from "next"
import Image from "next/image"
import { StoreForm } from "@/components/store-form"
import { htmlToLite } from "@/lib/rich-text"
import { getMe, vendorGet } from "@/lib/server/session"
import type { StorePage } from "@/lib/types"

export const metadata: Metadata = { title: "Store page" }

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3000"

const plain = (html: string | null) => (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

/** The first sentence or two, as the storefront shows beside the cover photo. */
function excerpt(text: string, max = 220): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "))
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`
}

/** What makes a store page complete, in the order buyers notice it. */
function checklist(s: StorePage) {
  const story = plain(s.story)
  return [
    { label: "Cover photo", done: !!s.banner_url },
    { label: "Logo", done: !!s.logo_url },
    { label: "Brand story (at least a short paragraph)", done: story.length >= 160 },
    { label: "Where you're based", done: !!s.region },
    { label: "Size notes", done: !!s.size_notes },
    { label: "Policies", done: !!s.policies },
  ]
}

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
  const items = checklist(s)
  const done = items.filter((i) => i.done).length
  const story = plain(s.story)
  return (
    <>
      <div className="v-page-head">
        <div>
          <p className="v-eyebrow">Your brand</p>
          <h1>Store page</h1>
          <p className="v-page-head__lead">This is how buyers meet your studio on Haanta: your cover photo, your name and your story.</p>
        </div>
        {previewUrl ? (
          <a className="h-btn h-btn--secondary" href={previewUrl} target="_blank" rel="noopener noreferrer">
            Open on the storefront<span className="h-sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>

      <section className="v-progress-card" aria-labelledby="progress-h" data-testid="store-checklist">
        <div className="v-progress-card__head">
          <h2 id="progress-h">{done === items.length ? "Your page is complete" : "Complete your page"}</h2>
          <p>
            {done} of {items.length} done
          </p>
        </div>
        <div className="v-meter" aria-hidden="true">
          <span style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
        </div>
        <ul className="v-checklist">
          {items.map((i) => (
            <li key={i.label} className={i.done ? "is-done" : undefined}>
              <span className="v-checklist__mark" aria-hidden="true" />
              {i.label}
              <span className="h-sr-only">{i.done ? ": done" : ": to do"}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="v-store">
        <div className="v-store__form">
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
        </div>
        <section className="v-store__preview" aria-labelledby="preview-h">
          <div className="v-card__head">
            <h2 id="preview-h">Preview</h2>
            <p className="v-card__meta">As buyers see it · saved version</p>
          </div>
          {/* Mirrors the storefront's designer page introduction (copy beside the cover photo). */}
          <article className="v-shop-preview" data-testid="store-preview">
            <div className="v-shop-preview__cover">{s.banner_url ? <Image src={s.banner_url} alt="" width={640} height={800} unoptimized /> : <span className="v-shop-preview__empty">Your cover photo</span>}</div>
            <div className="v-shop-preview__copy">
              {s.logo_url ? <Image className="v-shop-preview__logo" src={s.logo_url} alt={`${s.name} logo`} width={56} height={56} unoptimized /> : null}
              <p className="v-shop-preview__eyebrow">{s.region ? `Designer · ${s.region}` : "Designer"}</p>
              <h3 className="v-shop-preview__name">{s.name}</h3>
              {story ? <p className="v-shop-preview__lead">{excerpt(story)}</p> : <p className="v-shop-preview__lead v-muted">Your story appears here.</p>}
              <span className="v-shop-preview__link">Shop the collection</span>
            </div>
          </article>
          {s.story || s.size_notes || s.policies ? (
            <div className="v-shop-preview__more">
              {s.story ? (
                <>
                  <h4>The story</h4>
                  {/* Sanitised by the Haanta API (allow-list) before storage; rendered as the storefront does. */}
                  <div className="v-prose" dangerouslySetInnerHTML={{ __html: s.story }} />
                </>
              ) : null}
              {s.size_notes ? (
                <>
                  <h4>Sizing</h4>
                  <p>{s.size_notes}</p>
                </>
              ) : null}
              {s.policies ? (
                <>
                  <h4>Policies</h4>
                  <p style={{ whiteSpace: "pre-line" }}>{s.policies}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </>
  )
}
