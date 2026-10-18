import { getImageProps } from "next/image"
import { preload } from "react-dom"
import { canOptimize, safeImage } from "@/lib/images"

/**
 * Optimised image (same srcset/sizes as next/image) rendered as a plain server <img>: no client
 * component per image, so a 48-card listing hydrates nothing for its pictures. Priority images are
 * also preloaded with fetchpriority=high so the LCP image starts with the document.
 * Client components use ProductImageClient instead.
 */
export function ProductImage({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
  lite = false,
}: {
  src: string | null | undefined
  alt: string
  sizes: string
  priority?: boolean
  className?: string
  /** One 640px source and no srcset (secondary images such as the card hover image). */
  lite?: boolean
}) {
  const url = safeImage(src)
  if (!url) {
    return (
      <div className={`s-img-placeholder ${className}`} role="img" aria-label={alt || "No image available"}>
        <span aria-hidden="true">Hààńtà</span>
      </div>
    )
  }
  if (lite) {
    const liteSrc = canOptimize(url) ? `/_next/image?url=${encodeURIComponent(url)}&w=640&q=75` : url
    // eslint-disable-next-line @next/next/no-img-element -- deliberately a single lazy source
    return <img src={liteSrc} alt={alt} loading="lazy" decoding="async" className={`s-img s-img--fill ${className}`} />
  }
  const { props } = getImageProps({ src: url, alt, fill: true, sizes, priority, unoptimized: !canOptimize(url), className: `s-img ${className}` })
  if (priority) {
    preload(props.src, { as: "image", fetchPriority: "high", ...(props.srcSet ? { imageSrcSet: props.srcSet, imageSizes: props.sizes } : {}) })
  }
  // eslint-disable-next-line @next/next/no-img-element -- props come from next/image getImageProps
  return <img {...props} alt={alt} />
}
