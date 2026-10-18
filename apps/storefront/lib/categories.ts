/** Category tree (mirrors packages/core CATEGORY_TREE; duplicated so client code never imports @haanta/core main). */
export interface CategoryNode {
  handle: string
  name: string
  children: { handle: string; name: string }[]
}

export const CATEGORIES: CategoryNode[] = [
  {
    handle: "women",
    name: "Women",
    children: [
      { handle: "women/dresses", name: "Dresses" },
      { handle: "women/tops", name: "Tops" },
      { handle: "women/bottoms", name: "Bottoms" },
      { handle: "women/sets", name: "Sets" },
      { handle: "women/jumpsuits", name: "Jumpsuits" },
      { handle: "women/jackets", name: "Jackets & Suits" },
      { handle: "women/beachwear", name: "Beachwear" },
    ],
  },
  {
    handle: "men",
    name: "Men",
    children: [
      { handle: "men/tops", name: "Tops" },
      { handle: "men/bottoms", name: "Bottoms" },
      { handle: "men/sets", name: "Sets" },
      { handle: "men/jackets", name: "Jackets & Suits" },
      { handle: "men/kaftans", name: "Kaftans & Agbada" },
    ],
  },
  { handle: "kids", name: "Kids", children: [] },
  {
    handle: "accessories",
    name: "Accessories",
    children: [
      { handle: "accessories/jewellery", name: "Jewellery" },
      { handle: "accessories/bags", name: "Bags" },
      { handle: "accessories/shoes", name: "Shoes" },
      { handle: "accessories/headwear", name: "Caps & Headwear" },
    ],
  },
  {
    handle: "beauty",
    name: "Beauty",
    children: [
      { handle: "beauty/hair", name: "Hair" },
      { handle: "beauty/skincare", name: "Skincare" },
      { handle: "beauty/fragrance", name: "Perfume Oils" },
    ],
  },
  {
    handle: "home",
    name: "Home & Art",
    children: [
      { handle: "home/furniture", name: "Furniture" },
      { handle: "home/art", name: "Art & Decor" },
    ],
  },
]

const FLAT = new Map<string, { name: string; parent: CategoryNode | null }>()
for (const c of CATEGORIES) {
  FLAT.set(c.handle, { name: c.name, parent: null })
  for (const ch of c.children) FLAT.set(ch.handle, { name: ch.name, parent: c })
}

export function allCategoryHandles(): string[] {
  return [...FLAT.keys()]
}

export function findCategory(handle: string): { handle: string; name: string; parent: CategoryNode | null } | null {
  const c = FLAT.get(handle)
  return c ? { handle, ...c } : null
}

/** "women/dresses" → "Women: Dresses"; unknown handles are title-cased. */
export function categoryLabel(handle: string): string {
  const c = FLAT.get(handle)
  if (!c) {
    const last = handle.split("/").pop() ?? handle
    return last.replace(/[-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
  }
  return c.parent ? `${c.parent.name}: ${c.name}` : c.name
}
