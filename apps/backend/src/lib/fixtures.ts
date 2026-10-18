/**
 * Local demo/e2e fixtures. The seed creates demo vendors (slugs end in "-demo") with four products
 * that e2e tests buy by direct URL. Those four products are kept out of search and listings so
 * shoppers only browse the real catalog; anything a demo vendor submits later and Haanta approves
 * goes live like any other product. Demo vendors are also left out of the designers list.
 */
export const FIXTURE_PRODUCT_HANDLES: ReadonlySet<string> = new Set([
  "adire-wrap-dress-adire-atelier-demo",
  "indigo-two-piece-set-adire-atelier-demo",
  "aso-oke-bomber-jacket-lekki-loom-demo",
  "ankara-shirt-lekki-loom-demo",
])

export const isFixtureVendor = (slug: string): boolean => slug.endsWith("-demo")
export const isFixtureProduct = (handle: string): boolean => FIXTURE_PRODUCT_HANDLES.has(handle)
