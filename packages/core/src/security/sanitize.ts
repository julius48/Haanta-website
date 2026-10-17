import sanitizeHtml from "sanitize-html"

/**
 * Allow-list sanitiser for rich text (product descriptions, brand stories, journal excerpts).
 * The Wix export contains raw HTML, so everything passes through here before storage AND render.
 */
const RICH_TEXT: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a", "span"],
  allowedAttributes: { a: ["href", "title", "rel", "target"] },
  allowedSchemes: ["https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: "noopener noreferrer nofollow", ...(attribs.target ? { target: "_blank" } : {}) },
    }),
    // Wix uses <div> and <h1> freely; map them to safe equivalents instead of dropping content.
    div: "p",
    h1: "h2",
  },
  exclusiveFilter: (frame) => (frame.tag === "p" || frame.tag === "span") && !frame.text.trim() && !frame.mediaChildren.length,
}

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return ""
  return sanitizeHtml(html, RICH_TEXT).trim()
}

/** Plain text only (reviews, notes, names): strip all tags, collapse whitespace, cap length. */
export function sanitizePlainText(text: string | null | undefined, maxLength = 5000): string {
  if (!text) return ""
  const stripped = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {}, disallowedTagsMode: "discard" })
  // sanitize-html escapes entities; decode the common ones back for plain storage.
  const decoded = stripped
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  // eslint-disable-next-line no-control-regex -- intentionally strips control characters
  return decoded.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, maxLength)
}

/** Text content of rich HTML, for meta descriptions and search indexing. */
export function htmlToText(html: string | null | undefined, maxLength = 300): string {
  const text = sanitizePlainText((html ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<\/p>/gi, " "), 100_000)
  return text.replace(/\s+/g, " ").slice(0, maxLength).trim()
}
