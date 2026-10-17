import { Module } from "@medusajs/framework/utils"
import { HaantaSettingsService } from "./service"

export const HAANTA_SETTINGS_MODULE = "haantaSettings"
export * from "./service"

export default Module(HAANTA_SETTINGS_MODULE, { service: HaantaSettingsService })
