import { MedusaService } from "@medusajs/framework/utils"
import { Setting } from "./models"
import { SETTINGS_SCHEMAS, type SettingsKey, type SettingsValue } from "../../lib/settings-schemas"



function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== "object" || Array.isArray(override)) return (override ?? base) as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k]
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v) ? deepMerge(b, v) : v
  }
  return out as T
}

export class HaantaSettingsService extends MedusaService({ Setting }) {
  /** Stored overrides merged onto defaults and validated. Invalid stored data falls back to defaults. */
  async getSettings<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
    const def = SETTINGS_SCHEMAS[key]
    const [row] = await this.listSettings({ key })
    const merged = deepMerge(def.defaults, row?.value ?? {})
    const parsed = def.schema.safeParse(merged)
    return (parsed.success ? parsed.data : def.defaults) as SettingsValue<K>
  }

  /** Validate and store. Returns before/after for the audit log. */
  async putSettings<K extends SettingsKey>(key: K, value: unknown, actorId: string) {
    const def = SETTINGS_SCHEMAS[key]
    const before = await this.getSettings(key)
    const after = def.schema.parse(deepMerge(before, value)) as SettingsValue<K>
    const [row] = await this.listSettings({ key })
    if (row) await this.updateSettings({ id: row.id, value: after as Record<string, unknown>, version: row.version + 1, updated_by: actorId })
    else await this.createSettings({ key, value: after as Record<string, unknown>, updated_by: actorId })
    return { before, after }
  }
}
