/**
 * Local demo/e2e fixture vendors (created by the seed script, slugs end in "-demo"). Their products
 * stay buyable by direct URL so e2e tests have stable, well-stocked items, but they are kept out of
 * search, listings and the designers list so shoppers only ever browse the real catalog.
 */
export const isFixtureVendor = (slug: string): boolean => slug.endsWith("-demo")
