/**
 * Display order for product option values. Catalog values arrive in entry order (e.g. "US 16, US 8, US 4"),
 * so sizes are sorted: letter sizes smallest → largest, then numeric sizes ascending, then anything else
 * (e.g. "One size", "Custom") in its original order. Other options (colour, fabric) keep their order.
 */
const LETTER_RANK: Record<string, number> = {
  XXXS: 0, "3XS": 0, XXS: 1, "2XS": 1, XS: 2, S: 3, SMALL: 3, M: 4, MEDIUM: 4, L: 5, LARGE: 5, XL: 6,
  XXL: 7, "2XL": 7, XXXL: 8, "3XL": 8, "4XL": 9, "5XL": 10, "6XL": 11,
}

const isSizeOption = (title: string) => /size|fit|length|waist/i.test(title)

function sizeKey(value: string): [number, number] {
  const v = value.trim().toUpperCase()
  // Letter size, alone or with a region prefix/suffix ("UK M", "M (US 8)").
  const letter = v.match(/(?:^|[\s(/-])(XXXS|3XS|XXS|2XS|XS|S|SMALL|M|MEDIUM|L|LARGE|XL|XXL|2XL|XXXL|3XL|4XL|5XL|6XL)(?=$|[\s)/-])/)
  if (letter) return [0, LETTER_RANK[letter[1]!]!]
  const num = v.match(/\d+(?:\.\d+)?/)
  if (num) return [1, Number(num[0])]
  return [2, 0]
}

export function sortOptionValues<T extends { value: string }>(title: string, values: T[]): T[] {
  if (!isSizeOption(title)) return values
  return values
    .map((v, i) => ({ v, i, k: sizeKey(v.value) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i)
    .map((x) => x.v)
}

