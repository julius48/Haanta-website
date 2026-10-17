import { Module } from "@medusajs/framework/utils"
import { SecurityService } from "./service"

export const SECURITY_MODULE = "security"
export * from "./service"

export default Module(SECURITY_MODULE, { service: SecurityService })
