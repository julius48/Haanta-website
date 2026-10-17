/** Image upload rules (mirrors the backend's UploadSignBody) and helpers for signed direct uploads. */

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number]
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export type UploadPurpose = "product" | "logo" | "banner"

export interface UploadSignature {
  provider: "cloudinary" | "local"
  upload_url: string
  fields: Record<string, string>
  expires_at: string
}

export type FileCheck = { ok: true; type: AcceptedImageType } | { ok: false; message: string }

export function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type)
}

/** Client-side check before asking for a signature (the backend and Cloudinary check again). */
export function validateUploadFile(file: { name: string; type: string; size: number }): FileCheck {
  if (!isAcceptedImageType(file.type)) return { ok: false, message: `${file.name}: use a JPEG, PNG or WebP image.` }
  if (file.size <= 0) return { ok: false, message: `${file.name}: the file is empty.` }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: `${file.name}: images must be 10 MB or smaller.` }
  return { ok: true, type: file.type }
}

/** Local provider: raw bytes are POSTed to `upload_url?<fields>`. */
export function localUploadUrl(sig: Pick<UploadSignature, "upload_url" | "fields">): string {
  const u = new URL(sig.upload_url)
  for (const [k, v] of Object.entries(sig.fields)) u.searchParams.set(k, v)
  return u.toString()
}

/** Only upload to Cloudinary or the Haanta backend, whatever the signature says. */
export function isAllowedUploadTarget(uploadUrl: string, backendUrl: string): boolean {
  try {
    const u = new URL(uploadUrl)
    if (u.protocol === "https:" && u.hostname === "api.cloudinary.com") return true
    return u.origin === new URL(backendUrl).origin && u.pathname === "/uploads/local"
  } catch {
    return false
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
