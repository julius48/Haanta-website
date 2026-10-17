/**
 * Static category list for the product form. Mirrors CATEGORY_TREE in
 * packages/core/src/catalog/mapping.ts. Medusa stores each category with the path's slashes
 * replaced by dashes as its handle (see apps/backend/src/lib/setup-store.ts); ids are resolved
 * server-side from the handle, so the browser never deals with category ids.
 */
export interface CategoryOption {
  /** Path as used in the catalog mapping, e.g. "women/dresses". */
  path: string
  /** Medusa product_category handle, e.g. "women-dresses". */
  handle: string
  name: string
  parent: string | null
}

const TREE: { path: string; name: string; parent: string | null }[] = [
  { path: "women", name: "Women", parent: null },
  { path: "women/dresses", name: "Dresses", parent: "women" },
  { path: "women/tops", name: "Tops", parent: "women" },
  { path: "women/bottoms", name: "Bottoms", parent: "women" },
  { path: "women/sets", name: "Sets", parent: "women" },
  { path: "women/jumpsuits", name: "Jumpsuits", parent: "women" },
  { path: "women/jackets", name: "Jackets & Suits", parent: "women" },
  { path: "women/beachwear", name: "Beachwear", parent: "women" },
  { path: "men", name: "Men", parent: null },
  { path: "men/tops", name: "Tops", parent: "men" },
  { path: "men/bottoms", name: "Bottoms", parent: "men" },
  { path: "men/sets", name: "Sets", parent: "men" },
  { path: "men/jackets", name: "Jackets & Suits", parent: "men" },
  { path: "men/kaftans", name: "Kaftans & Agbada", parent: "men" },
  { path: "kids", name: "Kids", parent: null },
  { path: "accessories", name: "Accessories", parent: null },
  { path: "accessories/jewellery", name: "Jewellery", parent: "accessories" },
  { path: "accessories/bags", name: "Bags", parent: "accessories" },
  { path: "accessories/shoes", name: "Shoes", parent: "accessories" },
  { path: "accessories/headwear", name: "Caps & Headwear", parent: "accessories" },
  { path: "beauty", name: "Beauty", parent: null },
  { path: "beauty/hair", name: "Hair", parent: "beauty" },
  { path: "beauty/skincare", name: "Skincare", parent: "beauty" },
  { path: "beauty/fragrance", name: "Perfume Oils", parent: "beauty" },
  { path: "home", name: "Home & Art", parent: null },
  { path: "home/furniture", name: "Furniture", parent: "home" },
  { path: "home/art", name: "Art & Decor", parent: "home" },
]

export const CATEGORIES: CategoryOption[] = TREE.map((c) => ({ ...c, handle: categoryHandle(c.path) }))

export function categoryHandle(path: string): string {
  return path.replace(/\//g, "-")
}

export function isKnownCategory(path: string): boolean {
  return CATEGORIES.some((c) => c.path === path)
}

/** Groups for a <select> with <optgroup>s: each top-level category with its children. */
export function categoryGroups(): { group: CategoryOption; children: CategoryOption[] }[] {
  return CATEGORIES.filter((c) => c.parent === null).map((group) => ({ group, children: CATEGORIES.filter((c) => c.parent === group.path) }))
}

export function categoryLabel(path: string): string {
  const c = CATEGORIES.find((x) => x.path === path)
  if (!c) return path
  const parent = c.parent ? CATEGORIES.find((x) => x.path === c.parent) : null
  return parent ? `${parent.name} › ${c.name}` : c.name
}
