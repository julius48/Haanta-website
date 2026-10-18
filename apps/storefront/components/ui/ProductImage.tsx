import Image from "next/image"
import { canOptimize, safeImage } from "@/lib/images"

/** next/image with a graceful placeholder and unoptimised fallback for unknown hosts. */
export function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  src: string | null | undefined
  alt: string
  sizes: string
  priority?: boolean
  className?: string
}) {
  const url = safeImage(src)
  if (!url) {
    return (
      <div className={`s-img-placeholder ${className}`} role="img" aria-label={alt || "No image available"}>
        <span aria-hidden="true">Hààńtà</span>
      </div>
    )
  }
  return <Image src={url} alt={alt} fill sizes={sizes} priority={priority} unoptimized={!canOptimize(url)} className={`s-img ${className}`} />
}
