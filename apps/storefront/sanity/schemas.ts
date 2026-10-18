/**
 * Sanity schema types for Haanta editorial content, documented as plain objects (no Sanity packages
 * are installed in this repo). Paste into a Sanity Studio project as `defineType(...)` calls; the
 * shapes match the GROQ projections in lib/content.ts.
 */

interface Field {
  name: string
  title: string
  type: string
  description?: string
  of?: { type: string; to?: { type: string }[] }[]
  to?: { type: string }[]
  options?: Record<string, unknown>
  fields?: Field[]
  validation?: string
}

interface SchemaType {
  name: string
  title: string
  type: "document" | "object"
  fields: Field[]
}

export const homepage: SchemaType = {
  name: "homepage",
  title: "Homepage",
  type: "document",
  fields: [
    {
      name: "hero",
      title: "Hero",
      type: "object",
      fields: [
        { name: "eyebrow", title: "Eyebrow", type: "string", description: "e.g. Curated Africa" },
        { name: "headline", title: "Headline (Cinzel)", type: "string", description: "e.g. Style. Story. Soul." },
        { name: "subheadline", title: "Subheadline", type: "text" },
        { name: "ctaLabel", title: "Primary button label", type: "string" },
        { name: "ctaHref", title: "Primary button link", type: "string" },
        { name: "secondaryCtaLabel", title: "Secondary button label", type: "string" },
        { name: "secondaryCtaHref", title: "Secondary button link", type: "string" },
      ],
    },
    {
      name: "pillars",
      title: "Brand pillars",
      type: "array",
      of: [{ type: "object" }],
      fields: [
        { name: "title", title: "Title", type: "string" },
        { name: "body", title: "Body", type: "text" },
      ],
    },
    { name: "brandSpotlights", title: "Brand spotlights", type: "array", of: [{ type: "reference", to: [{ type: "brandSpotlight" }] }] },
  ],
}

export const shop: SchemaType = {
  name: "shop",
  title: "Curated shop",
  type: "document",
  fields: [
    { name: "title", title: "Title", type: "string", validation: "required" },
    { name: "slug", title: "Slug", type: "slug", options: { source: "title" }, description: "Must match the backend shop tag, e.g. vacay-bae", validation: "required" },
    { name: "tagline", title: "Tagline", type: "string" },
    { name: "description", title: "Description", type: "text" },
    { name: "image", title: "Hero image", type: "image", options: { hotspot: true } },
    { name: "orderRank", title: "Order", type: "number" },
  ],
}

export const journalPost: SchemaType = {
  name: "journalPost",
  title: "Journal post",
  type: "document",
  fields: [
    { name: "title", title: "Title", type: "string", validation: "required" },
    { name: "slug", title: "Slug", type: "slug", options: { source: "title" }, validation: "required" },
    { name: "excerpt", title: "Excerpt", type: "text" },
    { name: "publishedAt", title: "Published", type: "date" },
    { name: "author", title: "Author", type: "string" },
    { name: "coverImage", title: "Cover image", type: "image", options: { hotspot: true } },
    { name: "tags", title: "Tags", type: "array", of: [{ type: "string" }] },
    { name: "body", title: "Body", type: "array", of: [{ type: "block" }], description: "Rendered as plain paragraphs (pt::text)" },
  ],
}

export const banner: SchemaType = {
  name: "banner",
  title: "Banner",
  type: "document",
  fields: [
    { name: "message", title: "Message", type: "string", validation: "required" },
    { name: "href", title: "Link", type: "string" },
    { name: "placement", title: "Placement", type: "string", options: { list: ["announcement", "home"] } },
    { name: "active", title: "Active", type: "boolean" },
  ],
}

export const brandSpotlight: SchemaType = {
  name: "brandSpotlight",
  title: "Brand spotlight",
  type: "document",
  fields: [
    { name: "brandSlug", title: "Brand slug", type: "string", description: "Vendor slug from the backend (links to /brands/[slug])", validation: "required" },
    { name: "name", title: "Display name", type: "string" },
    { name: "tagline", title: "Tagline", type: "string" },
    { name: "story", title: "Story (short)", type: "text" },
    { name: "region", title: "Region", type: "string" },
  ],
}

export const schemaTypes = [homepage, shop, journalPost, banner, brandSpotlight]
