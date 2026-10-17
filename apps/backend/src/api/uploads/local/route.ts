import { mkdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { stripImageMetadata, validateImageUpload } from "@haanta/core"
import { verifyLocalUploadSignature } from "../../../lib/adapters"

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const
const MAX = 10 * 1024 * 1024

function vendorOrigins(): string[] {
  return (process.env.VENDOR_CORS || "http://localhost:3001").split(",").map((s) => s.trim())
}

function cors(req: MedusaRequest, res: MedusaResponse) {
  const origin = req.headers.origin
  if (origin && vendorOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin)
    res.setHeader("Vary", "Origin")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "content-type")
  }
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  cors(req, res)
  res.status(204).end()
}

async function readBody(req: MedusaRequest, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error("too_large"), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Local stand-in for Cloudinary's signed direct upload (used when Cloudinary keys are absent).
 * Query string carries the signed fields; the body is the raw image bytes.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  cors(req, res)
  const q = req.query as Record<string, string>
  const { folder, public_id, content_type, size, expires, signature } = q
  if (!folder || !public_id || !content_type || !size || !expires || !signature) {
    res.status(400).json({ message: "Missing upload fields" })
    return
  }
  if (!/^vendors\/[A-Za-z0-9_]+\/(product|logo|banner)$|^reviews\/[A-Za-z0-9_]+$/.test(folder) || !/^[a-f0-9]{24}$/.test(public_id)) {
    res.status(400).json({ message: "Invalid upload target" })
    return
  }
  if (!verifyLocalUploadSignature(`${folder}|${public_id}|${content_type}|${size}|${expires}`, signature) || Number(expires) < Date.now()) {
    res.status(403).json({ message: "Upload signature invalid or expired" })
    return
  }
  let bytes: Buffer
  try {
    bytes = await readBody(req, Math.min(MAX, Number(size)))
  } catch {
    res.status(413).json({ message: "File too large" })
    return
  }
  if (bytes.length !== Number(size)) {
    res.status(400).json({ message: "Size does not match the signed upload" })
    return
  }
  const check = validateImageUpload(bytes, content_type)
  if (!check.ok) {
    res.status(400).json({ message: `Upload rejected: ${check.problem.replace("_", " ")}` })
    return
  }
  let clean: Uint8Array
  try {
    clean = stripImageMetadata(bytes, check.type)
  } catch {
    res.status(400).json({ message: "Upload rejected: malformed image" })
    return
  }
  const root = resolve(process.cwd(), "static", "uploads")
  const dir = resolve(root, folder)
  if (!dir.startsWith(root)) {
    res.status(400).json({ message: "Invalid upload target" })
    return
  }
  await mkdir(dir, { recursive: true })
  const file = `${public_id}.${EXT[check.type]}`
  await writeFile(join(dir, file), clean)
  const base = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  res.status(201).json({ secure_url: `${base}/static/uploads/${folder}/${file}`, bytes: clean.length, format: EXT[check.type] })
}
