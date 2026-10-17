import { Module } from "@medusajs/framework/utils"
import { AuditService } from "./service"

export const AUDIT_MODULE = "audit"
export * from "./service"

export default Module(AUDIT_MODULE, { service: AuditService })
