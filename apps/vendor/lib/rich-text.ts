/**
 * Simple formatting for product descriptions and brand stories. Vendors type plain text with a
 * few Markdown-like marks; the portal server converts it to basic HTML, and the backend sanitises
 * that HTML with its allow-list before storing it.
 *
 *   Blank line        → new paragraph
 *   **bold**          → <strong>
 *   _italic_          → <em>
 *   - item / * item   → bulleted list
 *   1. item           → numbered list
 */

export const FORMATTING_HELP = "Leave a blank line between paragraphs. **bold**, _italic_, start lines with “- ” for a bulleted list or “1. ” for a numbered list."

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_(?=\S)(.+?)(?<=\S)_(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>")
}

const BULLET = /^\s*[-*•]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/

/** Plain text with light marks → basic HTML. */
export function liteToHtml(text: string): string {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").filter((l) => l.trim() !== ""))
    .filter((lines) => lines.length > 0)
  return blocks
    .map((lines) => {
      if (lines.every((l) => BULLET.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(BULLET, "").trim())}</li>`).join("")}</ul>`
      if (lines.every((l) => NUMBERED.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(NUMBERED, "").trim())}</li>`).join("")}</ol>`
      return `<p>${lines.map((l) => inline(l.trim())).join("<br>")}</p>`
    })
    .join("")
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
}

/** Sanitised HTML from the API → the editable light-marks text (inverse of liteToHtml). */
export function htmlToLite(html: string | null | undefined): string {
  if (!html) return ""
  let s = html.replace(/\r?\n/g, " ")
  s = s.replace(/<\s*(strong|b)\b[^>]*>(.*?)<\s*\/\s*\1\s*>/gi, "**$2**")
  s = s.replace(/<\s*(em|i)\b[^>]*>(.*?)<\s*\/\s*\1\s*>/gi, "_$2_")
  s = s.replace(/<\s*ul\b[^>]*>(.*?)<\s*\/\s*ul\s*>/gi, (_, inner: string) => `\n\n${listItems(inner).map((li) => `- ${li}`).join("\n")}\n\n`)
  s = s.replace(/<\s*ol\b[^>]*>(.*?)<\s*\/\s*ol\s*>/gi, (_, inner: string) => `\n\n${listItems(inner).map((li, i) => `${i + 1}. ${li}`).join("\n")}\n\n`)
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n")
  s = s.replace(/<\s*\/\s*(p|div|h[1-6])\s*>/gi, "\n\n")
  s = s.replace(/<[^>]*>/g, "")
  return decodeEntities(s)
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function listItems(inner: string): string[] {
  const out: string[] = []
  const re = /<\s*li\b[^>]*>(.*?)<\s*\/\s*li\s*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(inner))) out.push(m[1]!.replace(/<[^>]*>/g, (t) => (/^<\s*\/?\s*(strong|b|em|i)\b/i.test(t) ? t : "")).trim())
  return out
}
