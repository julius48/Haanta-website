"use client"

import Image from "next/image"
import { canOptimize, safeImage } from "@/lib/images"

/** Client-side twin of ProductImage (used inside client islands such as quick view). */
export function ProductImageClient({ src, alt, sizes }: { src: string | null | undefined; alt: string; sizes: string }) {
  const url = safeImage(src)
  if (!url) {
    return (
      <div className="s-img-placeholder" role="img" aria-label={alt || "No image available"}>
        <span aria-hidden="true">Hààńtà</span>
      </div>
    )
  }
  return <Image src={url} alt={alt} fill sizes={sizes} unoptimized={!canOptimize(url)} className="s-img" />
}
