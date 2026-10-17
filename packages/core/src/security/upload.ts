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

/** Validate a declared upload before issuing a signed direct-upload signature. */
export function validateUploadRequest(input: { contentType: string; size: number }, maxBytes = MAX_IMAGE_BYTES): UploadProblem | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(input.contentType)) return "unsupported_type"
  if (!(input.size > 0)) return "empty"
  if (input.size > maxBytes) return "too_large"
  return null
}
