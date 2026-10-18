import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { COOKIE, medusa } from "./medusa"
import { isCountryCode, type Country } from "@/lib/site"
import type { Region } from "@/lib/types"

/** Regions rarely change: cache for an hour. */
export const listRegions = cache(async (): Promise<Region[]> => {
  try {
    const { regions } = await medusa<{ regions: Region[] }>("/store/regions?fields=id,name,currency_code,*countries&limit=50", { revalidate: 3600, tags: ["regions"] })
    return regions
  } catch {
    return []
  }
})

export function regionForCountry(regions: Region[], country: Country): Region | null {
  return regions.find((r) => r.countries?.some((c) => c.iso_2.toLowerCase() === country)) ?? null
}

export const getCountry = cache(async (): Promise<Country> => {
  const v = (await cookies()).get(COOKIE.country)?.value
  return isCountryCode(v) ? v : "us"
})

/** The shopper's region from the `haanta_country` cookie (default US). */
export const getRegion = cache(async (): Promise<{ country: Country; region: Region | null; currency: "usd" | "cad" }> => {
  const country = await getCountry()
  const region = regionForCountry(await listRegions(), country)
  const currency = (region?.currency_code ?? (country === "ca" ? "cad" : "usd")).toLowerCase() === "cad" ? "cad" : "usd"
  return { country, region, currency }
})
