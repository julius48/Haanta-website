/**
 * Image upload rules: JPEG, PNG and WebP only (detected by magic bytes, not by name or declared
 * type), size-limited, no SVG. EXIF is stripped by re-encoding in the backend (sharp) or by the
 * Cloudinary upload preset. Uploads are signed and direct; the server never fetches user URLs.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024

export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return "image/png"
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

export type UploadProblem = "empty" | "too_large" | "unsupported_type" | "type_mismatch"

export function validateImageUpload(
  bytes: Uint8Array,
  declaredType: string | undefined,
  maxBytes = MAX_IMAGE_BYTES,
): { ok: true; type: AllowedImageType } | { ok: false; problem: UploadProblem } {
  if (bytes.length === 0) return { ok: false, problem: "empty" }
  if (bytes.length > maxBytes) return { ok: false, problem: "too_large" }
  const sniffed = sniffImageType(bytes)
  if (!sniffed) return { ok: false, problem: "unsupported_type" }
  if (declaredType && declaredType !== sniffed) return { ok: false, problem: "type_mismatch" }
  return { ok: true, type: sniffed }
}

/**
 * Remove metadata (EXIF, XMP, comments, text chunks) without re-encoding:
 *   JPEG: drop APP1..APP15 (except APP14 Adobe colour info) and COM segments
 *   PNG:  drop eXIf, tEXt, iTXt, zTXt and tIME chunks
 *   WebP: drop EXIF and XMP  chunks and clear the VP8X metadata flags
 * Returns a new buffer; throws if the structure is malformed.
 */
export function stripImageMetadata(bytes: Uint8Array, type: AllowedImageType): Uint8Array {
  if (type === "image/jpeg") return stripJpeg(bytes)
  if (type === "image/png") return stripPng(bytes)
  return stripWebp(bytes)
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const out: number[] = [0xff, 0xd8]
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error("Malformed JPEG")
    const marker = b[i + 1]!
    // Start of scan: copy the rest (entropy-coded data + EOI) verbatim.
    if (marker === 0xda) {
      for (let j = i; j < b.length; j++) out.push(b[j]!)
      return Uint8Array.from(out)
    }
    if (marker === 0xd9) {
      out.push(0xff, 0xd9)
      return Uint8Array.from(out)
    }
    if (i + 3 >= b.length) throw new Error("Malformed JPEG")
    const len = (b[i + 2]! << 8) | b[i + 3]!
    const end = i + 2 + len
    if (len < 2 || end > b.length) throw new Error("Malformed JPEG")
    const isMetadata = (marker >= 0xe1 && marker <= 0xef && marker !== 0xee) || marker === 0xfe
    if (!isMetadata) for (let j = i; j < end; j++) out.push(b[j]!)
    i = end
  }
  throw new Error("Malformed JPEG")
}

function stripPng(b: Uint8Array): Uint8Array {
  const drop = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"])
  const out: number[] = Array.from(b.slice(0, 8))
  let i = 8
  while (i + 8 <= b.length) {
    const len = ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!
    const type = String.fromCharCode(...b.slice(i + 4, i + 8))
    const end = i + 12 + len
    if (end > b.length) throw new Error("Malformed PNG")
    if (!drop.has(type)) for (let j = i; j < end; j++) out.push(b[j]!)
    i = end
    if (type === "IEND") break
  }
  return Uint8Array.from(out)
}

function stripWebp(b: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  let i = 12
  while (i + 8 <= b.length) {
    const fourcc = String.fromCharCode(...b.slice(i, i + 4))
    const size = b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | ((b[i + 7]! << 24) >>> 0)
    const end = i + 8 + size + (size % 2)
    if (end > b.length + 1) throw new Error("Malformed WebP")
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = b.slice(i, Math.min(end, b.length))
      if (fourcc === "VP8X" && chunk.length > 8) chunk[8] = chunk[8]! & ~0x0c // clear EXIF (0x08) and XMP (0x04) flags
      chunks.push(chunk)
    }
    i = end
  }
  const body = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(12 + body)
  out.set(b.slice(0, 12))
  const riffSize = 4 + body
  out[4] = riffSize & 255
  out[5] = (riffSize >> 8) & 255
  out[6] = (riffSize >> 16) & 255
  out[7] = (riffSize >>> 24) & 255
  let o = 12
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

/** Validate a declared upload before issuing a signed direct-upload signature. */
export function validateUploadRequest(input: { contentType: string; size: number }, maxBytes = MAX_IMAGE_BYTES): UploadProblem | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(input.contentType)) return "unsupported_type"
  if (!(input.size > 0)) return "empty"
  if (input.size > maxBytes) return "too_large"
  return null
}
