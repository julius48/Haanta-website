import { ProductImage } from "@/components/ui/ProductImage"

/** CSS scroll-snap gallery with thumbnail anchors: no JavaScript needed. */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const list = images.length ? images : [null]
  return (
    <div className="s-gallery">
      <ul className="s-gallery__track" aria-label={`${title} images`} tabIndex={0}>
        {list.map((src, i) => (
          <li key={`${src ?? "none"}-${i}`} id={`img-${i + 1}`} className="s-gallery__slide">
            <ProductImage src={src} alt={`${title}, image ${i + 1} of ${list.length}`} sizes="(min-width: 1024px) 50vw, 100vw" priority={i === 0} />
          </li>
        ))}
      </ul>
      {list.length > 1 ? (
        <ul className="s-gallery__thumbs" aria-label="Choose image">
          {list.map((src, i) => (
            <li key={`t-${src ?? "none"}-${i}`}>
              <a href={`#img-${i + 1}`} className="s-gallery__thumb">
                <ProductImage src={src} alt="" sizes="72px" />
                <span className="h-sr-only">Show image {i + 1}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
