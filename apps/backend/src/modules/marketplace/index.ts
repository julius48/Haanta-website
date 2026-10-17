import { Module } from "@medusajs/framework/utils"
import { MarketplaceService } from "./service"

export const MARKETPLACE_MODULE = "marketplace"
export * from "./service"
export * from "./models"

export default Module(MARKETPLACE_MODULE, { service: MarketplaceService })
