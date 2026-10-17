import { describe, expect, it } from "vitest"
import { sniffImageType, stripImageMetadata } from "../src"

const enc = (s: string) => Array.from(new TextEncoder().encode(s))
const has = (bytes: Uint8Array, s: string) => Buffer.from(bytes).includes(Buffer.from(s))

function jpegSegment(marker: number, payload: number[]) {
  const len = payload.length + 2
  return [0xff, marker, len >> 8, len & 255, ...payload]
}

function pngChunk(type: string, data: number[]) {
  const len = data.length
  return [(len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...enc(type), ...data, 0, 0, 0, 0]
}

function webpChunk(fourcc: string, data: number[]) {
  const size = data.length
  const pad = size % 2 ? [0] : []
  return [...enc(fourcc), size & 255, (size >> 8) & 255, (size >> 16) & 255, (size >>> 24) & 255, ...data, ...pad]
}

describe("stripImageMetadata", () => {
  it("removes EXIF/XMP/COM from JPEG and keeps image data", () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8,
      ...jpegSegment(0xe0, enc("JFIF\0")),
      ...jpegSegment(0xe1, enc("Exif\0\0GPS 6.45N 3.39E")),
      ...jpegSegment(0xe1, enc("http://ns.adobe.com/xap/1.0/ secret")),
      ...jpegSegment(0xfe, enc("comment with name")),
      ...jpegSegment(0xdb, [0, 1, 2, 3]),
      0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9,
    ])
    const out = stripImageMetadata(jpeg, "image/jpeg")
    expect(has(out, "GPS")).toBe(false)
    expect(has(out, "adobe")).toBe(false)
    expect(has(out, "comment")).toBe(false)
    expect(has(out, "JFIF")).toBe(true)
    expect(sniffImageType(out)).toBe("image/jpeg")
    expect(Array.from(out.slice(-5))).toEqual([0x11, 0x22, 0x33, 0xff, 0xd9])
  })

  it("removes eXIf and text chunks from PNG", () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
      ...pngChunk("eXIf", enc("GPS location")),
      ...pngChunk("tEXt", enc("Author\0Jane Buyer")),
      ...pngChunk("IDAT", [1, 2, 3]),
      ...pngChunk("IEND", []),
    ])
    const out = stripImageMetadata(png, "image/png")
    expect(has(out, "GPS")).toBe(false)
    expect(has(out, "Jane")).toBe(false)
    expect(has(out, "IHDR")).toBe(true)
    expect(has(out, "IDAT")).toBe(true)
    expect(has(out, "IEND")).toBe(true)
  })

  it("removes EXIF and XMP chunks from WebP and fixes the RIFF size", () => {
    const body = [
      ...enc("WEBP"),
      ...webpChunk("VP8X", [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ...webpChunk("VP8 ", [9, 9, 9, 9]),
      ...webpChunk("EXIF", enc("GPS here")),
      ...webpChunk("XMP ", enc("<x:xmpmeta/>")),
    ]
    const webp = Uint8Array.from([...enc("RIFF"), body.length & 255, (body.length >> 8) & 255, 0, 0, ...body])
    const out = stripImageMetadata(webp, "image/webp")
    expect(has(out, "GPS")).toBe(false)
    expect(has(out, "xmpmeta")).toBe(false)
    expect(sniffImageType(out)).toBe("image/webp")
    const riffSize = out[4]! | (out[5]! << 8) | (out[6]! << 16) | (out[7]! << 24)
    expect(riffSize).toBe(out.length - 8)
    // VP8X metadata flags cleared
    expect(out[20]! & 0x0c).toBe(0)
  })

  it("rejects malformed JPEGs", () => {
    expect(() => stripImageMetadata(Uint8Array.from([0xff, 0xd8, 0x00, 0x01]), "image/jpeg")).toThrow()
  })
})
